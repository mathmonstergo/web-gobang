import { describe, expect, it, vi } from "vitest";

import {
  createInitialRoomState,
  disconnectPlayer,
  joinRoom,
  placeOnlineStone,
  receiveHeartbeat,
  startGame
} from "./room-state";
import {
  type ClientMessage,
  type JoinRoomInput,
  type OnlineRoomState,
  type ServerMessage
} from "./protocol";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    protected readonly ctx: unknown;
    protected readonly env: unknown;

    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  }
}));

const { GobangRoom } = await import("./room-object");

class TestStorage {
  private readonly values = new Map<string, unknown>();

  seedRoomState(state: OnlineRoomState): void {
    this.values.set("room-state-v1", state);
  }

  get(key: string): Promise<unknown> {
    return Promise.resolve(this.values.get(key));
  }

  put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

describe("GobangRoom Durable Object", () => {
  it("loads room creation state across object instance recreation", async () => {
    const storage = new TestStorage();
    const firstInstance = createRoomObject(storage);
    const secondInstance = createRoomObject(storage);

    const createResponse = await firstInstance.fetch(roomRequest("/create", "POST"));
    expect(createResponse.ok).toBe(true);

    const statusResponse = await secondInstance.fetch(roomRequest("/status", "GET"));
    const status = await statusResponse.json();

    expect(status).toEqual({
      exists: true,
      joinable: true,
      reason: "joinable"
    });
  });

  it("expires disconnected slots before reporting room joinability", async () => {
    const storage = new TestStorage();
    const disconnected = disconnectPlayer(
      disconnectPlayer(twoPlayerRoom(), "black-id", 0),
      "white-id",
      0
    );
    storage.seedRoomState(disconnected);
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(301001);

    try {
      const room = createRoomObject(storage);
      const statusResponse = await room.fetch(roomRequest("/status", "GET"));
      const status = await statusResponse.json();

      expect(status).toEqual({
        exists: true,
        joinable: true,
        reason: "joinable"
      });
    } finally {
      dateNow.mockRestore();
    }
  });

  it("expires rooms that never reached playing after ten minutes on status access", async () => {
    const storage = new TestStorage();
    storage.seedRoomState({
      ...twoPlayerRoom(),
      lastActivityAt: 0
    });
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(600001);

    try {
      const room = createRoomObject(storage);
      const statusResponse = await room.fetch(roomRequest("/status", "GET"));
      const status = await statusResponse.json();

      expect(status).toEqual({
        exists: false,
        joinable: false,
        reason: "not-found"
      });
    } finally {
      dateNow.mockRestore();
    }
  });

  it("waits for explicit start and emits assigned color notifications", async () => {
    const storage = new TestStorage();
    const room = createRoomObject(storage);
    const blackSocket = new CapturingWebSocket();
    const whiteSocket = new CapturingWebSocket();
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(10);
    const random = vi.spyOn(Math, "random").mockReturnValue(0.9);
    const internals = getRoomInternals(room);
    internals.roomState = twoPlayerRoom();
    internals.sockets.set(blackSocket.asWebSocket(), { playerId: "black-id" });
    internals.sockets.set(whiteSocket.asWebSocket(), { playerId: "white-id" });

    try {
      for (let count = 0; count < 3; count += 1) {
        await sendClientMessage(room, blackSocket, {
          type: "heartbeat",
          gameNumber: 1,
          sentAt: count
        });
      }
      for (let count = 0; count < 3; count += 1) {
        await sendClientMessage(room, whiteSocket, {
          type: "heartbeat",
          gameNumber: 1,
          sentAt: count
        });
      }

      expect(notificationEvents(blackSocket)).not.toContain("game-started");
      expect(notificationEvents(whiteSocket)).not.toContain("game-started");

      await sendClientMessage(room, blackSocket, { type: "start_game" });

      expect(notificationEvents(blackSocket)).toContain("game-started");
      expect(notificationEvents(whiteSocket)).toContain("game-started");
      expect(notificationTexts(blackSocket)).toContain("你本局随机为白棋");
      expect(notificationTexts(whiteSocket)).toContain("你本局随机为黑棋");
    } finally {
      dateNow.mockRestore();
      random.mockRestore();
    }
  });

  it("emits an undo-requested notification to the opponent", async () => {
    const storage = new TestStorage();
    const room = createRoomObject(storage);
    const blackSocket = new CapturingWebSocket();
    const whiteSocket = new CapturingWebSocket();
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(21);
    const internals = getRoomInternals(room);
    internals.roomState = expectMutation(
      placeOnlineStone(playingRoom(10), "black-id", { row: 7, col: 7 }, 20)
    );
    internals.sockets.set(blackSocket.asWebSocket(), { playerId: "black-id" });
    internals.sockets.set(whiteSocket.asWebSocket(), { playerId: "white-id" });

    try {
      await sendClientMessage(room, blackSocket, { type: "request_undo" });

      expect(notificationEvents(whiteSocket)).toContain("undo-requested");
    } finally {
      dateNow.mockRestore();
    }
  });

  it("emits a game-ended notification when a move wins the game", async () => {
    const storage = new TestStorage();
    const room = createRoomObject(storage);
    const blackSocket = new CapturingWebSocket();
    const whiteSocket = new CapturingWebSocket();
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(100);
    const internals = getRoomInternals(room);
    internals.roomState = almostWonByBlackRoom();
    internals.sockets.set(blackSocket.asWebSocket(), { playerId: "black-id" });
    internals.sockets.set(whiteSocket.asWebSocket(), { playerId: "white-id" });

    try {
      await sendClientMessage(room, blackSocket, {
        type: "place",
        row: 7,
        col: 11
      });

      expect(notificationEvents(blackSocket)).toContain("game-ended");
      expect(notificationEvents(whiteSocket)).toContain("game-ended");
    } finally {
      dateNow.mockRestore();
    }
  });

  it("emits surrender request and accept notifications", async () => {
    const storage = new TestStorage();
    const room = createRoomObject(storage);
    const blackSocket = new CapturingWebSocket();
    const whiteSocket = new CapturingWebSocket();
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(21);
    const internals = getRoomInternals(room);
    internals.roomState = expectMutation(
      placeOnlineStone(playingRoom(10), "black-id", { row: 7, col: 7 }, 20)
    );
    internals.sockets.set(blackSocket.asWebSocket(), { playerId: "black-id" });
    internals.sockets.set(whiteSocket.asWebSocket(), { playerId: "white-id" });

    try {
      await sendClientMessage(room, blackSocket, { type: "request_surrender" });

      expect(notificationEvents(whiteSocket)).toContain("surrender-requested");
      const request = internals.roomState.pendingRequest;
      if (request === null) {
        throw new Error("Expected surrender request");
      }

      dateNow.mockReturnValue(22);
      await sendClientMessage(room, whiteSocket, {
        type: "respond_surrender",
        requestId: request.requestId,
        accept: true
      });

      expect(notificationEvents(blackSocket)).toContain("surrender-accepted");
      expect(notificationEvents(whiteSocket)).toContain("surrender-accepted");
    } finally {
      dateNow.mockRestore();
    }
  });

  it("emits a new-game-started notification when an ended game resets", async () => {
    const storage = new TestStorage();
    const room = createRoomObject(storage);
    const blackSocket = new CapturingWebSocket();
    const whiteSocket = new CapturingWebSocket();
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(110);
    const internals = getRoomInternals(room);
    internals.roomState = expectMutation(
      placeOnlineStone(almostWonByBlackRoom(), "black-id", { row: 7, col: 11 }, 100)
    );
    internals.sockets.set(blackSocket.asWebSocket(), { playerId: "black-id" });
    internals.sockets.set(whiteSocket.asWebSocket(), { playerId: "white-id" });

    try {
      await sendClientMessage(room, blackSocket, { type: "start_game" });

      expect(notificationEvents(blackSocket)).toContain("game-started");
      expect(notificationEvents(whiteSocket)).toContain("game-started");
    } finally {
      dateNow.mockRestore();
    }
  });

  it("emits an opponent-disconnected notification on socket close", async () => {
    const storage = new TestStorage();
    const room = createRoomObject(storage);
    const blackSocket = new CapturingWebSocket();
    const whiteSocket = new CapturingWebSocket();
    const internals = getRoomInternals(room);
    internals.roomState = playingRoom(10);
    internals.sockets.set(blackSocket.asWebSocket(), { playerId: "black-id" });
    internals.sockets.set(whiteSocket.asWebSocket(), { playerId: "white-id" });

    await internals.handleClose(whiteSocket.asWebSocket());

    expect(notificationEvents(blackSocket)).toContain("opponent-disconnected");
  });
});

class CapturingWebSocket {
  readonly messages: string[] = [];

