import { type RollingActionLabelValue } from "@/modules/gobang/components/rolling-action-label";
import { type OnlineGamePhase } from "@/modules/gobang/online-types";

export type PrimaryActionIntent = "local-reset" | "start-game" | "surrender";

export type PrimaryActionState = {
  disabled: boolean;
  intent: PrimaryActionIntent;
  label: RollingActionLabelValue;
};

type PrimaryActionStateInput = {
  canRequestOnlineSurrender: boolean;
  canStart: boolean;
  isOnlineRoomActive: boolean;
  isResetPending: boolean;
  isUsingServerBoard: boolean;
  onlinePhase: OnlineGamePhase | null;
};

export function getPrimaryActionState(
  input: PrimaryActionStateInput
): PrimaryActionState {
  if (!input.isOnlineRoomActive) {
    return {
      disabled: input.isResetPending,
      intent: "local-reset",
      label: "新局"
    };
  }

  if (input.onlinePhase === "playing") {
    return {
      disabled: input.isResetPending || !input.canRequestOnlineSurrender,
      intent: "surrender",
      label: "认输"
    };
  }

  if (input.canStart) {
    return {
      disabled: input.isResetPending,
      intent: "start-game",
      label: "开始"
    };
  }

  if (!input.isUsingServerBoard) {
    return {
      disabled: input.isResetPending,
      intent: "local-reset",
      label: "新局"
    };
  }

  return {
    disabled: true,
    intent: "start-game",
    label: "开始"
  };
}
