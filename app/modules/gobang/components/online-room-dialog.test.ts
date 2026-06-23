import { describe, expect, it } from "vitest";

import {
  getInitialOnlineDialogStep,
  getPostNicknameOnlineDialogStep
} from "@/modules/gobang/online-room-dialog-flow";
import { type OnlineProfile } from "@/modules/gobang/online-storage";

const PROFILE: OnlineProfile = {
  playerId: "player-1",
  nickname: "阿达"
};

describe("online room dialog flow helpers", () => {
  it("auto-joins an invite link when a saved profile exists", () => {
    expect(
      getInitialOnlineDialogStep({
        initialRoomCode: "ABCD23",
        storedProfile: PROFILE
      })
    ).toBe("auto-join");
  });

  it("asks for nickname first, then auto-joins the invite link", () => {
    expect(
      getInitialOnlineDialogStep({
        initialRoomCode: "ABCD23",
        storedProfile: null
      })
    ).toBe("nickname");
    expect(getPostNicknameOnlineDialogStep("ABCD23")).toBe("auto-join");
  });

  it("keeps the manual mode selection flow when no invite link is present", () => {
    expect(
      getInitialOnlineDialogStep({
        initialRoomCode: null,
        storedProfile: PROFILE
      })
    ).toBe("mode");
    expect(getPostNicknameOnlineDialogStep(null)).toBe("mode");
  });
});
