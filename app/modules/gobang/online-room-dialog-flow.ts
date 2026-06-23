import { type OnlineProfile } from "@/modules/gobang/online-storage";

export type OnlineRoomDialogStep = "nickname" | "mode" | "auto-join";

type InitialOnlineDialogStepInput = {
  initialRoomCode: string | null;
  storedProfile: OnlineProfile | null;
};

export function getInitialOnlineDialogStep({
  initialRoomCode,
  storedProfile
}: InitialOnlineDialogStepInput): OnlineRoomDialogStep {
  if (storedProfile === null) {
    return "nickname";
  }

  return initialRoomCode === null ? "mode" : "auto-join";
}

export function getPostNicknameOnlineDialogStep(
  initialRoomCode: string | null
): OnlineRoomDialogStep {
  return initialRoomCode === null ? "mode" : "auto-join";
}
