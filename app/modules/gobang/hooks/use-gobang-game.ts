import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  type Move,
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
  const placementEffectSequenceRef = useRef(0);

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

      placementEffectSequenceRef.current += 1;
      setLatestPlacement(
        createPlacementEffectFromMove(
          result.move,
          `place-${placementEffectSequenceRef.current}`
        )
      );

      return result.state;
    });
  }, []);

  const undo = useCallback((): void => {
    setState((previousState: GameState) => {
      const nextState: GameState = undoMove(previousState);
      if (nextState.moves.length === 0) {
        setLatestPlacement(null);
        return nextState;
      }

      const latestMove: Move = nextState.moves[nextState.moves.length - 1];
      placementEffectSequenceRef.current += 1;
      setLatestPlacement(
        createPlacementEffectFromMove(
          latestMove,
          `replay-${placementEffectSequenceRef.current}`,
          true
        )
      );

      return nextState;
    });
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

function createPlacementEffectFromMove(
  move: Move,
  idSuffix: string,
  replayOnly = false
): PlacementEffect {
  return {
    id: `${move.turn}-${move.player}-${move.row}-${move.col}-${idSuffix}`,
    player: move.player,
    position: { row: move.row, col: move.col },
    turn: move.turn,
    replayOnly
  };
}
