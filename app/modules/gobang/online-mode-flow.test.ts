import { describe, expect, it } from "vitest";

import { canLeaveOnlineMode } from "@/modules/gobang/online-mode-flow";
import { type OnlineGamePhase } from "@/modules/gobang/online-types";

describe("online mode flow helpers", () => {
  it("allows returning to local mode before the online game starts or after it ends", () => {
    const allowedPhases: (OnlineGamePhase | null)[] = [
      null,
      "waiting",
      "stabilizing",
      "ended"
    ];

    for (const phase of allowedPhases) {
      expect(canLeaveOnlineMode(phase)).toBe(true);
    }
  });

  it("blocks returning to local mode while the online game is active", () => {
    const blockedPhases: OnlineGamePhase[] = ["playing", "resetting"];

    for (const phase of blockedPhases) {
      expect(canLeaveOnlineMode(phase)).toBe(false);
    }
  });
});
