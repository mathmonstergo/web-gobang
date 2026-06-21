import { RefreshCcw, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactElement } from "react";

import {
  GobangBoard,
  type GobangBoardHandle,
  type ScreenPoint
} from "@/modules/gobang/components/gobang-board";
import { useGobangGame } from "@/modules/gobang/hooks/use-gobang-game";
import { type Move, type Player, type Position } from "@/modules/gobang/types";

export function GobangGame(): ReactElement {
  const { state, effects, placeAt, undo, reset } = useGobangGame();
  const boardRef = useRef<GobangBoardHandle | null>(null);
  const resetButtonRef = useRef<HTMLButtonElement | null>(null);
  const resetTimeoutRef = useRef<number | null>(null);
  const [isResetPending, setIsResetPending] = useState(false);
  const currentLabel: string = getPlayerLabel(state.currentPlayer);
  const winnerLabel: string | null =
    state.winner === null ? null : getPlayerLabel(state.winner.player);
  const handleReset = (): void => {
    if (isResetPending) {
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
      reset();
      return;
    }

    setIsResetPending(true);
    reset();
    resetTimeoutRef.current = window.setTimeout(() => {
      resetTimeoutRef.current = null;
      setIsResetPending(false);
    }, delayMs);
  };
  const handleUndo = (): void => {
    if (isResetPending || state.moves.length === 0) {
      return;
    }

    const latestMove: Move = state.moves[state.moves.length - 1];
    boardRef.current?.playUndoAnimation(latestMove);
    undo();
  };
  const handlePlace = (position: Position): void => {
    if (isResetPending) {
      return;
    }

    placeAt(position);
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
            <div>
              <p className="eyebrow">WEB GOBANG</p>
              <h1>五子棋</h1>
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
              disabled={isResetPending}
              onClick={handleReset}
              type="button"
            >
              <RefreshCcw aria-hidden="true" size={16} />
              新局
            </button>
            <button
              className="control-button"
              disabled={isResetPending || state.moves.length === 0}
              onClick={handleUndo}
              type="button"
            >
              <Undo2 aria-hidden="true" size={16} />
              耍赖皮
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function getPlayerLabel(player: Player): string {
  return player === "black" ? "黑棋" : "白棋";
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
