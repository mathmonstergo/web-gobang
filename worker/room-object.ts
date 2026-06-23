import { DurableObject } from "cloudflare:workers";

import {
  disconnectPlayer,
  createInitialRoomState,
  getRoomJoinability,
  joinRoom,
  markRoomCreated,
  placeOnlineStone,
  receiveHeartbeat,
  requestSurrender,
  requestUndo,
  respondSurrender,
  respondUndo,
  startNewGame,
  toClientState
} from "./room-state";
import {
  type ClientMessage,
  type JoinRoomInput,
  type OnlineRoomMutationResult,
  type OnlineRoomState,
  type ServerMessage
} from "./protocol";

type SocketSession = {
  playerId: string;
};

type RoomMetadata = {
  roomCode: string;
};

const ROOM_STATE_STORAGE_KEY = "room-state-v1";

export class GobangRoom extends DurableObject<Env> {
  private roomState: OnlineRoomState | null = null;
  private readonly sockets = new Map<WebSocket, SocketSession>();

  async fetch(request: Request): Promise<Response> {
    const metadata = getRoomMetadata(request);

    this.roomState = await this.loadRoomState(metadata.roomCode);

    const url = new URL(request.url);
    if (url.pathname === "/create" && request.method === "POST") {
      this.roomState = markRoomCreated(this.roomState, Date.now());
      await this.persistRoomState();
      return Response.json({ success: true });
    }

    if (url.pathname === "/status" && request.method === "GET") {
      return Response.json(getRoomJoinability(this.roomState));
    }

    if (url.pathname === "/ws" && request.method === "GET") {
      return this.handleWebSocket(request);
    }

    return Response.json({ success: false, reason: "not-found" }, { status: 404 });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const roomState = this.requireRoomState();
    const url = new URL(request.url);
    const playerId = url.searchParams.get("playerId");
    const sessionToken = url.searchParams.get("sessionToken");
    const nickname = url.searchParams.get("nickname");
    const avatarInitial = url.searchParams.get("avatarInitial");
    const avatarColor = url.searchParams.get("avatarColor");

    if (
      playerId === null ||
      sessionToken === null ||
      nickname === null ||
      avatarInitial === null ||
      avatarColor === null
    ) {
      return Response.json({ success: false, reason: "invalid-join" }, { status: 400 });
    }

    const sessionTokenHash = await hashToken(sessionToken);
    const joinInput: JoinRoomInput = {
      playerId,
      sessionTokenHash,
      nickname,
      avatarInitial,
      avatarColor
    };
    const joined = joinRoom(roomState, joinInput, Date.now());
    if (joined.success === false) {
      return Response.json(
        { success: false, reason: joined.error },
        { status: joined.error === "room-full" ? 409 : 400 }
      );
    }

    this.roomState = joined.state;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    server.accept();
    this.sockets.set(server, { playerId });
    server.addEventListener("message", (event: MessageEvent) => {
      void this.handleMessage(server, event.data);
    });
    server.addEventListener("close", () => {
      void this.handleClose(server);
    });
    server.addEventListener("error", () => {
      void this.handleClose(server);
    });

    await this.persistRoomState();
    this.sendSnapshot(server, playerId);
    this.broadcastSnapshot();

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  private async handleMessage(socket: WebSocket, rawData: unknown): Promise<void> {
    const session = this.sockets.get(socket);
    if (session === undefined || this.roomState === null) {
      return;
    }

    const message = parseClientMessage(rawData);
    if (message === null) {
      sendServerMessage(socket, {
        type: "error",
        code: "invalid-player",
        message: "Invalid message"
      });
      return;
    }

    const now = Date.now();
    const result = this.applyClientMessage(session.playerId, message, now);
    if (result.success === false) {
      sendServerMessage(socket, {
        type: "error",
        code: result.error,
        message: result.error
      });
      return;
    }

    this.roomState = result.state;
    await this.persistRoomState();
    this.broadcastSnapshot();
  }

  private applyClientMessage(
    playerId: string,
    message: ClientMessage,
    now: number
  ): OnlineRoomMutationResult {
    const roomState = this.requireRoomState();

    switch (message.type) {
      case "place":
        return placeOnlineStone(
          roomState,
          playerId,
          { row: message.row, col: message.col },
          now
        );
      case "heartbeat":
        return receiveHeartbeat(roomState, playerId, message.gameNumber, now);
      case "request_undo":
        return requestUndo(roomState, playerId, now);
      case "respond_undo":
        return respondUndo(
          roomState,
          playerId,
          message.requestId,
          message.accept,
          now
        );
      case "request_surrender":
        return requestSurrender(roomState, playerId, now);
      case "respond_surrender":
        return respondSurrender(
          roomState,
          playerId,
          message.requestId,
          message.accept,
          now
        );
      case "start_new_game":
        return startNewGame(roomState, playerId, now);
      case "reset_animation_complete":
        return { success: true, state: roomState };
    }
  }

  private async handleClose(socket: WebSocket): Promise<void> {
    const session = this.sockets.get(socket);
    this.sockets.delete(socket);

    if (session === undefined || this.roomState === null) {
      return;
    }

    this.roomState = disconnectPlayer(
      this.roomState,
      session.playerId,
      Date.now()
    );
    await this.persistRoomState();
    this.broadcastSnapshot();
  }

  private broadcastSnapshot(): void {
    for (const [socket, session] of this.sockets) {
      this.sendSnapshot(socket, session.playerId);
    }
  }

  private sendSnapshot(socket: WebSocket, playerId: string): void {
    if (this.roomState === null) {
      return;
    }

    sendServerMessage(socket, {
      type: "snapshot",
      state: toClientState(this.roomState, playerId, Date.now())
    });
  }

  private requireRoomState(): OnlineRoomState {
    if (this.roomState === null) {
      throw new Error("Room state not initialized");
    }

    return this.roomState;
  }

  private async loadRoomState(roomCode: string): Promise<OnlineRoomState> {
    if (this.roomState !== null && this.roomState.roomCode === roomCode) {
      return this.roomState;
    }

    const storedState =
      await this.ctx.storage.get<OnlineRoomState>(ROOM_STATE_STORAGE_KEY);
    if (storedState?.roomCode === roomCode) {
      return storedState;
    }

    return createRoomState(roomCode);
  }

  private async persistRoomState(): Promise<void> {
    if (this.roomState === null) {
      return;
    }

    await this.ctx.storage.put(ROOM_STATE_STORAGE_KEY, this.roomState);
  }
}

function createRoomState(roomCode: string): OnlineRoomState {
  return createInitialRoomState(roomCode, Date.now());
}

function getRoomMetadata(request: Request): RoomMetadata {
  const roomCode = request.headers.get("x-room-code");

  if (roomCode === null) {
    throw new Error("Missing room code");
  }

  return { roomCode };
}

function parseClientMessage(rawData: unknown): ClientMessage | null {
  if (typeof rawData !== "string") {
    return null;
  }

  try {
    const value: unknown = JSON.parse(rawData);
    if (!isClientMessage(value)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function isClientMessage(value: unknown): value is ClientMessage {
  if (typeof value !== "object" || value === null || !("type" in value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  switch (candidate.type) {
    case "place":
      return typeof candidate.row === "number" && typeof candidate.col === "number";
    case "heartbeat":
      return typeof candidate.gameNumber === "number";
    case "request_undo":
    case "request_surrender":
    case "start_new_game":
      return true;
    case "respond_undo":
    case "respond_surrender":
      return (
        typeof candidate.requestId === "string" &&
        typeof candidate.accept === "boolean"
      );
    case "reset_animation_complete":
      return typeof candidate.gameNumber === "number";
    default:
      return false;
  }
}

function sendServerMessage(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), (byte: number) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}
