import { RefreshCcw, Sparkles, Undo2, WifiOff } from "lucide-react";
import { type ReactElement } from "react";

import { GobangBoard } from "@/modules/gobang/components/gobang-board";
import { useGobangGame } from "@/modules/gobang/hooks/use-gobang-game";
import { type Move, type Player } from "@/modules/gobang/types";

export function GobangGame(): ReactElement {
  const { state, effects, isLoaded, placeAt, undo, reset } = useGobangGame();
  const currentLabel: string = getPlayerLabel(state.currentPlayer);
  const winnerLabel: string | null =
    state.winner === null ? null : getPlayerLabel(state.winner.player);
  const recentMoves: readonly Move[] = state.moves.slice(-8).reverse();

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
              <span className="status-pill status-offline">
                <WifiOff aria-hidden="true" size={16} />
                离线可玩
              </span>
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

        <aside className="side-panel" aria-label="棋局状态">
          <div className="result-band">
            <span
              className={[
                "turn-stone",
                state.currentPlayer === "black" ? "turn-black" : "turn-white"
              ].join(" ")}
              aria-hidden="true"
            />
            <div>
              <p className="panel-label">
                {winnerLabel === null ? "当前" : "终局"}
              </p>
              <p className="panel-value">
                {winnerLabel === null ? currentLabel : `${winnerLabel}胜出`}
              </p>
            </div>
          </div>

          <div className="metric-grid">
            <div>
              <p className="panel-label">手数</p>
              <p className="metric-value">{state.moves.length}</p>
            </div>
            <div>
              <p className="panel-label">三连</p>
              <p className="metric-value">{effects.shapeHints.length}</p>
            </div>
          </div>

          <div className="effect-tag">
            <Sparkles aria-hidden="true" size={17} />
            <span>水墨落子预览</span>
          </div>

          <div className="move-list-wrap">
            <p className="panel-label">最近落子</p>
            {recentMoves.length === 0 ? (
              <p className="empty-moves">等待黑棋开局</p>
            ) : (
              <ol className="move-list">
                {recentMoves.map((move: Move) => (
                  <li key={move.turn}>
                    <span>{move.turn}</span>
                    <strong>{getPlayerLabel(move.player)}</strong>
                    <em>
                      {move.row + 1}, {move.col + 1}
                    </em>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <p className="sync-state">
            {isLoaded ? "本地棋局已缓存" : "正在读取本地棋局"}
          </p>
        </aside>
      </section>
    </main>
  );
}

function getPlayerLabel(player: Player): string {
  return player === "black" ? "黑棋" : "白棋";
}
