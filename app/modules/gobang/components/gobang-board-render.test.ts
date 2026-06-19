import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GobangBoard } from "@/modules/gobang/components/gobang-board";
import { deriveEffects } from "@/modules/gobang/effects";
import { createStateFromMoves } from "@/modules/gobang/game-logic";
import { type GameState, type Move } from "@/modules/gobang/types";

describe("GobangBoard", () => {
  it("renders victory wave delays from the latest winning stone", () => {
    const state: GameState = createStateFromMoves([
      blackMove(7, 7, 1),
      whiteMove(1, 1, 2),
      blackMove(7, 8, 3),
      whiteMove(2, 1, 4),
      blackMove(7, 10, 5),
      whiteMove(3, 1, 6),
      blackMove(7, 11, 7),
      whiteMove(4, 1, 8),
      blackMove(7, 9, 9)
    ]);
    const markup: string = renderToStaticMarkup(
      createElement(GobangBoard, {
        effects: deriveEffects(state, {
          id: "9-black-7-9",
          player: "black",
          position: { row: 7, col: 9 },
          turn: 9
        }),
        onPlace: handleRenderOnlyPlace,
        state
      })
    );

    expect(markup).not.toContain("pattern-overlay");
    expect(markup).not.toContain("stone-wave ");
    expect(markup.match(/stone-victory-wave/g)).toHaveLength(5);
    expect(markup).toContain("--wave-delay:0ms");
    expect(markup.match(/--wave-delay:220ms/g)).toHaveLength(2);
    expect(markup.match(/--wave-delay:440ms/g)).toHaveLength(2);
  });
});

function handleRenderOnlyPlace(): void {
  return;
}

function blackMove(row: number, col: number, turn: number): Move {
  return { row, col, turn, player: "black" };
}

function whiteMove(row: number, col: number, turn: number): Move {
  return { row, col, turn, player: "white" };
}
