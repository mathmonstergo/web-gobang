import { useCallback, useEffect, useMemo, useState } from "react";

import { deriveEffects } from "@/modules/gobang/effects";
import {
  createInitialState,
  placeStone,
  undoMove
} from "@/modules/gobang/game-logic";
import {
  clearStoredGameState,
  loadStoredGameState,
  saveGameState
} from "@/modules/gobang/storage";
import {
  type DerivedEffects,
  type GameState,
  type PlacementEffect,
  type Position
} from "@/modules/gobang/types";

export type GobangController = {
  state: GameState;
  effects: DerivedEffects;
  isLoaded: boolean;
  placeAt: (position: Position) => void;
  undo: () => void;
  reset: () => void;
};

export function useGobangGame(): GobangController {
  const [state, setState] = useState<GameState>(() => createInitialState());
  const [latestPlacement, setLatestPlacement] =
    useState<PlacementEffect | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const storedState: GameState | null = loadStoredGameState();
    if (storedState !== null) {
      setState(storedState);
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    saveGameState(state);
  }, [isLoaded, state]);

  const placeAt = useCallback((position: Position): void => {
    setState((previousState: GameState) => {
      const result = placeStone(previousState, position);

      if (result.success === false) {
        return previousState;
      }

      setLatestPlacement({
        id: `${result.move.turn}-${result.move.player}-${result.move.row}-${result.move.col}`,
        player: result.move.player,
        position: { row: result.move.row, col: result.move.col },
        turn: result.move.turn
      });

      return result.state;
    });
  }, []);

  const undo = useCallback((): void => {
    setLatestPlacement(null);
    setState((previousState: GameState) => undoMove(previousState));
  }, []);

  const reset = useCallback((): void => {
    clearStoredGameState();
    setLatestPlacement(null);
    setState(createInitialState());
  }, []);

  const effects: DerivedEffects = useMemo(
    () => deriveEffects(state, latestPlacement),
    [latestPlacement, state]
  );

  return {
    state,
    effects,
    isLoaded,
    placeAt,
    undo,
    reset
  };
}
