import {
  type OnlineRoomSnapshot,
  type PendingRoomRequest
} from "@/modules/gobang/online-types";
import { type Move } from "@/modules/gobang/types";

export function getIncomingOnlineRequest(
  snapshot: OnlineRoomSnapshot
): PendingRoomRequest | null {
  if (
    snapshot.pendingRequest === null ||
    snapshot.viewerColor === null ||
    snapshot.pendingRequest.requestedBy === snapshot.viewerColor
  ) {
    return null;
  }

  return snapshot.pendingRequest;
}

export function canRequestOnlineUndo(snapshot: OnlineRoomSnapshot): boolean {
  const latestMove: Move | undefined = snapshot.game.moves.at(-1);
  return (
    snapshot.phase === "playing" &&
    snapshot.pendingRequest === null &&
    snapshot.viewerColor !== null &&
    latestMove?.player === snapshot.viewerColor
  );
}

export function canRequestOnlineSurrender(
  snapshot: OnlineRoomSnapshot
): boolean {
  return (
    snapshot.phase === "playing" &&
    snapshot.pendingRequest === null &&
    snapshot.viewerColor !== null
  );
}
