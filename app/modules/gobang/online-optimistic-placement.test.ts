import { describe, expect, it } from "vitest";

import {
  createOptimisticOnlinePlacement,
  doesSnapshotContainOptimisticPlacement,
  shouldUseOptimisticOnlinePlacement
} from "@/modules/gobang/online-optimistic-placement";
import { createInitialState, placeStone } from "@/modules/gobang/game-logic";
import { type OnlineRoomSnapshot } from "@/modules/gobang/online-types";

describe("online optimistic placement", () => {
  it("creates a local visual placement only for the viewer's official turn", () => {
    const optimistic = createOptimisticOnlinePlacement(
      snapshot({ viewerColor: "black" }),
      { row: 7, col: 7 }
    );

    expect(optimistic?.game.moves).toHaveLength(1);
    expect(optimistic?.placement).toMatchObject({
      player: "black",
      position: { row: 7, col: 7 },
      turn: 1
    });
  });

  it("does not create an optimistic placement outside the viewer's turn", () => {
    expect(
      createOptimisticOnlinePlacement(
        snapshot({ viewerColor: "white" }),
        { row: 7, col: 7 }
      )
    ).toBeNull();
  });

  it("keeps optimistic display only until the authoritative snapshot catches up", () => {
    const optimistic = createOptimisticOnlinePlacement(
      snapshot({ viewerColor: "black" }),
      { row: 7, col: 7 }
    );
    expect(optimistic).not.toBeNull();
    if (optimistic === null) {
      return;
    }

    expect(shouldUseOptimisticOnlinePlacement(snapshot(), optimistic)).toBe(true);

    const serverMoveResult = placeStone(createInitialState(), { row: 7, col: 7 });
    expect(serverMoveResult.success).toBe(true);
    if (serverMoveResult.success === false) {
      return;
    }

    const caughtUpSnapshot = snapshot({ game: serverMoveResult.state });
    expect(
      shouldUseOptimisticOnlinePlacement(caughtUpSnapshot, optimistic)
    ).toBe(false);
    expect(
      doesSnapshotContainOptimisticPlacement(caughtUpSnapshot, optimistic)
    ).toBe(true);
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
    clocks: {},
    gameNumber: 1,
    startedAt: 1_000,
    turnStartedAt: 1_000,
    turnPausedAt: null,
    turnPausedDurationMs: 0,
    serverNow: 1_000,
    viewerColor: "black",
    canStart: false,
    ...overrides
  };
}
