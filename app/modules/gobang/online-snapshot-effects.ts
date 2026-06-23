import {
  type GameState,
  type Move,
  type PlacementEffect,
  type Player
} from "@/modules/gobang/types";
import { type OnlineRoomSnapshot } from "@/modules/gobang/online-types";

export type OnlineResetTransition = {
  gameNumber: number;
  moves: readonly Move[];
  visualGame: GameState;
};

export function deriveOnlinePlacementEffect(
  previous: OnlineRoomSnapshot | null,
  current: OnlineRoomSnapshot
): PlacementEffect | null {
  if (previous?.gameNumber !== current.gameNumber) {
    return null;
  }

  if (current.game.moves.length !== previous.game.moves.length + 1) {
    return null;
  }

  const latestMove: Move | undefined = current.game.moves.at(-1);
  if (latestMove === undefined) {
    return null;
  }

  return {
    id: [
      "online",
      current.gameNumber,
      latestMove.turn,
      latestMove.player,
      latestMove.row,
      latestMove.col,
      current.serverNow
    ].join("-"),
    player: latestMove.player,
    position: { row: latestMove.row, col: latestMove.col },
    turn: latestMove.turn
  };
}

export function getOnlineResetTransition(
  previous: OnlineRoomSnapshot | null,
  current: OnlineRoomSnapshot
): OnlineResetTransition | null {
  if (
    previous === null ||
    current.gameNumber <= previous.gameNumber ||
    previous.game.moves.length === 0 ||
    current.game.moves.length !== 0
  ) {
    return null;
  }

  return {
    gameNumber: current.gameNumber,
    moves: previous.game.moves,
    visualGame: previous.game
  };
}

export function getOnlineBoardPreviewPlayer(
  snapshot: OnlineRoomSnapshot
): Player | null {
  if (
    snapshot.phase !== "playing" ||
    snapshot.game.status !== "playing" ||
    snapshot.viewerColor === null ||
    snapshot.viewerColor !== snapshot.game.currentPlayer
  ) {
    return null;
  }

  return snapshot.viewerColor;
}
