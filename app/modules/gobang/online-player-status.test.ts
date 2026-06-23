import { describe, expect, it } from "vitest";

import {
  createOnlinePlayerStatusModels,
  formatOnlineDuration
} from "@/modules/gobang/online-player-status";
import { createInitialState } from "@/modules/gobang/game-logic";
import { type OnlineRoomSnapshot } from "@/modules/gobang/online-types";

describe("online player status", () => {
  it("formats durations as minute-second text", () => {
    expect(formatOnlineDuration(0)).toBe("00:00");
    expect(formatOnlineDuration(65_000)).toBe("01:05");
    expect(formatOnlineDuration(3_725_000)).toBe("62:05");
  });

  it("shows independent countdowns for the active and inactive players", () => {
    const models = createOnlinePlayerStatusModels(
      snapshot({
        startedAt: 1_000,
        turnStartedAt: 2_000,
        clocks: {
          black: { stepRemainingMs: 45_000, gameRemainingMs: 600_000 },
          white: { stepRemainingMs: 45_000, gameRemainingMs: 600_000 }
        }
      }),
      12_000
    );

    expect(models[0]?.timerText).toBe("步时 00:35 · 局时 09:50");
    expect(models[1]?.timerText).toBe("步时 00:45 · 局时 10:00");
  });

  it("marks the current turn and connection health per player", () => {
    const models = createOnlinePlayerStatusModels(snapshot(), 12_000);

    expect(models[0]).toMatchObject({
      color: "black",
      nickname: "Ada",
      avatarInitial: "A",
      isCurrentTurn: true,
      isOnline: true
    });
    expect(models[1]).toMatchObject({
      color: "white",
      nickname: "Lin",
      avatarInitial: "L",
      isCurrentTurn: false,
      isOnline: false
    });
  });
});

function snapshot(
  overrides: Partial<OnlineRoomSnapshot> = {}
): OnlineRoomSnapshot {
  return {
    roomCode: "ABCDEF",
    players: {
      black: {
        playerId: "black-id",
        sessionTokenHash: "black-token",
        nickname: "Ada",
        avatarInitial: "A",
        avatarColor: "#2f8f68",
        color: "black",
        isConnected: true,
        isHeartbeatHealthy: true,
        disconnectedAt: null
      },
      white: {
        playerId: "white-id",
        sessionTokenHash: "white-token",
        nickname: "Lin",
        avatarInitial: "L",
        avatarColor: "#5f79c8",
        color: "white",
        isConnected: true,
        isHeartbeatHealthy: false,
        disconnectedAt: null
      }
    },
    game: createInitialState(),
    phase: "playing",
    endReason: null,
    pendingRequest: null,
    clocks: {
      black: { stepRemainingMs: 45_000, gameRemainingMs: 600_000 },
      white: { stepRemainingMs: 45_000, gameRemainingMs: 600_000 }
    },
    gameNumber: 1,
    startedAt: 1_000,
    turnStartedAt: 1_000,
    turnPausedAt: null,
    turnPausedDurationMs: 0,
    serverNow: 10_000,
    viewerColor: "black",
    canStart: false,
    ...overrides
  };
}
