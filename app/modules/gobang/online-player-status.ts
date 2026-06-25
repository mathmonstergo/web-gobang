import { type OnlineRoomSnapshot } from "@/modules/gobang/online-types";
import { type Player } from "@/modules/gobang/types";

const PLAYER_ORDER: readonly Player[] = ["black", "white"];

export type OnlinePlayerStatusModel = {
  color: Player;
  nickname: string;
  avatarInitial: string;
  avatarColor: string;
  isCurrentTurn: boolean;
  isOnline: boolean;
  timerText: string | null;
};

export function createOnlinePlayerStatusModels(
  snapshot: OnlineRoomSnapshot,
  now: number
): readonly OnlinePlayerStatusModel[] {
  return PLAYER_ORDER.map((color: Player): OnlinePlayerStatusModel => {
    const player = snapshot.players[color];
    const isEmptySlot = player === undefined;
    return {
      color,
      nickname: isEmptySlot
        ? "等待对手..."
        : player.nickname,
      avatarInitial: isEmptySlot
        ? (color === "black" ? "黑" : "白")
        : player.avatarInitial,
      avatarColor: isEmptySlot
        ? "#3a342c"
        : player.avatarColor,
      isCurrentTurn:
        !isEmptySlot &&
        snapshot.phase === "playing" &&
        snapshot.game.currentPlayer === color,
      isOnline:
        !isEmptySlot &&
        player.isConnected === true &&
        player.isHeartbeatHealthy === true,
      timerText: isEmptySlot ? null : createTimerText(snapshot, color, now)
    };
  });
}

export function formatOnlineDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${padTwoDigits(minutes)}:${padTwoDigits(seconds)}`;
}

function createTimerText(
  snapshot: OnlineRoomSnapshot,
  color: Player,
  now: number
): string | null {
  const clock = snapshot.clocks[color];
  if (snapshot.startedAt === null || clock === undefined) {
    return null;
  }

  const elapsedMs =
    snapshot.phase === "playing" &&
    snapshot.game.currentPlayer === color &&
    snapshot.turnStartedAt !== null
      ? Math.max(0, now - snapshot.turnStartedAt)
      : 0;
  const moveTimeMs = Math.max(0, clock.stepRemainingMs - elapsedMs);
  const gameTimeMs = Math.max(0, clock.gameRemainingMs - elapsedMs);

  return `步时 ${formatOnlineDuration(moveTimeMs)} · 局时 ${formatOnlineDuration(gameTimeMs)}`;
}

function padTwoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}
