import { describe, expect, it } from "vitest";

import {
  createTouchPlacementCandidate,
  isPositionPlaceable
} from "@/modules/gobang/touch-placement";
import { createInitialState, createStateFromMoves } from "@/modules/gobang/game-logic";
import { type GameState } from "@/modules/gobang/types";

describe("touch placement", () => {
  it("allows empty intersections while the game is playing", () => {
    const state: GameState = createInitialState();

    expect(isPositionPlaceable(state, { row: 7, col: 7 })).toBe(true);
  });

  it("rejects occupied intersections", () => {
    const state: GameState = createStateFromMoves([
      { row: 7, col: 7, player: "black", turn: 1 }
    ]);

    expect(isPositionPlaceable(state, { row: 7, col: 7 })).toBe(false);
  });

  it("rejects null positions", () => {
    const state: GameState = createInitialState();

    expect(isPositionPlaceable(state, null)).toBe(false);
  });

  it("rejects placement after the game is won", () => {
    const state: GameState = createStateFromMoves([
      { row: 7, col: 7, player: "black", turn: 1 },
      { row: 1, col: 1, player: "white", turn: 2 },
      { row: 7, col: 8, player: "black", turn: 3 },
      { row: 2, col: 1, player: "white", turn: 4 },
      { row: 7, col: 9, player: "black", turn: 5 },
      { row: 3, col: 1, player: "white", turn: 6 },
      { row: 7, col: 10, player: "black", turn: 7 },
      { row: 4, col: 1, player: "white", turn: 8 },
      { row: 7, col: 11, player: "black", turn: 9 }
    ]);

    expect(state.status).toBe("won");
    expect(isPositionPlaceable(state, { row: 8, col: 8 })).toBe(false);
  });

  it("keeps the current player on the preview candidate", () => {
    const state: GameState = createStateFromMoves([
      { row: 7, col: 7, player: "black", turn: 1 }
    ]);
    const candidate = createTouchPlacementCandidate(state, { row: 7, col: 8 });

    expect(candidate.player).toBe("white");
    expect(candidate.isPlaceable).toBe(true);
  });
});
