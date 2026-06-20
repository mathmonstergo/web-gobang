import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { positionKey } from "@/modules/gobang/board-geometry";
import {
  WAVE_STAGGER_MS,
  createVictoryWaveHighlights,
  createWaveHighlights
} from "@/modules/gobang/canvas-effects";
import { GobangBoard } from "@/modules/gobang/components/gobang-board";
import { deriveEffects } from "@/modules/gobang/effects";
import { createInitialState, createStateFromMoves } from "@/modules/gobang/game-logic";
import {
  type GameState,
  type Move,
  type ShapeHint,
  type WaveHighlight
} from "@/modules/gobang/types";

describe("GobangBoard", () => {
  it("renders canvas layers instead of svg stones", () => {
    const state: GameState = createInitialState();
    const markup: string = renderToStaticMarkup(
      createElement(GobangBoard, {
        effects: deriveEffects(state, null),
        onPlace: handleRenderOnlyPlace,
        state
      })
    );

    expect(markup).toContain("board-canvas");
    expect(markup).toContain("physics-overlay-canvas");
    expect(markup).not.toContain("<svg");
    expect(markup).not.toContain("stone-victory-wave");
  });

  it("keeps victory replay anchored to a final endpoint stone", () => {
    const state: GameState = createStateFromMoves([
      blackMove(7, 7, 1),
      whiteMove(1, 1, 2),
      blackMove(7, 8, 3),
      whiteMove(2, 1, 4),
      blackMove(7, 9, 5),
      whiteMove(3, 1, 6),
      blackMove(7, 10, 7),
      whiteMove(4, 1, 8),
      blackMove(7, 11, 9)
    ]);
    const effects = deriveEffects(state, {
      id: "9-black-7-11",
      player: "black",
      position: { row: 7, col: 11 },
      turn: 9
    });
    const highlights: readonly WaveHighlight[] = createVictoryWaveHighlights(
      effects.victory,
      effects.shapeHints
    );
    const delayByPosition: ReadonlyMap<string, number> = toDelayMap(highlights);

    expect(delayByPosition.get("7:11")).toBe(0);
    expect(delayByPosition.get("7:10")).toBe(WAVE_STAGGER_MS);
    expect(delayByPosition.get("7:9")).toBe(WAVE_STAGGER_MS * 2);
    expect(delayByPosition.get("7:8")).toBe(WAVE_STAGGER_MS * 3);
    expect(delayByPosition.get("7:7")).toBe(WAVE_STAGGER_MS * 4);
  });

  it("keeps victory replay anchored to a final middle stone", () => {
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
    const effects = deriveEffects(state, {
      id: "9-black-7-9",
      player: "black",
      position: { row: 7, col: 9 },
      turn: 9
    });
    const highlights: readonly WaveHighlight[] = createVictoryWaveHighlights(
      effects.victory,
      effects.shapeHints
    );
    const delayByPosition: ReadonlyMap<string, number> = toDelayMap(highlights);

    expect(delayByPosition.get("7:9")).toBe(0);
    expect(delayByPosition.get("7:8")).toBe(WAVE_STAGGER_MS);
    expect(delayByPosition.get("7:10")).toBe(WAVE_STAGGER_MS);
    expect(delayByPosition.get("7:7")).toBe(WAVE_STAGGER_MS * 2);
    expect(delayByPosition.get("7:11")).toBe(WAVE_STAGGER_MS * 2);
  });

  it("deduplicates overlapping wave highlights by earliest arrival", () => {
    const hints: readonly ShapeHint[] = [
      {
        id: "slow",
        player: "black",
        anchor: { row: 7, col: 7 },
        positions: [
          { row: 7, col: 7 },
          { row: 7, col: 8 },
          { row: 7, col: 9 }
        ],
        direction: "horizontal"
      },
      {
        id: "fast",
        player: "black",
        anchor: { row: 7, col: 8 },
        positions: [
          { row: 7, col: 8 },
          { row: 7, col: 9 },
          { row: 7, col: 10 }
        ],
        direction: "horizontal"
      }
    ];
    const delayByPosition: ReadonlyMap<string, number> = toDelayMap(
      createWaveHighlights(hints)
    );

    expect(delayByPosition.get("7:9")).toBe(WAVE_STAGGER_MS);
  });

  it("limits victory replay to five stones around the final move", () => {
    const highlights: readonly WaveHighlight[] = createVictoryWaveHighlights(
      {
        player: "black",
        direction: "horizontal",
        positions: [
          { row: 7, col: 6 },
          { row: 7, col: 7 },
          { row: 7, col: 8 },
          { row: 7, col: 9 },
          { row: 7, col: 10 },
          { row: 7, col: 11 }
        ]
      },
      [],
      { row: 7, col: 11 }
    );
    const delayByPosition: ReadonlyMap<string, number> = toDelayMap(highlights);

    expect(highlights).toHaveLength(5);
    expect(delayByPosition.has("7:6")).toBe(false);
    expect(delayByPosition.get("7:11")).toBe(0);
    expect(delayByPosition.get("7:7")).toBe(WAVE_STAGGER_MS * 4);
  });
});

function handleRenderOnlyPlace(): void {
  return;
}

function toDelayMap(
  highlights: readonly WaveHighlight[]
): ReadonlyMap<string, number> {
  return new Map<string, number>(
    highlights.map((highlight: WaveHighlight) => [
      positionKey(highlight.position),
      highlight.delayMs
    ])
  );
}

function blackMove(row: number, col: number, turn: number): Move {
  return { row, col, turn, player: "black" };
}

function whiteMove(row: number, col: number, turn: number): Move {
  return { row, col, turn, player: "white" };
}