  send(message: string): void {
    this.messages.push(message);
  }

  asWebSocket(): WebSocket {
    return this as unknown as WebSocket;
  }
}

type RoomInternals = {
  roomState: OnlineRoomState | null;
  sockets: Map<WebSocket, { playerId: string }>;
  handleClose(socket: WebSocket): Promise<void>;
  handleMessage(socket: WebSocket, rawData: unknown): Promise<void>;
};

function getRoomInternals(room: InstanceType<typeof GobangRoom>): RoomInternals {
  return room as unknown as RoomInternals;
}

async function sendClientMessage(
  room: InstanceType<typeof GobangRoom>,
  socket: CapturingWebSocket,
  message: ClientMessage
): Promise<void> {
  await getRoomInternals(room).handleMessage(
    socket.asWebSocket(),
    JSON.stringify(message)
  );
}

function notificationEvents(socket: CapturingWebSocket): string[] {
  return socket.messages
    .map((message) => JSON.parse(message) as ServerMessage)
    .filter(
      (message): message is Extract<ServerMessage, { type: "notification" }> =>
        message.type === "notification"
    )
    .map((message) => message.event);
}

function notificationTexts(socket: CapturingWebSocket): string[] {
  return socket.messages
    .map((message) => JSON.parse(message) as ServerMessage)
    .filter(
      (message): message is Extract<ServerMessage, { type: "notification" }> =>
        message.type === "notification"
    )
    .map((message) => message.text);
}

function createRoomObject(storage: TestStorage): InstanceType<typeof GobangRoom> {
  return new GobangRoom(
    { storage } as unknown as DurableObjectState,
    {} as Env
  );
}

function roomRequest(pathname: string, method: "GET" | "POST"): Request {
  return new Request(`https://room.internal${pathname}`, {
    headers: { "x-room-code": "ABCDEF" },
    method
  });
}

function createRoom(): OnlineRoomState {
  return {
    ...createInitialRoomState("ABCDEF", 0),
    isCreated: true
  };
}

function twoPlayerRoom(): OnlineRoomState {
  const black = joinRoom(createRoom(), playerInput("black-id", "Ada"), 1);
  if (black.success === false) {
    throw new Error("Failed to join black player");
  }
  const white = joinRoom(black.state, playerInput("white-id", "Lin"), 2);
  if (white.success === false) {
    throw new Error("Failed to join white player");
  }
  return white.state;
}

function playingRoom(startedAt: number): OnlineRoomState {
  return expectMutation(startGame(stableRoom(startedAt), "black-id", startedAt, 0));
}

function stableRoom(startedAt: number): OnlineRoomState {
  let state = twoPlayerRoom();
  for (const playerId of ["black-id", "white-id"]) {
    for (let count = 0; count < 3; count += 1) {
      state = expectMutation(
        receiveHeartbeat(state, playerId, state.gameNumber, startedAt)
      );
    }
  }
  return state;
}

function almostWonByBlackRoom(): OnlineRoomState {
  let state = playingRoom(10);
  state = expectMutation(placeOnlineStone(state, "black-id", { row: 7, col: 7 }, 20));
  state = expectMutation(placeOnlineStone(state, "white-id", { row: 8, col: 7 }, 21));
  state = expectMutation(placeOnlineStone(state, "black-id", { row: 7, col: 8 }, 22));
  state = expectMutation(placeOnlineStone(state, "white-id", { row: 8, col: 8 }, 23));
  state = expectMutation(placeOnlineStone(state, "black-id", { row: 7, col: 9 }, 24));
  state = expectMutation(placeOnlineStone(state, "white-id", { row: 8, col: 9 }, 25));
  state = expectMutation(placeOnlineStone(state, "black-id", { row: 7, col: 10 }, 26));
  state = expectMutation(placeOnlineStone(state, "white-id", { row: 8, col: 10 }, 27));
  return state;
}

function playerInput(playerId: string, nickname: string): JoinRoomInput {
  return {
    playerId,
    sessionTokenHash: `${playerId}-token-hash`,
    nickname,
    avatarInitial: nickname.slice(0, 1),
    avatarColor: "#2f8f68"
  };
}

function expectMutation<TState>(
  result: { success: true; state: TState } | { success: false; error: string }
): TState {
  if (result.success === false) {
    throw new Error(result.error);
  }
  return result.state;
}
