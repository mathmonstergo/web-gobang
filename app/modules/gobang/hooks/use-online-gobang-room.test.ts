import { describe, expect, it } from "vitest";

import { createInitialState } from "@/modules/gobang/game-logic";
import { type OnlineProfile, type OnlineSession } from "@/modules/gobang/online-storage";
import {
  createOfficialClientMessage,
  deriveOnlineAvatar,
  getHeartbeatIntervalMs,
  prepareOnlineRoomSession
} from "@/modules/gobang/hooks/use-online-gobang-room";
import {
  type OnlineGamePhase,
  type OnlineRoomSnapshot
} from "@/modules/gobang/online-types";

describe("use online gobang room helpers", () => {
  it("derives stable avatar metadata from nickname and player id", () => {
    const chineseAvatar = deriveOnlineAvatar({
      nickname: "阿达",
      playerId: "player-1"
    });
    const englishAvatar = deriveOnlineAvatar({
      nickname: "ada",
      playerId: "player-1"
    });

    expect(chineseAvatar.avatarInitial).toBe("阿");
    expect(englishAvatar.avatarInitial).toBe("A");
    expect(chineseAvatar.avatarColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(
      deriveOnlineAvatar({ nickname: "阿达", playerId: "player-1" })
    ).toEqual(chineseAvatar);
  });

  it("reuses a matching room session and creates a new one when needed", () => {
    const profile: OnlineProfile = { nickname: "Ada", playerId: "player-1" };
    const savedSession: OnlineSession = {
      roomCode: "ABCD23",
      playerId: "player-1",
      sessionToken: "saved-token"
    };

    expect(
      prepareOnlineRoomSession("ABCD23", profile, savedSession, () => "new-token")
    ).toEqual(savedSession);
    expect(
      prepareOnlineRoomSession("JKLM89", profile, savedSession, () => "new-token")
    ).toEqual({
      roomCode: "JKLM89",
      playerId: "player-1",
      sessionToken: "new-token"
    });
  });

  it("selects heartbeat frequency by server phase", () => {
    expect(getHeartbeatIntervalMs(null)).toBe(1000);
    expect(getHeartbeatIntervalMs("waiting")).toBe(1000);
    expect(getHeartbeatIntervalMs("stabilizing")).toBe(1000);
    expect(getHeartbeatIntervalMs("playing")).toBe(5000);
    expect(getHeartbeatIntervalMs("ended")).toBe(5000);
  });

  it("does not serialize official gameplay messages before playing", () => {
    const stabilizingSnapshot = createSnapshot("stabilizing");
    const playingSnapshot = createSnapshot("playing");
    const endedSnapshot = createSnapshot("ended");

    expect(
      createOfficialClientMessage(stabilizingSnapshot, {
        type: "place",
        position: { row: 7, col: 7 }
      })
    ).toBeNull();
    expect(
      createOfficialClientMessage(stabilizingSnapshot, {
        type: "request_undo"
      })
    ).toBeNull();
    expect(
      createOfficialClientMessage(playingSnapshot, {
        type: "place",
        position: { row: 7, col: 7 }
      })
    ).toEqual({ type: "place", row: 7, col: 7 });
    expect(
      createOfficialClientMessage(playingSnapshot, {
        type: "start_new_game"
      })
    ).toBeNull();
    expect(
      createOfficialClientMessage(endedSnapshot, {
        type: "start_new_game"
      })
    ).toEqual({ type: "start_new_game" });
  });
});

function createSnapshot(phase: OnlineGamePhase): OnlineRoomSnapshot {
  return {
    roomCode: "ABCD23",
    players: {},
    game: createInitialState(),
    phase,
    endReason: null,
    pendingRequest: null,
    gameNumber: 1,
    startedAt: phase === "playing" ? 1000 : null,
    turnStartedAt: phase === "playing" ? 1000 : null,
    turnPausedAt: null,
    turnPausedDurationMs: 0,
    serverNow: 1000,
    viewerColor: "black"
  };
}
