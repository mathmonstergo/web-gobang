import { placeStone } from "@/modules/gobang/game-logic";
import { positionKey } from "@/modules/gobang/board-geometry";
import {
  type GameState,
  type Move,
  type PlacementEffect,
  type Position
} from "@/modules/gobang/types";
import { type OnlineRoomSnapshot } from "@/modules/gobang/online-types";

export type OptimisticOnlinePlacement = {
  game: GameState;
  gameNumber: number;
  move: Move;
  placement: PlacementEffect;
};

export function createOptimisticOnlinePlacement(
  snapshot: OnlineRoomSnapshot,
  position: Position
): OptimisticOnlinePlacement | null {
  if (
    snapshot.phase !== "playing" ||
    snapshot.viewerColor === null ||
    snapshot.viewerColor !== snapshot.game.currentPlayer
  ) {
    return null;
  }

  const result = placeStone(snapshot.game, position);
  if (result.success === false) {
    return null;
  }

  return {
    game: result.state,
    gameNumber: snapshot.gameNumber,
    move: result.move,
    placement: {
      id: `online-optimistic-${snapshot.gameNumber}-${result.move.turn}-${result.move.player}-${result.move.row}-${result.move.col}`,
      player: result.move.player,
      position: { row: result.move.row, col: result.move.col },
      turn: result.move.turn
    }
  };
}

export function shouldUseOptimisticOnlinePlacement(
  snapshot: OnlineRoomSnapshot | null,
  optimistic: OptimisticOnlinePlacement | null
): boolean {
  return (
    snapshot !== null &&
    optimistic !== null &&
    snapshot.phase === "playing" &&
    snapshot.gameNumber === optimistic.gameNumber &&
    snapshot.game.moves.length < optimistic.game.moves.length
  );
}

export function doesSnapshotContainOptimisticPlacement(
  snapshot: OnlineRoomSnapshot | null,
  optimistic: OptimisticOnlinePlacement | null
): boolean {
  if (snapshot?.gameNumber !== optimistic?.gameNumber) {
    return false;
  }

  if (snapshot === null || optimistic === null) {
    return false;
  }

  return snapshot.game.moves.some(
    (move: Move) =>
      move.turn === optimistic.move.turn &&
      move.player === optimistic.move.player &&
      positionKey(move) === positionKey(optimistic.move)
  );
}
