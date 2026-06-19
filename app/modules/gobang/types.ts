export const BOARD_SIZE = 15;
export const WIN_LENGTH = 5;

export type Player = "black" | "white";

export type Cell = Player | null;

export type Position = {
  row: number;
  col: number;
};

export type Move = Position & {
  player: Player;
  turn: number;
};

export type Direction = {
  rowDelta: number;
  colDelta: number;
  name: "horizontal" | "vertical" | "diagonal-down" | "diagonal-up";
};

export type WinLine = {
  player: Player;
  positions: readonly Position[];
  direction: Direction["name"];
};

export type ShapeHint = {
  id: string;
  player: Player;
  positions: readonly Position[];
  direction: Direction["name"];
};

export type GameStatus = "playing" | "won";

export type Board = readonly (readonly Cell[])[];

export type GameState = {
  board: Board;
  currentPlayer: Player;
  moves: readonly Move[];
  winner: WinLine | null;
  status: GameStatus;
};

export type MoveError =
  | "out-of-bounds"
  | "occupied"
  | "game-already-won";

export type MoveResult =
  | {
      success: true;
      state: GameState;
      move: Move;
    }
  | {
      success: false;
      state: GameState;
      error: MoveError;
    };

export type PlacementEffect = {
  id: string;
  player: Player;
  position: Position;
  turn: number;
};

export type DerivedEffects = {
  placement: PlacementEffect | null;
  shapeHints: readonly ShapeHint[];
  victory: WinLine | null;
};
