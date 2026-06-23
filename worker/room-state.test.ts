import { describe, expect, it } from "vitest";

import { createInitialState } from "@shared/gobang/game-logic";
import {
  createInitialRoomState,
  disconnectPlayer,
  expireDisconnectedSlots,
  joinRoom,
  getRoomJoinability,
  placeOnlineStone,
  receiveHeartbeat,
  requestSurrender,
  requestUndo,
  respondSurrender,
  respondUndo,
  startNewGame
} from "./room-state";
import { type OnlineRoomState } from "./protocol";

describe("online room state", () => {
  it("moves from waiting to stabilizing after two players join", () => {
    const afterBlack = joinRoom(createRoom(), playerInput("black-id", "Ada"), 1);
    expect(afterBlack.success).toBe(true);
    if (afterBlack.success === false) {
      return;
    }

    expect(afterBlack.state.phase).toBe("waiting");
    expect(afterBlack.player.color).toBe("black");

    const afterWhite = joinRoom(afterBlack.state, playerInput("white-id", "Lin"), 2);
    expect(afterWhite.success).toBe(true);
    if (afterWhite.success === false) {
      return;
    }

    expect(afterWhite.state.phase).toBe("stabilizing");
    expect(afterWhite.player.color).toBe("white");
  });

  it("rejects official gameplay mutations before playing without mutating state", () => {
    const state = twoPlayerRoom();

    const place = placeOnlineStone(state, "black-id", { row: 7, col: 7 }, 10);
    const undo = requestUndo(state, "black-id", 10);
    const surrender = requestSurrender(state, "black-id", 10);
    const newGame = startNewGame(state, "black-id", 10);

    expect(place).toMatchObject({ success: false, error: "not-playing" });
    expect(undo).toMatchObject({ success: false, error: "not-playing" });
    expect(surrender).toMatchObject({ success: false, error: "not-playing" });
    expect(newGame).toMatchObject({ success: false, error: "not-ended" });
    expect(state.game).toEqual(createInitialState());
    expect(state.pendingRequest).toBeNull();
    expect(state.startedAt).toBeNull();
    expect(state.turnStartedAt).toBeNull();
    expect(state.gameNumber).toBe(1);
  });

  it("starts only after both players send three valid heartbeats", () => {
    let state = twoPlayerRoom();

    state = expectMutation(
      receiveHeartbeat(state, "black-id", state.gameNumber, 10)
    );
    state = expectMutation(
      receiveHeartbeat(state, "black-id", state.gameNumber, 11)
    );
    state = expectMutation(
      receiveHeartbeat(state, "black-id", state.gameNumber, 12)
    );
    state = expectMutation(
      receiveHeartbeat(state, "white-id", state.gameNumber, 13)
    );
    state = expectMutation(
      receiveHeartbeat(state, "white-id", state.gameNumber, 14)
    );

    expect(state.phase).toBe("stabilizing");

    state = expectMutation(
      receiveHeartbeat(state, "white-id", state.gameNumber, 15)
    );

    expect(state.phase).toBe("playing");
    expect(state.startedAt).toBe(15);
    expect(state.turnStartedAt).toBe(15);
  });

  it("resets turn timer anchors after accepted moves", () => {
    const state = playingRoom(20);
    const result = placeOnlineStone(state, "black-id", { row: 7, col: 7 }, 30);

    expect(result.success).toBe(true);
    if (result.success === false) {
      return;
    }

    expect(result.state.turnStartedAt).toBe(30);
    expect(result.state.turnPausedAt).toBeNull();
    expect(result.state.turnPausedDurationMs).toBe(0);
  });

  it("pauses move time on disconnect while game time remains anchored", () => {
    const disconnected = disconnectPlayer(playingRoom(100), "white-id", 140);

    expect(disconnected.startedAt).toBe(100);
    expect(disconnected.turnPausedAt).toBe(140);

    const rejoined = joinRoom(
      disconnected,
      playerInput("white-id", "Lin"),
      190
    );
    expect(rejoined.success).toBe(true);
    if (rejoined.success === false) {
      return;
    }

    expect(rejoined.state.turnPausedAt).toBeNull();
    expect(rejoined.state.turnPausedDurationMs).toBe(50);
  });

  it("rejects a third player while two slots are occupied", () => {
    const result = joinRoom(twoPlayerRoom(), playerInput("third-id", "Max"), 3);

    expect(result).toMatchObject({ success: false, error: "room-full" });
  });

  it("reports room joinability for validation checks", () => {
    expect(getRoomJoinability(createInitialRoomState("ABCDEF", 0))).toEqual({
      exists: false,
      joinable: false,
      reason: "not-found"
    });
    expect(getRoomJoinability(createRoom())).toEqual({
      exists: true,
      joinable: true,
      reason: "joinable"
    });
    expect(getRoomJoinability(twoPlayerRoom())).toEqual({
      exists: true,
      joinable: false,
      reason: "room-full"
    });
  });

  it("preserves disconnected slots for five minutes", () => {
    const disconnected = disconnectPlayer(twoPlayerRoom(), "white-id", 1000);
    const beforeExpiry = joinRoom(
      disconnected,
      playerInput("white-id", "Lin"),
      300999
    );

    expect(beforeExpiry.success).toBe(true);
    if (beforeExpiry.success === false) {
      return;
    }
    expect(beforeExpiry.player.color).toBe("white");

    const expired = expireDisconnectedSlots(disconnected, 301001);
    const replacement = joinRoom(expired, playerInput("new-id", "Neo"), 301002);

    expect(replacement.success).toBe(true);
    if (replacement.success === false) {
      return;
    }
    expect(replacement.player.color).toBe("white");
    expect(replacement.player.playerId).toBe("new-id");
  });

  it("accepts undo only when the target move is still latest", () => {
    let state = playingRoom(10);
    state = expectMutation(placeOnlineStone(state, "black-id", { row: 7, col: 7 }, 20));

    const undoRequest = requestUndo(state, "black-id", 21);
    expect(undoRequest.success).toBe(true);
    if (undoRequest.success === false) {
      return;
    }

    const staleState = {
      ...undoRequest.state,
      game: expectMutation(
        placeOnlineStone(undoRequest.state, "white-id", { row: 7, col: 8 }, 22)
      ).game,
      pendingRequest: undoRequest.state.pendingRequest
    };
    const accepted = respondUndo(
      staleState,
      "white-id",
      undoRequest.state.pendingRequest?.requestId ?? "",
      true,
      23
    );

    expect(accepted).toMatchObject({
      success: false,
      error: "request-stale"
    });
  });

  it("accepted surrender clears the board and returns to stabilizing", () => {
    let state = playingRoom(10);
    state = expectMutation(placeOnlineStone(state, "black-id", { row: 7, col: 7 }, 20));

    const surrenderRequest = requestSurrender(state, "black-id", 21);
    expect(surrenderRequest.success).toBe(true);
    if (surrenderRequest.success === false) {
      return;
    }

    const accepted = respondSurrender(
      surrenderRequest.state,
      "white-id",
      surrenderRequest.state.pendingRequest?.requestId ?? "",
      true,
      22
    );

    expect(accepted.success).toBe(true);
    if (accepted.success === false) {
      return;
    }
    expect(accepted.state.game).toEqual(createInitialState());
    expect(accepted.state.gameNumber).toBe(2);
    expect(accepted.state.phase).toBe("stabilizing");
    expect(accepted.state.startedAt).toBeNull();
  });
});

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

function playerInput(playerId: string, nickname: string) {
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
