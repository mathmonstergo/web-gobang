import {
  type GameState,
  type Player,
  type Position
} from "@/modules/gobang/types";

export type TouchPlacementCandidate = {
  position: Position | null;
  player: Player;
  isPlaceable: boolean;
};

export function createTouchPlacementCandidate(
  state: GameState,
  position: Position | null
): TouchPlacementCandidate {
  return {
    position,
    player: state.currentPlayer,
    isPlaceable: isPositionPlaceable(state, position)
  };
}

export function isPositionPlaceable(
  state: GameState,
  position: Position | null
): boolean {
  if (state.status !== "playing" || position === null) {
    return false;
  }

  return state.board[position.row]?.[position.col] === null;
}
