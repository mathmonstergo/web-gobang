import { describe, expect, it } from "vitest";

import {
  createInitialState,
  createStateFromMoves,
  detectLinePatterns,
  placeStone,
  undoMove
} from "@/modules/gobang/game-logic";
import { deriveEffects } from "@/modules/gobang/effects";
import { type GameState, type Move } from "@/modules/gobang/types";

describe("Gobang game logic", () => {
  it("places stones and alternates players", () => {
    const initialState: GameState = createInitialState();
    const firstMove = placeStone(initialState, { row: 7, col: 7 });

    expect(firstMove.success).toBe(true);
    if (firstMove.success === false) {
      return;
    }

    expect(firstMove.state.board[7][7]).toBe("black");
    expect(firstMove.state.currentPlayer).toBe("white");

    const secondMove = placeStone(firstMove.state, { row: 7, col: 8 });

    expect(secondMove.success).toBe(true);
    if (secondMove.success === false) {
      return;
    }

    expect(secondMove.state.board[7][8]).toBe("white");
    expect(secondMove.state.currentPlayer).toBe("black");
  });

  it("rejects occupied, out-of-bounds, and post-win moves", () => {
    const initialState: GameState = createInitialState();
    const firstMove = placeStone(initialState, { row: 7, col: 7 });

    expect(firstMove.success).toBe(true);
    if (firstMove.success === false) {
      return;
    }

    const occupiedMove = placeStone(firstMove.state, { row: 7, col: 7 });
    const outOfBoundsMove = placeStone(firstMove.state, { row: -1, col: 7 });
    const wonState: GameState = createStateFromMoves([
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
    const postWinMove = placeStone(wonState, { row: 8, col: 8 });

    expect(occupiedMove).toMatchObject({
      success: false,
      error: "occupied"
    });
    expect(outOfBoundsMove).toMatchObject({
      success: false,
      error: "out-of-bounds"
    });
    expect(postWinMove).toMatchObject({
      success: false,
      error: "game-already-won"
    });
  });

  it("detects horizontal, vertical, and diagonal wins", () => {
    const horizontal: GameState = createStateFromMoves([
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
    const vertical: GameState = createStateFromMoves([
      blackMove(3, 7, 1),
      whiteMove(0, 0, 2),
      blackMove(4, 7, 3),
      whiteMove(0, 1, 4),
      blackMove(5, 7, 5),
      whiteMove(0, 2, 6),
      blackMove(6, 7, 7),
      whiteMove(0, 3, 8),
      blackMove(7, 7, 9)
    ]);
    const diagonal: GameState = createStateFromMoves([
      blackMove(3, 3, 1),
      whiteMove(0, 0, 2),
      blackMove(4, 4, 3),
      whiteMove(0, 1, 4),
      blackMove(5, 5, 5),
      whiteMove(0, 2, 6),
      blackMove(6, 6, 7),
      whiteMove(0, 3, 8),
      blackMove(7, 7, 9)
    ]);

    expect(horizontal.winner?.direction).toBe("horizontal");
    expect(vertical.winner?.direction).toBe("vertical");
    expect(diagonal.winner?.direction).toBe("diagonal-down");
  });

  it("undoes the latest move and restores the turn", () => {
    const state: GameState = createStateFromMoves([
      blackMove(7, 7, 1),
      whiteMove(7, 8, 2)
    ]);
    const undoneState: GameState = undoMove(state);

    expect(undoneState.board[7][8]).toBeNull();
    expect(undoneState.currentPlayer).toBe("white");
    expect(undoneState.moves).toHaveLength(1);
  });

  it("detects line patterns of three, four, and five stones", () => {
    const state: GameState = createStateFromMoves([
      blackMove(7, 7, 1),
      whiteMove(1, 1, 2),
      blackMove(7, 8, 3),
      whiteMove(2, 1, 4),
      blackMove(7, 9, 5)
    ]);
    const threeHints = detectLinePatterns(state.board, { row: 7, col: 9 });
    const fourState: GameState = createStateFromMoves([
      ...state.moves,
      whiteMove(3, 1, 6),
      blackMove(7, 10, 7)
    ]);
    const fourHints = detectLinePatterns(fourState.board, { row: 7, col: 10 });
    const fiveState: GameState = createStateFromMoves([
      ...fourState.moves,
      whiteMove(4, 1, 8),
      blackMove(7, 11, 9)
    ]);
    const fiveHints = detectLinePatterns(fiveState.board, { row: 7, col: 11 });

    expect(threeHints).toHaveLength(1);
    expect(threeHints[0]?.positions).toEqual([
      { row: 7, col: 7 },
      { row: 7, col: 8 },
      { row: 7, col: 9 }
    ]);
    expect(fourHints[0]?.positions).toHaveLength(4);
    expect(fiveHints[0]?.positions).toHaveLength(5);
  });

  it("does not detect shorter lines or unrelated latest placements", () => {
    const state: GameState = createStateFromMoves([
      blackMove(7, 7, 1),
      whiteMove(1, 1, 2),
      blackMove(7, 8, 3)
    ]);
    const unrelatedState: GameState = createStateFromMoves([
      blackMove(7, 7, 1),
      whiteMove(1, 1, 2),
      blackMove(7, 8, 3),
      whiteMove(2, 1, 4),
      blackMove(7, 9, 5),
      whiteMove(10, 10, 6)
    ]);

    expect(detectLinePatterns(state.board, { row: 7, col: 8 })).toHaveLength(0);
    expect(
      detectLinePatterns(unrelatedState.board, { row: 10, col: 10 })
    ).toHaveLength(0);
  });

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
