import { describe, expect, it } from "vitest";

import { deriveEffects } from "@/modules/gobang/effects";
import { createStateFromMoves } from "@/modules/gobang/game-logic";
import { type GameState, type Move } from "@/modules/gobang/types";

describe("Gobang effects", () => {
  it("keeps victory visible while allowing the final pattern effect", () => {
    const state: GameState = createStateFromMoves([
      blackMove(7, 3, 1),
      whiteMove(0, 0, 2),
      blackMove(7, 4, 3),
      whiteMove(0, 1, 4),
      blackMove(7, 5, 5),
      whiteMove(0, 2, 6),
      blackMove(7, 6, 7),
      whiteMove(0, 3, 8),
      blackMove(7, 7, 9)
    ]);
    const effects = deriveEffects(state, {
      id: "9-black-7-7",
      player: "black",
      position: { row: 7, col: 7 },
      turn: 9
    });

    expect(effects.victory?.positions).toHaveLength(5);
    expect(effects.shapeHints[0]?.positions).toHaveLength(5);
  });
});

function blackMove(row: number, col: number, turn: number): Move {
  return { row, col, turn, player: "black" };
}

function whiteMove(row: number, col: number, turn: number): Move {
  return { row, col, turn, player: "white" };
}
