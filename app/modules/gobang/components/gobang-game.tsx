import { Copy, RefreshCcw, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import {
  GobangBoard,
  type GobangBoardHandle,
  type ScreenPoint
} from "@/modules/gobang/components/gobang-board";
import { CommonModal } from "@/modules/gobang/components/common-modal";
import { OnlineNotificationStack } from "@/modules/gobang/components/online-notification-stack";
import {
  OnlineRoomDialog,
  type OnlineRoomReady
} from "@/modules/gobang/components/online-room-dialog";
import { OnlinePlayerStatusPanel } from "@/modules/gobang/components/online-player-status-panel";
import {
  RollingActionLabel,
  type RollingActionLabelValue
} from "@/modules/gobang/components/rolling-action-label";
import { primeGobangAudio } from "@/modules/gobang/audio-effects";
import { deriveEffects } from "@/modules/gobang/effects";
import { useGobangGame } from "@/modules/gobang/hooks/use-gobang-game";
import { useOnlineGobangRoom } from "@/modules/gobang/hooks/use-online-gobang-room";
import { canLeaveOnlineMode } from "@/modules/gobang/online-mode-flow";
import {
  canRequestOnlineSurrender,
  canRequestOnlineUndo,
  getIncomingOnlineRequest
} from "@/modules/gobang/online-request-state";
import { parseInviteRoomCode } from "@/modules/gobang/online-room-client";
import {
  deriveOnlinePlacementEffect,
  getOnlineBoardPreviewPlayer,
  getOnlineResetTransition,
  getOnlineUndoTransition
} from "@/modules/gobang/online-snapshot-effects";
import { loadOnlineProfile } from "@/modules/gobang/online-storage";
import {
  type OnlineGamePhase,
  type OnlineRoomSnapshot
} from "@/modules/gobang/online-types";
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
  const warmupState = warmupGame.state;
  const resetWarmupGame = warmupGame.reset;
  const onlineRoomClient = useOnlineGobangRoom();
  const boardRef = useRef<GobangBoardHandle | null>(null);
  const resetButtonRef = useRef<HTMLButtonElement | null>(null);
  const resetTimeoutRef = useRef<number | null>(null);
  const onlineResetTimeoutRef = useRef<number | null>(null);
  const previousOnlineSnapshotRef = useRef<OnlineRoomSnapshot | null>(null);
  const [isResetPending, setIsResetPending] = useState(false);
  const [onlineResetVisual, setOnlineResetVisual] = useState<{
    game: GameState;
    gameNumber: number;
  } | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoomReady | null>(null);
  const [initialOnlineRoomCode, setInitialOnlineRoomCode] = useState<
    string | null
  >(getInitialInviteRoomCode);
  const [isOnlineDialogOpen, setIsOnlineDialogOpen] = useState(
    initialOnlineRoomCode !== null
  );
  const [isOnlineExitNoticeOpen, setIsOnlineExitNoticeOpen] = useState(false);
  const completeOnlineResetAnimation = onlineRoomClient.completeResetAnimation;
  const onlineSnapshot = onlineRoomClient.snapshot;
  const onlineGamePhase: OnlineGamePhase | null = onlineSnapshot?.phase ?? null;
  const isOnlineRoomActive = onlineRoom !== null;
  const onlineResetTransition =
    onlineSnapshot === null
      ? null
      : getOnlineResetTransition(
          previousOnlineSnapshotRef.current,
          onlineSnapshot
        );
  const onlineWarmupStartVisualGame =
    onlineSnapshot !== null &&
    previousOnlineSnapshotRef.current !== null &&
    previousOnlineSnapshotRef.current.phase !== "playing" &&
    onlineSnapshot.phase === "playing" &&
    onlineSnapshot.game.moves.length === 0 &&
    warmupState.moves.length > 0
      ? warmupState
      : null;
  const persistedOnlineResetVisual =
    onlineSnapshot !== null &&
    onlineResetVisual?.gameNumber === onlineSnapshot.gameNumber
      ? onlineResetVisual
      : null;
  const onlineResetVisualGame: GameState | null =
    persistedOnlineResetVisual?.game ??
    onlineResetTransition?.visualGame ??
    onlineWarmupStartVisualGame ??
    null;
  const isShowingOnlineResetVisual = onlineResetVisualGame !== null;
  const isUsingServerBoard =
    isOnlineRoomActive &&
    onlineSnapshot !== null &&
    (isAuthoritativeOnlinePhase(onlineSnapshot.phase) ||
      isShowingOnlineResetVisual);
  const serverEffects: DerivedEffects | null = useMemo(
    () =>
      onlineSnapshot === null
        ? null
        : deriveEffects(
            onlineSnapshot.game,
            deriveOnlinePlacementEffect(
              previousOnlineSnapshotRef.current,
              onlineSnapshot
            )
          ),
    [onlineSnapshot]
  );
  const state: GameState =
    isUsingServerBoard
      ? onlineResetVisualGame ?? onlineSnapshot.game
      : isOnlineRoomActive
        ? warmupState
        : localGame.state;
  const effects: DerivedEffects =
    isUsingServerBoard && onlineResetVisualGame !== null
      ? deriveEffects(onlineResetVisualGame, null)
      : isUsingServerBoard && serverEffects !== null
        ? serverEffects
        : isOnlineRoomActive
          ? warmupGame.effects
          : localGame.effects;
  const onlinePreviewPlayer =
    onlineSnapshot === null ? null : getOnlineBoardPreviewPlayer(onlineSnapshot);
  const previewPlayer: Player | null =
    isUsingServerBoard ? onlinePreviewPlayer : state.currentPlayer;
  const isPlacementEnabled =
    isUsingServerBoard ? onlinePreviewPlayer !== null : state.status === "playing";
  const currentLabel: string = getPlayerLabel(state.currentPlayer);
  const winnerLabel: string | null =
    state.winner === null ? null : getPlayerLabel(state.winner.player);
  const latestMove: Move | undefined = state.moves.at(-1);
  const canRequestOnlineUndoAction =
    onlineSnapshot !== null && canRequestOnlineUndo(onlineSnapshot);
  const canRequestOnlineSurrenderAction =
    onlineSnapshot !== null && canRequestOnlineSurrender(onlineSnapshot);
  const incomingOnlineRequest =
    onlineSnapshot === null ? null : getIncomingOnlineRequest(onlineSnapshot);
  const incomingRequestTitle =
    incomingOnlineRequest?.type === "undo" ? "对方请求悔棋" : "对方请求认输";
  const canSendOnlineUndo =
    isUsingServerBoard && canRequestOnlineUndoAction;
  const resetActionLabel: RollingActionLabelValue =
    isOnlineRoomActive
      ? onlineSnapshot?.phase === "playing"
        ? "认输"
        : "开始"
      : "新局";
  const isUndoDisabled =
    isResetPending ||
    (isUsingServerBoard ? !canSendOnlineUndo : state.moves.length === 0);
  const isResetDisabled =
    isResetPending ||
    (isOnlineRoomActive &&
      (onlineSnapshot === null ||
        (onlineSnapshot.phase === "playing"
          ? !canRequestOnlineSurrenderAction
          : !onlineSnapshot.canStart)));
  const handleReset = (): void => {
    primeGobangAudio();

    if (isResetDisabled) {
      return;
    }

    if (isOnlineRoomActive && onlineSnapshot?.phase === "playing") {
      onlineRoomClient.requestSurrender();
      return;
    }

    if (isOnlineRoomActive) {
      onlineRoomClient.startGame();
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
  const handleRespondOnlineRequest = (accept: boolean): void => {
    if (incomingOnlineRequest === null) {
      return;
    }

    if (incomingOnlineRequest.type === "undo") {
      onlineRoomClient.respondUndo(incomingOnlineRequest.requestId, accept);
      return;
    }

    onlineRoomClient.respondSurrender(incomingOnlineRequest.requestId, accept);
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
    if (isOnlineRoomActive && isUsingServerBoard) {
      return;
    }

    if (isOnlineRoomActive) {
      resetWarmupGame();
      return;
    }

    localGame.reset();
  };
  const handleOnlineEntry = (): void => {
    if (isOnlineRoomActive) {
      if (canLeaveOnlineMode(onlineGamePhase)) {
        onlineRoomClient.leaveRoom();
        setOnlineRoom(null);
        setInitialOnlineRoomCode(null);
        setIsOnlineDialogOpen(false);
        setIsOnlineExitNoticeOpen(false);
        return;
      }

      setIsOnlineExitNoticeOpen(true);
      return;
    }

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
      if (onlineResetTimeoutRef.current !== null) {
        window.clearTimeout(onlineResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (onlineSnapshot === null) {
      previousOnlineSnapshotRef.current = null;
      setOnlineResetVisual(null);
      if (onlineResetTimeoutRef.current !== null) {
        window.clearTimeout(onlineResetTimeoutRef.current);
        onlineResetTimeoutRef.current = null;
      }
      return;
    }

    const transition = getOnlineResetTransition(
      previousOnlineSnapshotRef.current,
      onlineSnapshot
    );
    const undoTransition = getOnlineUndoTransition(
      previousOnlineSnapshotRef.current,
      onlineSnapshot
    );
    if (undoTransition !== null) {
      boardRef.current?.playUndoAnimation(undoTransition.removedMove);
    }

    if (transition !== null) {
      if (onlineResetTimeoutRef.current !== null) {
        window.clearTimeout(onlineResetTimeoutRef.current);
        onlineResetTimeoutRef.current = null;
      }

      setOnlineResetVisual({
        game: transition.visualGame,
        gameNumber: transition.gameNumber
      });
      setIsResetPending(true);

      const delayMs: number = boardRef.current?.playResetAnimation(
        transition.moves,
        getElementCenter(resetButtonRef.current)
      ) ?? 0;
      const finishOnlineReset = (): void => {
        onlineResetTimeoutRef.current = null;
        setOnlineResetVisual((currentVisual) =>
          currentVisual?.gameNumber === transition.gameNumber
            ? null
            : currentVisual
        );
        setIsResetPending(false);
        completeOnlineResetAnimation(transition.gameNumber);
      };

      if (delayMs <= 0) {
        finishOnlineReset();
      } else {
        onlineResetTimeoutRef.current = window.setTimeout(
          finishOnlineReset,
          delayMs
        );
      }
    }

    const shouldAnimateWarmupStart =
      previousOnlineSnapshotRef.current !== null &&
      previousOnlineSnapshotRef.current.phase !== "playing" &&
      onlineSnapshot.phase === "playing" &&
    onlineSnapshot.game.moves.length === 0 &&
      warmupState.moves.length > 0;
    if (transition === null && shouldAnimateWarmupStart) {
      if (onlineResetTimeoutRef.current !== null) {
        window.clearTimeout(onlineResetTimeoutRef.current);
        onlineResetTimeoutRef.current = null;
      }

      setOnlineResetVisual({
        game: warmupState,
        gameNumber: onlineSnapshot.gameNumber
      });
      setIsResetPending(true);

      const delayMs: number = boardRef.current?.playResetAnimation(
        warmupState.moves,
        getElementCenter(resetButtonRef.current)
      ) ?? 0;
      resetWarmupGame();
      const finishWarmupReset = (): void => {
        onlineResetTimeoutRef.current = null;
        setOnlineResetVisual((currentVisual) =>
          currentVisual?.gameNumber === onlineSnapshot.gameNumber
            ? null
            : currentVisual
        );
        setIsResetPending(false);
      };

      if (delayMs <= 0) {
        finishWarmupReset();
      } else {
        onlineResetTimeoutRef.current = window.setTimeout(
          finishWarmupReset,
          delayMs
        );
      }
    }

    previousOnlineSnapshotRef.current = onlineSnapshot;
  }, [completeOnlineResetAnimation, onlineSnapshot, resetWarmupGame, warmupState]);

  return (
    <main className="app-shell">
      <section className="game-layout" aria-label="Web Gobang">
        <div className="play-area">
          <header className="game-header">
            <div className="game-title-row">
              <button
                aria-label={isOnlineRoomActive ? "返回单机模式" : "进入联机模式"}
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
            {!isOnlineRoomActive ? (
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
            ) : null}
          </header>

          <GobangBoard
            ref={boardRef}
            effects={effects}
            isPlacementEnabled={isPlacementEnabled}
            onPlace={handlePlace}
            previewPlayer={previewPlayer}
            state={state}
          />

          <div className="online-controls-stack">
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
            {onlineSnapshot !== null ? (
              <OnlinePlayerStatusPanel snapshot={onlineSnapshot} />
            ) : null}
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
      <CommonModal
        isOpen={incomingOnlineRequest !== null}
        onClose={() => {
          handleRespondOnlineRequest(false);
        }}
        title={incomingRequestTitle}
      >
        <div className="online-dialog-stack">
          <div className="online-request-actions">
            <button
              className="online-secondary-action"
              onClick={() => {
                handleRespondOnlineRequest(false);
              }}
              type="button"
            >
              拒绝
            </button>
            <button
              className="online-primary-action"
              onClick={() => {
                handleRespondOnlineRequest(true);
              }}
              type="button"
            >
              同意
            </button>
          </div>
        </div>
      </CommonModal>
      <CommonModal
        isOpen={isOnlineExitNoticeOpen}
        onClose={() => {
          setIsOnlineExitNoticeOpen(false);
        }}
        title="正在对局"
      >
        <div className="online-dialog-stack">
          <p className="online-modal-message">
            对局进行中，暂时不能返回单机模式。
          </p>
          <button
            className="online-primary-action"
            onClick={() => {
              setIsOnlineExitNoticeOpen(false);
            }}
            type="button"
          >
            知道了
          </button>
        </div>
      </CommonModal>
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
