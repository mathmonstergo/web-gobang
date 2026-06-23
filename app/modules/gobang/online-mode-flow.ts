import { type OnlineGamePhase } from "@/modules/gobang/online-types";

export function canLeaveOnlineMode(phase: OnlineGamePhase | null): boolean {
  return phase !== "playing" && phase !== "resetting";
}
