import { describe, expect, it } from "vitest";

import {
  deriveOnlinePlacementEffect,
  getOnlineBoardPreviewPlayer,
  getOnlineResetTransition
} from "@/modules/gobang/online-snapshot-effects";
import {
  createInitialState,
  createStateFromMoves
} from "@/modules/gobang/game-logic";
import {
  type GameState,
  type Move,
  type Player
} from "@/modules/gobang/types";
import { type OnlineRoomSnapshot } from "@/modules/gobang/online-types";

describe("online snapshot effects", () => {
  it("does not replay placement effects when the first snapshot arrives", () => {
    const current = snapshot({ game: gameFromMoves([move("black", 7, 7, 1)]) });

    expect(deriveOnlinePlacementEffect(null, current)).toBeNull();
  });

  it("creates a placement effect when the authoritative snapshot gains one move", () => {
    const previous = snapshot({ game: createInitialState(), serverNow: 10 });
    const current = snapshot({
      game: gameFromMoves([move("black", 7, 7, 1)]),
      serverNow: 20
    });

    expect(deriveOnlinePlacementEffect(previous, current)).toEqual({
      id: "online-1-1-black-7-7-20",
      player: "black",
      position: { row: 7, col: 7 },
      turn: 1
    });
  });

  it("detects server reset transitions so clients can animate old stones out", () => {
    const previous = snapshot({
      game: gameFromMoves([move("black", 7, 7, 1)]),
      gameNumber: 1
    });
    const current = snapshot({
      game: createInitialState(),
      gameNumber: 2
    });

    expect(getOnlineResetTransition(previous, current)).toEqual({
      gameNumber: 2,
      moves: previous.game.moves,
      visualGame: previous.game
    });
  });

  it("uses viewer color for online preview only on the viewer turn", () => {
    expect(
      getOnlineBoardPreviewPlayer(
        snapshot({
          game: createInitialState(),
          phase: "playing",
          viewerColor: "black"
        })
      )
    ).toBe("black");

    expect(
      getOnlineBoardPreviewPlayer(
        snapshot({
          game: gameFromMoves([move("black", 7, 7, 1)]),
          phase: "playing",
          viewerColor: "black"
        })
      )
    ).toBeNull();
  });
});

function snapshot(
  overrides: Partial<OnlineRoomSnapshot> = {}
): OnlineRoomSnapshot {
  return {
    roomCode: "ABCDEF",
    players: {},
    game: createInitialState(),
    phase: "playing",
    endReason: null,
    pendingRequest: null,
    gameNumber: 1,
    startedAt: 10,
    turnStartedAt: 10,
    turnPausedAt: null,
    turnPausedDurationMs: 0,
    serverNow: 10,
    viewerColor: "black",
    ...overrides
  };
}

function gameFromMoves(moves: readonly Move[]): GameState {
  return createStateFromMoves(moves);
}

function move(
  player: Player,
  row: number,
  col: number,
  turn: number
): Move {
  return { player, row, col, turn };
}
