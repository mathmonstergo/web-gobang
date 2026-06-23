import { describe, expect, it } from "vitest";

import { createInitialState } from "@shared/gobang/game-logic";
import {
  createInitialRoomState,
  disconnectPlayer,
  expireDisconnectedSlots,
  getRoomJoinability,
  joinRoom,
  placeOnlineStone,
  receiveHeartbeat,
  requestSurrender,
  requestUndo,
  respondSurrender,
  respondUndo,
  startGame,
  toClientState
} from "./room-state";
import { type OnlineRoomState } from "./protocol";

describe("online room state", () => {
  it("records creation and pre-play lifecycle metadata", () => {
    expect(createInitialRoomState("ABCDEF", 123)).toMatchObject({
      createdAt: 123,
      hasEnteredPlaying: false
    });
  });

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
    const start = startGame(state, "black-id", 10, 0);

    expect(place).toMatchObject({ success: false, error: "not-playing" });
    expect(undo).toMatchObject({ success: false, error: "not-playing" });
    expect(surrender).toMatchObject({ success: false, error: "not-playing" });
    expect(start).toMatchObject({ success: false, error: "request-not-allowed" });
    expect(state.game).toEqual(createInitialState());
    expect(state.pendingRequest).toBeNull();
    expect(state.startedAt).toBeNull();
    expect(state.turnStartedAt).toBeNull();
    expect(state.gameNumber).toBe(1);
  });

  it("does not auto-start after both players send three valid heartbeats", () => {
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

    expect(state.phase).toBe("stabilizing");
    expect(state.startedAt).toBeNull();
    expect(toClientState(state, "black-id", 15).canStart).toBe(true);
  });

  it("starts explicitly after stable heartbeats and initializes clocks", () => {
    const state = stableRoom(15);
    const result = startGame(state, "black-id", 20, 0);

    expect(result.success).toBe(true);
    if (result.success === false) {
      return;
    }

    expect(result.state.phase).toBe("playing");
    expect(result.state.startedAt).toBe(20);
    expect(result.state.turnStartedAt).toBe(20);
    expect(result.state).toMatchObject({ hasEnteredPlaying: true });
    expect(result.state.clocks).toEqual({
      black: { stepRemainingMs: 45_000, gameRemainingMs: 600_000 },
      white: { stepRemainingMs: 45_000, gameRemainingMs: 600_000 }
    });
  });

  it("randomizes black and white seats when an official game starts", () => {
    const stable = stableRoom(15);
    const kept = expectMutation(startGame(stable, "black-id", 20, 0.1));
    const swapped = expectMutation(startGame(stable, "black-id", 20, 0.9));

    expect(kept.players.black?.playerId).toBe("black-id");
    expect(kept.players.white?.playerId).toBe("white-id");
    expect(swapped.players.black?.playerId).toBe("white-id");
    expect(swapped.players.white?.playerId).toBe("black-id");
    expect(swapped.players.black?.color).toBe("black");
    expect(swapped.players.white?.color).toBe("white");
  });

  it("deducts the active player clock after accepted moves", () => {
    const state = playingRoom(20_000);
    const result = placeOnlineStone(state, "black-id", { row: 7, col: 7 }, 30_000);

    expect(result.success).toBe(true);
    if (result.success === false) {
      return;
    }

    expect(result.state.turnStartedAt).toBe(30_000);
    expect(result.state.turnPausedAt).toBeNull();
    expect(result.state.turnPausedDurationMs).toBe(0);
    expect(result.state.clocks.black).toEqual({
      stepRemainingMs: 45_000,
      gameRemainingMs: 590_000
    });
    expect(result.state.clocks.white).toEqual({
      stepRemainingMs: 45_000,
      gameRemainingMs: 600_000
    });
  });

  it("does not pause clocks on disconnect", () => {
    const disconnected = disconnectPlayer(playingRoom(100_000), "white-id", 140_000);

    expect(disconnected.startedAt).toBe(100_000);
    expect(disconnected.turnPausedAt).toBeNull();
    expect(disconnected.turnPausedDurationMs).toBe(0);
    expect(toClientState(disconnected, "black-id", 140_000).clocks.black).toEqual({
      stepRemainingMs: 5_000,
      gameRemainingMs: 560_000
    });

    const rejoined = joinRoom(
      disconnected,
      playerInput("white-id", "Lin"),
      190_000
    );
    expect(rejoined.success).toBe(true);
    if (rejoined.success === false) {
      return;
    }

    expect(rejoined.state.turnPausedAt).toBeNull();
    expect(rejoined.state.turnPausedDurationMs).toBe(0);
  });

  it("ends the game when the current player step clock expires", () => {
    const timedOut = receiveHeartbeat(
      playingRoom(100),
      "white-id",
      1,
      45_100
    );

    expect(timedOut.success).toBe(true);
    if (timedOut.success === false) {
      return;
    }

    expect(timedOut.state.phase).toBe("ended");
    expect(timedOut.state.endReason).toEqual({
      type: "timeout",
      winner: "white",
      timedOutBy: "black",
      clock: "step"
    });
  });

  it("ends the game when the current player game clock expires", () => {
    const state = {
      ...playingRoom(100),
      clocks: {
        black: { stepRemainingMs: 45_000, gameRemainingMs: 1_000 },
        white: { stepRemainingMs: 45_000, gameRemainingMs: 600_000 }
      }
    };
    const timedOut = receiveHeartbeat(state, "white-id", 1, 1_100);

    expect(timedOut.success).toBe(true);
    if (timedOut.success === false) {
      return;
    }

    expect(timedOut.state.phase).toBe("ended");
    expect(timedOut.state.endReason).toEqual({
      type: "timeout",
      winner: "white",
      timedOutBy: "black",
      clock: "game"
    });
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
