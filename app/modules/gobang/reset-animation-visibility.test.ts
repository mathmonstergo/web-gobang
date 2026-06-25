import { describe, expect, it } from "vitest";

import { shouldDrawResetPhysicsStone } from "@/modules/gobang/reset-animation-visibility";

describe("reset animation visibility", () => {
  it("draws inactive reset copies when the logical board was already cleared", () => {
    expect(
      shouldDrawResetPhysicsStone({
        activeMoveKeys: new Set(),
        alpha: 1,
        isActivated: false,
        moveKey: "7:7"
      })
    ).toBe(true);
  });

  it("does not draw inactive reset copies while the logical stone is still drawn", () => {
    expect(
      shouldDrawResetPhysicsStone({
        activeMoveKeys: new Set(["7:7"]),
        alpha: 1,
        isActivated: false,
        moveKey: "7:7"
      })
    ).toBe(false);
  });

  it("draws activated reset copies after the shockwave handoff", () => {
    expect(
      shouldDrawResetPhysicsStone({
        activeMoveKeys: new Set(["7:7"]),
        alpha: 1,
        isActivated: true,
        moveKey: "7:7"
      })
    ).toBe(true);
  });
});
