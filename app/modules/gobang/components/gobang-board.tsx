import { useMemo, useState, type ReactElement } from "react";

import {
  BOARD_GRID_MAX,
  getPointFromClient,
  getViewBox,
  positionKey
} from "@/modules/gobang/board-geometry";
import { InkEffectCanvas } from "@/modules/gobang/components/ink-effect-canvas";
import {
  BOARD_SIZE,
  type DerivedEffects,
  type GameState,
  type Move,
  type Position,
  type ShapeHint,
  type WinLine
} from "@/modules/gobang/types";

type GobangBoardProps = {
  state: GameState;
  effects: DerivedEffects;
  onPlace: (position: Position) => void;
};

type LineEndpoints = {
  start: Position;
  end: Position;
};

const STAR_POINTS: readonly Position[] = [
  { row: 3, col: 3 },
  { row: 3, col: 11 },
  { row: 7, col: 7 },
  { row: 11, col: 3 },
  { row: 11, col: 11 }
];

export function GobangBoard({
  state,
  effects,
  onPlace
}: GobangBoardProps): ReactElement {
  const [cursor, setCursor] = useState<Position>({ row: 7, col: 7 });
  const winningKeys: ReadonlySet<string> = useMemo(() => {
    if (effects.victory === null) {
      return new Set<string>();
    }

    return new Set<string>(effects.victory.positions.map(positionKey));
  }, [effects.victory]);

  const handlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>
  ): void => {
    if (state.status !== "playing") {
      return;
    }

    const rect: DOMRect = event.currentTarget.getBoundingClientRect();
    const position: Position = getPointFromClient(
      event.clientX,
      event.clientY,
      rect
    );

    setCursor(position);
    onPlace(position);
  };

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>
  ): void => {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((position: Position) => ({
        ...position,
        row: Math.max(0, position.row - 1)
      }));
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((position: Position) => ({
        ...position,
        row: Math.min(BOARD_GRID_MAX, position.row + 1)
      }));
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setCursor((position: Position) => ({
        ...position,
        col: Math.max(0, position.col - 1)
      }));
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      setCursor((position: Position) => ({
        ...position,
        col: Math.min(BOARD_GRID_MAX, position.col + 1)
      }));
      return;
    }

    if ((event.key === "Enter" || event.key === " ") && state.status === "playing") {
      event.preventDefault();
      onPlace(cursor);
    }
  };

  return (
    <div className="board-shell">
      <div
        aria-label="五子棋棋盘"
        aria-rowcount={BOARD_SIZE}
        aria-colcount={BOARD_SIZE}
        className="board-surface"
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        role="grid"
        tabIndex={0}
      >
        <svg
          aria-hidden="true"
          className="board-svg"
          viewBox={getViewBox()}
        >
          <defs>
            <radialGradient id="blackStone" cx="34%" cy="28%" r="70%">
              <stop offset="0%" stopColor="#4c514a" />
              <stop offset="46%" stopColor="#151815" />
              <stop offset="100%" stopColor="#030504" />
            </radialGradient>
            <radialGradient id="whiteStone" cx="32%" cy="26%" r="74%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="56%" stopColor="#ece7d7" />
              <stop offset="100%" stopColor="#b8ae99" />
            </radialGradient>
            <filter id="stoneShadow" x="-40%" y="-40%" width="180%" height="180%">
              <feDropShadow
                dx="0.08"
                dy="0.13"
                floodColor="#1a1309"
                floodOpacity="0.35"
                stdDeviation="0.09"
              />
            </filter>
            <filter id="lineGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow
                dx="0"
                dy="0"
                floodColor="#f6c85f"
                floodOpacity="0.8"
                stdDeviation="0.08"
              />
            </filter>
          </defs>

          <rect
            className="board-wood"
            height={BOARD_GRID_MAX + 1.15}
            rx="0.32"
            width={BOARD_GRID_MAX + 1.15}
            x="-0.575"
            y="-0.575"
          />

          {Array.from({ length: BOARD_SIZE }, (_, index: number) => (
            <g key={`grid-${index}`} className="board-grid-line">
              <line x1={0} x2={BOARD_GRID_MAX} y1={index} y2={index} />
              <line x1={index} x2={index} y1={0} y2={BOARD_GRID_MAX} />
            </g>
          ))}

          {STAR_POINTS.map((point: Position) => (
            <circle
              key={`star-${positionKey(point)}`}
              className="board-star"
              cx={point.col}
              cy={point.row}
              r="0.105"
            />
          ))}

          {effects.shapeHints.map((hint: ShapeHint) => (
            <ShapeHintLine hint={hint} key={hint.id} />
          ))}

          {effects.victory !== null ? (
            <VictoryLine victory={effects.victory} />
          ) : null}

          <circle
            className="board-cursor"
            cx={cursor.col}
            cy={cursor.row}
            r="0.5"
          />

          {state.moves.map((move: Move) => (
            <circle
              key={`${move.turn}-${move.row}-${move.col}`}
              className={[
                "stone",
                move.player === "black" ? "stone-black" : "stone-white",
                effects.placement?.turn === move.turn ? "stone-latest" : "",
                winningKeys.has(positionKey(move)) ? "stone-winning" : ""
              ]
                .filter(Boolean)
                .join(" ")}
              cx={move.col}
              cy={move.row}
              filter="url(#stoneShadow)"
              r="0.42"
            />
          ))}
        </svg>

        <InkEffectCanvas placement={effects.placement} />
      </div>
    </div>
  );
}

function ShapeHintLine({ hint }: { hint: ShapeHint }): ReactElement | null {
  const endpoints: LineEndpoints | null = getLineEndpoints(hint.positions);

  if (endpoints === null) {
    return null;
  }

  return (
    <line
      className={[
        "shape-hint-line",
        hint.player === "black" ? "shape-hint-black" : "shape-hint-white"
      ].join(" ")}
      x1={endpoints.start.col}
      x2={endpoints.end.col}
      y1={endpoints.start.row}
      y2={endpoints.end.row}
    />
  );
}

function VictoryLine({ victory }: { victory: WinLine }): ReactElement | null {
  const endpoints: LineEndpoints | null = getLineEndpoints(victory.positions);

  if (endpoints === null) {
    return null;
  }

  return (
    <line
      className="victory-line"
      filter="url(#lineGlow)"
      x1={endpoints.start.col}
      x2={endpoints.end.col}
      y1={endpoints.start.row}
      y2={endpoints.end.row}
    />
  );
}

function getLineEndpoints(
  positions: readonly Position[]
): LineEndpoints | null {
  const start: Position | undefined = positions.at(0);
  const end: Position | undefined = positions.at(-1);

  if (start === undefined || end === undefined) {
    return null;
  }

  return { start, end };
}
