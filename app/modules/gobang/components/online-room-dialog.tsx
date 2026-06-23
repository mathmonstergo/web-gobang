import { Check, Search } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type SyntheticEvent
} from "react";

import { CommonModal } from "@/modules/gobang/components/common-modal";
import {
  createOnlineRoom,
  parseInviteRoomCode,
  validateOnlineRoom
} from "@/modules/gobang/online-room-client";
import {
  loadOnlineProfile,
  saveOnlineProfile,
  validateNickname,
  type OnlineProfile
} from "@/modules/gobang/online-storage";
import {
  getInitialOnlineDialogStep,
  getPostNicknameOnlineDialogStep,
  type OnlineRoomDialogStep
} from "@/modules/gobang/online-room-dialog-flow";

export type OnlineRoomReady = {
  didCopyInvite: boolean;
  roomCode: string;
  inviteUrl: string;
  nickname: string;
  source: "create" | "join";
};

type OnlineRoomDialogProps = {
  isOpen: boolean;
  initialRoomCode: string | null;
  onClose: () => void;
  onRoomReady: (room: OnlineRoomReady) => void;
};

type JoinCheckState = "idle" | "checking" | "valid";
const JOIN_PANEL_ANIMATION_MS = 260;

export function OnlineRoomDialog({
  isOpen,
  initialRoomCode,
  onClose,
  onRoomReady
}: OnlineRoomDialogProps): ReactElement | null {
  const nicknameInputId = useId();
  const joinInputId = useId();
  const [profile, setProfile] = useState<OnlineProfile | null>(null);
  const [step, setStep] = useState<OnlineRoomDialogStep>("nickname");
  const [nicknameInput, setNicknameInput] = useState("");
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [isJoinExpanded, setIsJoinExpanded] = useState(false);
  const [shouldRenderJoinControls, setShouldRenderJoinControls] =
    useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinCheckState, setJoinCheckState] =
    useState<JoinCheckState>("idle");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const joinTimerRef = useRef<number | null>(null);
  const onRoomReadyRef = useRef(onRoomReady);
  const clearJoinTimer = useCallback((): void => {
    if (joinTimerRef.current !== null) {
      window.clearTimeout(joinTimerRef.current);
      joinTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    onRoomReadyRef.current = onRoomReady;
  }, [onRoomReady]);

  const showJoinFailure = useCallback(
    (roomCode: string, message: string): void => {
      clearJoinTimer();
      setStep("mode");
      setIsJoinExpanded(true);
      setShouldRenderJoinControls(true);
      setJoinInput(roomCode);
      setJoinError(message);
      setJoinCheckState("idle");
    },
    [clearJoinTimer]
  );

  const finishJoin = useCallback(
    (roomCode: string, nextProfile: OnlineProfile): void => {
      onRoomReadyRef.current({
        didCopyInvite: false,
        roomCode,
        inviteUrl: `${window.location.origin}/?room=${roomCode}`,
        nickname: nextProfile.nickname,
        source: "join"
      });
    },
    []
  );

  const attemptJoinRoom = useCallback(
    async (
      roomCode: string,
      nextProfile: OnlineProfile,
      enterDelayMs: number
    ): Promise<void> => {
      clearJoinTimer();
      setJoinError(null);
      setJoinCheckState("checking");

      try {
        const validation = await validateOnlineRoom(roomCode);
        if ("reason" in validation && validation.reason === "invalid-format") {
          showJoinFailure(roomCode, "邀请码或链接格式不对");
          return;
        }

        if (!validation.exists) {
          showJoinFailure(roomCode, "房间不存在");
          return;
        }

        if (!validation.joinable) {
          showJoinFailure(roomCode, "房间已满");
          return;
        }

        if (enterDelayMs <= 0) {
          finishJoin(roomCode, nextProfile);
          return;
        }

        setJoinCheckState("valid");
        joinTimerRef.current = window.setTimeout(() => {
          joinTimerRef.current = null;
          finishJoin(roomCode, nextProfile);
        }, enterDelayMs);
      } catch {
        showJoinFailure(roomCode, "房间不存在");
      }
    },
    [clearJoinTimer, finishJoin, showJoinFailure]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const storedProfile = loadOnlineProfile();
    const initialStep = getInitialOnlineDialogStep({
      initialRoomCode,
      storedProfile
    });
    setProfile(storedProfile);
    setStep(initialStep);
    setNicknameInput(storedProfile?.nickname ?? "");
    setNicknameError(null);
    const shouldOpenJoin = initialRoomCode !== null && initialStep === "mode";
    setIsJoinExpanded(shouldOpenJoin);
    setShouldRenderJoinControls(shouldOpenJoin);
    setJoinInput(initialRoomCode ?? "");
    setJoinError(null);
    setJoinCheckState("idle");
    clearJoinTimer();

    if (
      initialStep === "auto-join" &&
      storedProfile !== null &&
      initialRoomCode !== null
    ) {
      void attemptJoinRoom(initialRoomCode, storedProfile, 0);
    }
  }, [attemptJoinRoom, clearJoinTimer, initialRoomCode, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      clearJoinTimer();
    }
  }, [clearJoinTimer, isOpen]);

  useEffect(() => {
    if (isJoinExpanded) {
      setShouldRenderJoinControls(true);
      return;
    }

    const joinPanelTimer = window.setTimeout(() => {
      setShouldRenderJoinControls(false);
    }, JOIN_PANEL_ANIMATION_MS);

    return () => {
      window.clearTimeout(joinPanelTimer);
    };
  }, [isJoinExpanded]);

  useEffect(() => {
    return () => {
      clearJoinTimer();
    };
  }, [clearJoinTimer]);

  const title = step === "nickname" ? "输入昵称" : "请选择联机方式";

  const handleNicknameSubmit = (
    event: SyntheticEvent<HTMLFormElement>
  ): void => {
    event.preventDefault();
    const validation = validateNickname(nicknameInput);
    if (validation.success === false) {
      setNicknameError(
        validation.error === "too-long" ? "昵称不能超过8个字符" : "请输入昵称"
      );
      return;
    }

    const nextProfile: OnlineProfile = {
      playerId: crypto.randomUUID(),
      nickname: validation.nickname
    };
    saveOnlineProfile(nextProfile);
    setProfile(nextProfile);
    setNicknameError(null);

    if (
      getPostNicknameOnlineDialogStep(initialRoomCode) === "auto-join" &&
      initialRoomCode !== null
    ) {
      setStep("auto-join");
      void attemptJoinRoom(initialRoomCode, nextProfile, 0);
      return;
    }

    setStep("mode");
  };

  const handleCreateRoom = async (): Promise<void> => {
    if (profile === null || isCreatingRoom) {
      return;
    }

    setIsCreatingRoom(true);
    try {
      const room = await createOnlineRoom();
      const didCopyInvite = await copyTextToClipboard(room.inviteUrl);
      onRoomReadyRef.current({
        ...room,
        didCopyInvite,
        nickname: profile.nickname,
        source: "create"
      });
    } catch {
      setJoinError("创建房间失败");
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleValidateJoin = async (): Promise<void> => {
    if (profile === null || joinCheckState === "checking") {
      return;
    }

    clearJoinTimer();
    setJoinError(null);
    setJoinCheckState("checking");
    const roomCode = parseInviteRoomCode(joinInput);
    if (roomCode === null) {
      setJoinError("邀请码或链接格式不对");
      setJoinCheckState("idle");
      return;
    }

    try {
      await attemptJoinRoom(roomCode, profile, 1000);
    } catch {
      setJoinError("房间不存在");
      setJoinCheckState("idle");
    }
  };

  if (step === "auto-join") {
    return null;
  }

  return (
    <CommonModal isOpen={isOpen} onClose={onClose} title={title}>
      {step === "nickname" ? (
        <form className="online-dialog-stack" onSubmit={handleNicknameSubmit}>
          <div className="online-field">
            <span className="online-field-label" id={`${nicknameInputId}-label`}>
              昵称
            </span>
            <input
              aria-labelledby={`${nicknameInputId}-label`}
              autoFocus
              className="online-text-input"
              id={nicknameInputId}
              maxLength={16}
              onChange={(event) => {
                setNicknameInput(event.target.value);
                setNicknameError(null);
              }}
              value={nicknameInput}
            />
          </div>
          {nicknameError !== null ? (
            <p className="online-field-error">{nicknameError}</p>
          ) : null}
          <button className="online-primary-action" type="submit">
            确认
          </button>
        </form>
      ) : (
        <div className="online-dialog-stack">
          <div className="online-choice-grid">
            <button
              className="online-choice-button"
              disabled={isCreatingRoom}
              onClick={() => {
                void handleCreateRoom();
              }}
              type="button"
            >
              <span>{isCreatingRoom ? "创建中" : "创建房间"}</span>
              <small>自动复制邀请链接</small>
            </button>
            <button
              className="online-choice-button"
              onClick={() => {
                const shouldOpenJoin = !isJoinExpanded;
                if (shouldOpenJoin) {
                  setShouldRenderJoinControls(true);
                }
                setIsJoinExpanded(shouldOpenJoin);
                setJoinError(null);
                clearJoinTimer();
              }}
              type="button"
            >
              <span>加入房间</span>
              <small>需要输入邀请码/链接</small>
            </button>
          </div>

          <div
            aria-hidden={!isJoinExpanded}
            className={[
              "online-join-panel",
              isJoinExpanded ? "is-expanded" : ""
            ].join(" ")}
          >
            {shouldRenderJoinControls ? (
              <>
                <div className="online-field">
                  <span
                    className="online-field-label"
                    id={`${joinInputId}-label`}
                  >
                    邀请码/链接
                  </span>
                  <span className="online-input-row">
                    <input
                      aria-labelledby={`${joinInputId}-label`}
                      className="online-text-input"
                      disabled={!isJoinExpanded}
                      id={joinInputId}
                      onChange={(event) => {
                        setJoinInput(event.target.value);
                        setJoinError(null);
                        setJoinCheckState("idle");
                        clearJoinTimer();
                      }}
                      value={joinInput}
                    />
                    <button
                      aria-label="检测邀请码或链接"
                      className="online-icon-button"
                      disabled={
                        !isJoinExpanded || joinCheckState === "checking"
                      }
                      onClick={() => {
                        void handleValidateJoin();
                      }}
                      type="button"
                    >
                      <Search aria-hidden="true" size={16} />
                    </button>
                    {joinCheckState === "valid" ? (
                      <Check
                        aria-label="邀请码有效"
                        className="online-valid-check"
                        size={17}
                      />
                    ) : null}
                  </span>
                </div>
                {joinError !== null ? (
                  <p className="online-field-error">{joinError}</p>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      )}
    </CommonModal>
  );
}

async function copyTextToClipboard(value: string): Promise<boolean> {
  if (!("clipboard" in navigator)) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}
