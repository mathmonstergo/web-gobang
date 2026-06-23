import { Copy, RefreshCcw, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import {
  GobangBoard,
  type GobangBoardHandle,
  type ScreenPoint
} from "@/modules/gobang/components/gobang-board";
import { OnlineNotificationStack } from "@/modules/gobang/components/online-notification-stack";
import {
  OnlineRoomDialog,
  type OnlineRoomReady
} from "@/modules/gobang/components/online-room-dialog";
import {
  RollingActionLabel,
  type RollingActionLabelValue
} from "@/modules/gobang/components/rolling-action-label";
import { primeGobangAudio } from "@/modules/gobang/audio-effects";
import { deriveEffects } from "@/modules/gobang/effects";
import { useGobangGame } from "@/modules/gobang/hooks/use-gobang-game";
import { useOnlineGobangRoom } from "@/modules/gobang/hooks/use-online-gobang-room";
import { parseInviteRoomCode } from "@/modules/gobang/online-room-client";
import { loadOnlineProfile } from "@/modules/gobang/online-storage";
import { type OnlineGamePhase } from "@/modules/gobang/online-types";
import {
  type DerivedEffects,
  type GameState,
  type Move,
  type Player,
  type Position
} from "@/modules/gobang/types";

export function GobangGame(): ReactElement {
  const localGame = useGobangGame();
  const warmupGame = useGobangGame({ persistence: "memory" });
  const onlineRoomClient = useOnlineGobangRoom();
  const boardRef = useRef<GobangBoardHandle | null>(null);
  const resetButtonRef = useRef<HTMLButtonElement | null>(null);
  const resetTimeoutRef = useRef<number | null>(null);
  const [isResetPending, setIsResetPending] = useState(false);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomReady | null>(null);
  const [initialOnlineRoomCode, setInitialOnlineRoomCode] = useState<
    string | null
  >(getInitialInviteRoomCode);
  const [isOnlineDialogOpen, setIsOnlineDialogOpen] = useState(
    initialOnlineRoomCode !== null
  );
  const onlineSnapshot = onlineRoomClient.snapshot;
  const isOnlineRoomActive = onlineRoom !== null;
  const isUsingServerBoard =
    isOnlineRoomActive &&
    onlineSnapshot !== null &&
    isAuthoritativeOnlinePhase(onlineSnapshot.phase);
  const serverEffects: DerivedEffects | null = useMemo(
    () =>
      onlineSnapshot === null
        ? null
        : deriveEffects(onlineSnapshot.game, null),
    [onlineSnapshot]
  );
  const state: GameState =
    isUsingServerBoard
      ? onlineSnapshot.game
      : isOnlineRoomActive
        ? warmupGame.state
        : localGame.state;
  const effects: DerivedEffects =
    isUsingServerBoard && serverEffects !== null
      ? serverEffects
      : isOnlineRoomActive
        ? warmupGame.effects
        : localGame.effects;
  const currentLabel: string = getPlayerLabel(state.currentPlayer);
  const winnerLabel: string | null =
    state.winner === null ? null : getPlayerLabel(state.winner.player);
  const latestMove: Move | undefined = state.moves.at(-1);
  const canRequestOnlineUndo =
    isUsingServerBoard &&
    onlineSnapshot.phase === "playing" &&
    latestMove?.player === onlineSnapshot.viewerColor;
  const resetActionLabel: RollingActionLabelValue =
    isUsingServerBoard && onlineSnapshot.phase === "playing" ? "认输" : "新局";
  const isUndoDisabled =
    isResetPending ||
    (isUsingServerBoard ? !canRequestOnlineUndo : state.moves.length === 0);
  const isResetDisabled = isResetPending;
  const handleReset = (): void => {
    primeGobangAudio();

    if (isResetDisabled) {
      return;
    }

    if (isUsingServerBoard && onlineSnapshot.phase === "playing") {
      onlineRoomClient.requestSurrender();
      return;
    }

    if (resetTimeoutRef.current !== null) {
      window.clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }

    const delayMs: number = boardRef.current?.playResetAnimation(
      state.moves,
      getElementCenter(resetButtonRef.current)
    ) ?? 0;

    if (delayMs <= 0) {
      setIsResetPending(false);
      resetActiveBoard();
      return;
    }

    setIsResetPending(true);
    resetActiveBoard();
    resetTimeoutRef.current = window.setTimeout(() => {
      resetTimeoutRef.current = null;
      setIsResetPending(false);
    }, delayMs);
  };
  const handleUndo = (): void => {
    primeGobangAudio();

    if (isResetPending || state.moves.length === 0) {
      return;
    }

    if (isUsingServerBoard) {
      onlineRoomClient.requestUndo();
      return;
    }

    if (latestMove !== undefined) {
      boardRef.current?.playUndoAnimation(latestMove);
    }
    if (isOnlineRoomActive) {
      warmupGame.undo();
      return;
    }

    localGame.undo();
  };
  const handlePlace = (position: Position): void => {
    if (isResetPending) {
      return;
    }

    if (isUsingServerBoard) {
      if (
        onlineSnapshot.phase === "playing" &&
        onlineSnapshot.viewerColor === state.currentPlayer
      ) {
        onlineRoomClient.placeAt(position);
      }
      return;
    }

    if (isOnlineRoomActive) {
      warmupGame.placeAt(position);
      return;
    }

    localGame.placeAt(position);
  };
  const resetActiveBoard = (): void => {
    if (isUsingServerBoard) {
      if (onlineSnapshot.phase === "ended") {
        onlineRoomClient.startNewGame();
      }
      return;
    }

    if (isOnlineRoomActive) {
      warmupGame.reset();
      return;
    }

    localGame.reset();
  };
  const handleOnlineEntry = (): void => {
    setInitialOnlineRoomCode(null);
    setIsOnlineDialogOpen(true);
  };
  const handleOnlineRoomReady = (room: OnlineRoomReady): void => {
    const profile = loadOnlineProfile();
    if (profile === null) {
      setInitialOnlineRoomCode(room.roomCode);
      setIsOnlineDialogOpen(true);
      return;
    }

    setOnlineRoom(room);
    setInitialOnlineRoomCode(null);
    setIsOnlineDialogOpen(false);
    onlineRoomClient.connectRoom({
      roomCode: room.roomCode,
      inviteUrl: room.inviteUrl,
      profile
    });
    if (room.source === "create") {
      onlineRoomClient.addLocalNotification(
        "invite-copied",
        room.didCopyInvite ? "邀请链接已复制" : "房间已创建"
      );
    }
  };
  const handleCopyOnlineInvite = async (): Promise<void> => {
    if (onlineRoom === null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(onlineRoom.inviteUrl);
      onlineRoomClient.addLocalNotification("invite-copied", "邀请链接已复制");
    } catch {
      onlineRoomClient.addLocalNotification("invite-copied", "复制失败");
    }
  };

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current !== null) {
        window.clearTimeout(resetTimeoutRef.current);
      }
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="game-layout" aria-label="Web Gobang">
        <div className="play-area">
          <header className="game-header">
            <div className="game-title-row">
              <button
                aria-label="进入联机模式"
                className="game-title-button"
                onClick={handleOnlineEntry}
                type="button"
              >
                <p className="eyebrow">WEB GOBANG</p>
                <h1>五子棋</h1>
              </button>
              {onlineRoom !== null ? (
                <button
                  aria-label="复制联机邀请链接"
                  className="online-room-chip"
                  onClick={() => {
                    void handleCopyOnlineInvite();
                  }}
                  type="button"
                >
                  <span>ONLINE</span>
                  <strong>{onlineRoom.roomCode}</strong>
                  <Copy aria-hidden="true" size={13} />
                </button>
              ) : null}
            </div>
            <div className="status-stack" aria-live="polite">
              <span
                className={[
                  "status-pill",
                  state.currentPlayer === "black"
                    ? "status-black"
                    : "status-white"
                ].join(" ")}
              >
                {winnerLabel === null ? `${currentLabel}回合` : `${winnerLabel}胜`}
              </span>
            </div>
          </header>

          <GobangBoard
            ref={boardRef}
            effects={effects}
            onPlace={handlePlace}
            state={state}
          />

          <div className="controls" aria-label="游戏控制">
            <button
              ref={resetButtonRef}
              className="control-button primary"
              disabled={isResetDisabled}
              onClick={handleReset}
              type="button"
            >
              <RefreshCcw aria-hidden="true" size={16} />
              <RollingActionLabel label={resetActionLabel} />
            </button>
            <button
              className="control-button"
              disabled={isUndoDisabled}
              onClick={handleUndo}
              type="button"
            >
              <Undo2 aria-hidden="true" size={16} />
              耍赖皮
            </button>
          </div>
        </div>
      </section>
      <OnlineRoomDialog
        initialRoomCode={initialOnlineRoomCode}
        isOpen={isOnlineDialogOpen}
        onClose={() => {
          setIsOnlineDialogOpen(false);
        }}
        onRoomReady={handleOnlineRoomReady}
      />
      <OnlineNotificationStack notifications={onlineRoomClient.notifications} />
    </main>
  );
}

function getPlayerLabel(player: Player): string {
  return player === "black" ? "黑棋" : "白棋";
}

function isAuthoritativeOnlinePhase(phase: OnlineGamePhase): boolean {
  return phase === "playing" || phase === "ended" || phase === "resetting";
}

function getElementCenter(element: HTMLElement | null): ScreenPoint | undefined {
  if (element === null) {
    return undefined;
  }

  const rect: DOMRect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function getInitialInviteRoomCode(): string | null {
  return parseInviteRoomCode(window.location.href);
}
