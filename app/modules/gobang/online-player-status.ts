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
  const timerText = createTimerText(snapshot, now);

  return PLAYER_ORDER.map((color: Player): OnlinePlayerStatusModel => {
    const player = snapshot.players[color];
    return {
      color,
      nickname: player?.nickname ?? (color === "black" ? "黑棋" : "白棋"),
      avatarInitial: player?.avatarInitial ?? (color === "black" ? "黑" : "白"),
      avatarColor: player?.avatarColor ?? "#3a342c",
      isCurrentTurn:
        snapshot.phase === "playing" && snapshot.game.currentPlayer === color,
      isOnline:
        player?.isConnected === true && player.isHeartbeatHealthy === true,
      timerText
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
  now: number
): string | null {
  if (snapshot.startedAt === null || snapshot.turnStartedAt === null) {
    return null;
  }

  const gameTimeMs = now - snapshot.startedAt;
  const moveClockNow = snapshot.turnPausedAt ?? now;
  const moveTimeMs =
    moveClockNow - snapshot.turnStartedAt - snapshot.turnPausedDurationMs;

  return `步时 ${formatOnlineDuration(moveTimeMs)} · 局时 ${formatOnlineDuration(gameTimeMs)}`;
}

function padTwoDigits(value: number): string {
  return value.toString().padStart(2, "0");
}
