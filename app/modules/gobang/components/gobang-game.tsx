import { RefreshCcw, Undo2 } from "lucide-react";
import { type ReactElement } from "react";

import { GobangBoard } from "@/modules/gobang/components/gobang-board";
import { useGobangGame } from "@/modules/gobang/hooks/use-gobang-game";
import { type Player } from "@/modules/gobang/types";

export function GobangGame(): ReactElement {
  const { state, effects, placeAt, undo, reset } = useGobangGame();
  const currentLabel: string = getPlayerLabel(state.currentPlayer);
  const winnerLabel: string | null =
    state.winner === null ? null : getPlayerLabel(state.winner.player);

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

          <GobangBoard effects={effects} onPlace={placeAt} state={state} />

          <div className="controls" aria-label="游戏控制">
            <button
              className="control-button primary"
              onClick={reset}
              type="button"
            >
              <RefreshCcw aria-hidden="true" size={18} />
              新局
            </button>
            <button
              className="control-button"
              disabled={state.moves.length === 0}
              onClick={undo}
              type="button"
            >
              <Undo2 aria-hidden="true" size={18} />
              悔棋
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
