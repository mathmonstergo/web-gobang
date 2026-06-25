import { describe, expect, it } from "vitest";

import { getPrimaryActionState } from "@/modules/gobang/online-action-state";

describe("online primary action state", () => {
  it("keeps the warm-up reset action before an online snapshot arrives", () => {
    expect(
      getPrimaryActionState({
        canRequestOnlineSurrender: false,
        canStart: false,
        isOnlineRoomActive: true,
        isResetPending: false,
        isUsingServerBoard: false,
        onlinePhase: null
      })
    ).toEqual({
      disabled: false,
      intent: "local-reset",
      label: "新局"
    });
  });

  it("keeps the warm-up reset action while waiting for start readiness", () => {
    expect(
      getPrimaryActionState({
        canRequestOnlineSurrender: false,
        canStart: false,
        isOnlineRoomActive: true,
        isResetPending: false,
        isUsingServerBoard: false,
        onlinePhase: "stabilizing"
      })
    ).toEqual({
      disabled: false,
      intent: "local-reset",
      label: "新局"
    });
  });

  it("uses start only after the server snapshot says the room can start", () => {
    expect(
      getPrimaryActionState({
        canRequestOnlineSurrender: false,
        canStart: true,
        isOnlineRoomActive: true,
        isResetPending: false,
        isUsingServerBoard: false,
        onlinePhase: "stabilizing"
      })
    ).toEqual({
      disabled: false,
      intent: "start-game",
      label: "开始"
    });
  });

  it("uses surrender during official online play", () => {
    expect(
      getPrimaryActionState({
        canRequestOnlineSurrender: true,
        canStart: false,
        isOnlineRoomActive: true,
        isResetPending: false,
        isUsingServerBoard: true,
        onlinePhase: "playing"
      })
    ).toEqual({
      disabled: false,
      intent: "surrender",
      label: "认输"
    });
  });
});
