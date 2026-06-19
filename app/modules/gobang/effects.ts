import {
  type DerivedEffects,
  type GameState,
  type PlacementEffect
} from "@/modules/gobang/types";
import { detectLinePatterns } from "@/modules/gobang/game-logic";

export function deriveEffects(
  state: GameState,
  latestPlacement: PlacementEffect | null
): DerivedEffects {
  const shapeHints =
    latestPlacement === null
      ? []
      : detectLinePatterns(state.board, latestPlacement.position);

  if (state.winner !== null) {
    return {
      placement: latestPlacement,
      shapeHints,
      victory: state.winner
    };
  }

  return {
    placement: latestPlacement,
    shapeHints,
    victory: null
  };
}
