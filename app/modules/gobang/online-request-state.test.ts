import { describe, expect, it } from "vitest";

import {
  canRequestOnlineSurrender,
  canRequestOnlineUndo,
  getIncomingOnlineRequest
} from "@/modules/gobang/online-request-state";
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

describe("online request state", () => {
  it("detects incoming requests for the viewer only", () => {
    const incoming = snapshot({
      pendingRequest: {
        type: "undo",
        requestId: "undo-1",
        requestedBy: "black",
        targetMoveTurn: 1,
        expiresAt: 20
      },
      viewerColor: "white"
    });
    const outgoing = { ...incoming, viewerColor: "black" as const };

    expect(getIncomingOnlineRequest(incoming)?.requestId).toBe("undo-1");
    expect(getIncomingOnlineRequest(outgoing)).toBeNull();
  });

  it("allows undo only for the latest move owner with no pending request", () => {
    const afterBlackMove = snapshot({
      game: gameFromMoves([move("black", 7, 7, 1)]),
      viewerColor: "black"
    });
    const waitingViewer = { ...afterBlackMove, viewerColor: "white" as const };
    const withPending = {
      ...afterBlackMove,
      pendingRequest: {
        type: "undo",
        requestId: "undo-1",
        requestedBy: "black",
        targetMoveTurn: 1,
        expiresAt: 20
      }
    } satisfies OnlineRoomSnapshot;

    expect(canRequestOnlineUndo(afterBlackMove)).toBe(true);
    expect(canRequestOnlineUndo(waitingViewer)).toBe(false);
    expect(canRequestOnlineUndo(withPending)).toBe(false);
  });

  it("allows surrender during playing only when no request is pending", () => {
    expect(canRequestOnlineSurrender(snapshot())).toBe(true);
    expect(
      canRequestOnlineSurrender(
        snapshot({
          pendingRequest: {
            type: "surrender",
            requestId: "surrender-1",
            requestedBy: "black",
            expiresAt: 20
          }
        })
      )
    ).toBe(false);
    expect(canRequestOnlineSurrender(snapshot({ phase: "ended" }))).toBe(false);
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
    clocks: {
      black: { stepRemainingMs: 45_000, gameRemainingMs: 600_000 },
      white: { stepRemainingMs: 45_000, gameRemainingMs: 600_000 }
    },
    gameNumber: 1,
    startedAt: 10,
    turnStartedAt: 10,
    turnPausedAt: null,
    turnPausedDurationMs: 0,
    serverNow: 10,
    viewerColor: "black",
    canStart: false,
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
