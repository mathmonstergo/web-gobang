import {
  type DerivedEffects,
  type GameState,
  type PlacementEffect
} from "@/modules/gobang/types";
import { detectConnectedThrees } from "@/modules/gobang/game-logic";

export function deriveEffects(
  state: GameState,
  latestPlacement: PlacementEffect | null
): DerivedEffects {
  if (state.winner !== null) {
    return {
      placement: latestPlacement,
      shapeHints: [],
      victory: state.winner
    };
  }

  return {
    placement: latestPlacement,
    shapeHints: detectConnectedThrees(state.board),
    victory: null
  };
}
