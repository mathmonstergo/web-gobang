import {
  BOARD_SIZE,
  WIN_LENGTH,
  type Board,
  type Cell,
  type Direction,
  type GameState,
  type Move,
  type MoveResult,
  type Player,
  type Position,
  type ShapeHint,
  type WinLine
} from "@/modules/gobang/types";

export const DIRECTIONS: readonly Direction[] = [
  { rowDelta: 0, colDelta: 1, name: "horizontal" },
  { rowDelta: 1, colDelta: 0, name: "vertical" },
  { rowDelta: 1, colDelta: 1, name: "diagonal-down" },
  { rowDelta: 1, colDelta: -1, name: "diagonal-up" }
];

export function createEmptyBoard(): Cell[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array<Cell>(BOARD_SIZE).fill(null)
  );
}

export function createInitialState(): GameState {
  return {
    board: createEmptyBoard(),
    currentPlayer: "black",
    moves: [],
    winner: null,
    status: "playing"
  };
}

export function getCell(board: Board, position: Position): Cell | undefined {
  if (!isInsideBoard(position)) {
    return undefined;
  }

  return board[position.row]?.[position.col];
}

export function isInsideBoard(position: Position): boolean {
  return (
    Number.isInteger(position.row) &&
    Number.isInteger(position.col) &&
    position.row >= 0 &&
    position.row < BOARD_SIZE &&
    position.col >= 0 &&
    position.col < BOARD_SIZE
  );
}

export function getNextPlayer(player: Player): Player {
  return player === "black" ? "white" : "black";
}

export function placeStone(
  state: GameState,
  position: Position
): MoveResult {
  if (state.status === "won") {
    return { success: false, state, error: "game-already-won" };
  }

  if (!isInsideBoard(position)) {
    return { success: false, state, error: "out-of-bounds" };
  }

  if (getCell(state.board, position) !== null) {
    return { success: false, state, error: "occupied" };
  }

  const board: Cell[][] = cloneBoard(state.board);
  board[position.row][position.col] = state.currentPlayer;

  const move: Move = {
    row: position.row,
    col: position.col,
    player: state.currentPlayer,
    turn: state.moves.length + 1
  };
  const winner: WinLine | null = detectWin(board, move);

  return {
    success: true,
    move,
    state: {
      board,
      currentPlayer:
        winner === null ? getNextPlayer(state.currentPlayer) : state.currentPlayer,
      moves: [...state.moves, move],
      winner,
      status: winner === null ? "playing" : "won"
    }
  };
}

export function undoMove(state: GameState): GameState {
  if (state.moves.length === 0) {
    return state;
  }

  const moves: readonly Move[] = state.moves.slice(0, -1);
  return createStateFromMoves(moves);
}

export function createStateFromMoves(moves: readonly Move[]): GameState {
  let state: GameState = createInitialState();

  for (const move of moves) {
    const normalizedState: GameState = {
      ...state,
      currentPlayer: move.player
    };
    const result: MoveResult = placeStone(normalizedState, {
      row: move.row,
      col: move.col
    });

    if (result.success === false) {
      return state;
    }

    state = result.state;
    if (state.status === "won") {
      return state;
    }
  }

  const lastMove: Move | undefined = moves.at(-1);
  return {
    ...state,
    currentPlayer:
      lastMove === undefined ? "black" : getNextPlayer(lastMove.player)
  };
}

export function detectWin(board: Board, move: Move): WinLine | null {
  for (const direction of DIRECTIONS) {
    const positions: Position[] = collectConnectedPositions(
      board,
      move,
      direction
    );

    if (positions.length >= WIN_LENGTH) {
      return {
        player: move.player,
        positions,
        direction: direction.name
      };
    }
  }

  return null;
}

export function detectLinePatterns(
  board: Board,
  anchor: Position | null = null
): readonly ShapeHint[] {
  const hints: ShapeHint[] = [];

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const player: Cell | undefined = getCell(board, { row, col });

      if (player === null || player === undefined) {
        continue;
      }

      for (const direction of DIRECTIONS) {
        const previousPosition: Position = {
          row: row - direction.rowDelta,
          col: col - direction.colDelta
        };

        if (getCell(board, previousPosition) === player) {
          continue;
        }

        const positions: Position[] = [];
        let cursor: Position = { row, col };

        while (getCell(board, cursor) === player) {
          positions.push(cursor);
          cursor = {
            row: cursor.row + direction.rowDelta,
            col: cursor.col + direction.colDelta
          };
        }

        const shouldInclude: boolean =
          positions.length >= 3 &&
          positions.length <= WIN_LENGTH &&
          (anchor === null ||
            positions.some(
              (position: Position) =>
                position.row === anchor.row && position.col === anchor.col
            ));

        if (shouldInclude) {
          hints.push({
            id: `${player}-${direction.name}-${positions.length}-${row}-${col}`,
            player,
            positions,
            direction: direction.name
          });
        }
      }
    }
  }

  return hints;
}

function cloneBoard(board: Board): Cell[][] {
  return board.map((row: readonly Cell[]) => [...row]);
}

function collectConnectedPositions(
  board: Board,
  move: Move,
  direction: Direction
): Position[] {
  const backward: Position[] = collectInDirection(board, move, {
    rowDelta: -direction.rowDelta,
    colDelta: -direction.colDelta,
    name: direction.name
  }).reverse();
  const forward: Position[] = collectInDirection(board, move, direction);

  return [...backward, { row: move.row, col: move.col }, ...forward];
}

function collectInDirection(
  board: Board,
  move: Move,
  direction: Direction
): Position[] {
  const positions: Position[] = [];
  let cursor: Position = {
    row: move.row + direction.rowDelta,
    col: move.col + direction.colDelta
  };

  while (getCell(board, cursor) === move.player) {
    positions.push(cursor);
    cursor = {
      row: cursor.row + direction.rowDelta,
      col: cursor.col + direction.colDelta
    };
  }

  return positions;
}
