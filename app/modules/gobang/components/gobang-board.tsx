import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement
} from "react";

import {
  BOARD_GRID_MAX,
  getPointFromClient,
  getViewBox,
  positionKey
} from "@/modules/gobang/board-geometry";
import { InkEffectCanvas } from "@/modules/gobang/components/ink-effect-canvas";
import {
  BOARD_SIZE,
  WAVE_DELAY_PER_STEP_MS,
  WAVE_DURATION_MS,
  type DerivedEffects,
  type GameState,
  type Move,
  type Position,
  type ShapeHint,
  type WaveBurst,
  type WinLine,
  type WaveHighlight
} from "@/modules/gobang/types";

type GobangBoardProps = {
  state: GameState;
  effects: DerivedEffects;
  onPlace: (position: Position) => void;
};

const STAR_POINTS: readonly Position[] = [
  { row: 3, col: 3 },
  { row: 3, col: 11 },
  { row: 7, col: 7 },
  { row: 11, col: 3 },
  { row: 11, col: 11 }
];
const WAVE_EVENT_TTL_MS = 1200;

export function GobangBoard({
  state,
  effects,
  onPlace
}: GobangBoardProps): ReactElement {
  const [cursor, setCursor] = useState<Position>({ row: 7, col: 7 });
  const [waveBursts, setWaveBursts] = useState<readonly WaveBurst[]>([]);
  const stoneRefs = useRef<Map<string, SVGCircleElement>>(new Map());
  const animatedBurstIds = useRef<Set<string>>(new Set());
  const activeStoneWaveUntil = useRef<Map<string, number>>(new Map());
  const waveCleanupTimeouts = useRef<Set<number>>(new Set());
  const winningKeys: ReadonlySet<string> = useMemo(() => {
    if (effects.victory === null) {
      return new Set<string>();
    }

    return new Set<string>(effects.victory.positions.map(positionKey));
  }, [effects.victory]);
  const waveHighlights: readonly WaveHighlight[] = useMemo(
    () => createWaveHighlights(effects.shapeHints),
    [effects.shapeHints]
  );
  const waveByPosition: ReadonlyMap<string, WaveHighlight> = useMemo(
    () =>
      new Map<string, WaveHighlight>(
        waveHighlights.map((highlight: WaveHighlight) => [
          positionKey(highlight.position),
          highlight
        ])
      ),
    [waveHighlights]
  );
  const victoryWaveHighlights: readonly WaveHighlight[] = useMemo(
    () => createVictoryWaveHighlights(effects.victory, effects.shapeHints),
    [effects.shapeHints, effects.victory]
  );
  const victoryWaveByPosition: ReadonlyMap<string, WaveHighlight> = useMemo(
    () =>
      new Map<string, WaveHighlight>(
        victoryWaveHighlights.map((highlight: WaveHighlight) => [
          positionKey(highlight.position),
          highlight
        ])
      ),
    [victoryWaveHighlights]
  );

  useEffect(() => {
    if (
      effects.placement === null ||
      effects.shapeHints.length === 0 ||
      effects.victory !== null
    ) {
      return;
    }

    const highlights: readonly WaveHighlight[] = createWaveHighlights(
      effects.shapeHints
    );

    if (highlights.length === 0) {
      return;
    }

    const burst: WaveBurst = {
      id: effects.placement.id,
      highlights,
      startedAt: performance.now()
    };

    setWaveBursts((bursts: readonly WaveBurst[]) => [
      ...bursts.filter((item: WaveBurst) => item.id !== burst.id),
      burst
    ]);

    const timeoutId: number = window.setTimeout(() => {
      setWaveBursts((bursts: readonly WaveBurst[]) =>
        bursts.filter((item: WaveBurst) => item.id !== burst.id)
      );
      animatedBurstIds.current.delete(burst.id);
      waveCleanupTimeouts.current.delete(timeoutId);
    }, getWaveBurstDuration(highlights) + WAVE_EVENT_TTL_MS);

    waveCleanupTimeouts.current.add(timeoutId);
  }, [effects.placement, effects.shapeHints, effects.victory]);

  useEffect(() => {
    const timeoutIds: Set<number> = waveCleanupTimeouts.current;

    return () => {
      for (const timeoutId of timeoutIds) {
        window.clearTimeout(timeoutId);
      }

      timeoutIds.clear();
    };
  }, []);

  useEffect(() => {
    if (state.moves.length > 0) {
      return;
    }

    for (const timeoutId of waveCleanupTimeouts.current) {
      window.clearTimeout(timeoutId);
    }

    waveCleanupTimeouts.current.clear();
    animatedBurstIds.current.clear();
    setWaveBursts([]);
  }, [state.moves.length]);

  useEffect(() => {
    for (const burst of waveBursts) {
      if (animatedBurstIds.current.has(burst.id)) {
        continue;
      }

      animatedBurstIds.current.add(burst.id);
      playStoneWaveBurst(
        burst,
        stoneRefs.current,
        activeStoneWaveUntil.current
      );
    }
  }, [waveBursts]);

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

          <circle
            className="board-cursor"
            cx={cursor.col}
            cy={cursor.row}
            r="0.5"
          />

          {state.moves.map((move: Move) => {
            const key: string = positionKey(move);
            const waveHighlight: WaveHighlight | undefined =
              waveByPosition.get(key);
            const victoryWaveHighlight: WaveHighlight | undefined =
              victoryWaveByPosition.get(key);
            const activeWaveHighlight: WaveHighlight | undefined =
              victoryWaveHighlight ?? waveHighlight;

            return (
              <circle
                key={`${move.turn}-${move.row}-${move.col}`}
                className={[
                  "stone",
                  move.player === "black" ? "stone-black" : "stone-white",
                  effects.placement?.turn === move.turn ? "stone-latest" : "",
                  victoryWaveHighlight === undefined ? "" : "stone-victory-wave",
                  winningKeys.has(key) ? "stone-winning" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                cx={move.col}
                cy={move.row}
                filter="url(#stoneShadow)"
                r="0.42"
                ref={setStoneRef(stoneRefs.current, key)}
                style={getStoneWaveStyle(activeWaveHighlight)}
              />
            );
          })}
        </svg>

        <InkEffectCanvas
          placement={effects.placement}
          waveBursts={waveBursts}
        />
      </div>
    </div>
  );
}

function createWaveHighlights(
  shapeHints: readonly ShapeHint[]
): readonly WaveHighlight[] {
  const highlights = new Map<string, WaveHighlight>();

  for (const hint of shapeHints) {
    for (const position of hint.positions) {
      const steps: number = getGridSteps(hint.anchor, position);
      const key: string = positionKey(position);
      const existing: WaveHighlight | undefined = highlights.get(key);

      if (existing !== undefined && existing.steps <= steps) {
        continue;
      }

      highlights.set(key, {
        player: hint.player,
        position,
        steps,
        delayMs: steps * WAVE_DELAY_PER_STEP_MS
      });
    }
  }

  return [...highlights.values()];
}

function createVictoryWaveHighlights(
  victory: WinLine | null,
  shapeHints: readonly ShapeHint[]
): readonly WaveHighlight[] {
  if (victory === null) {
    return [];
  }

  const anchor: Position = getVictoryAnchor(victory, shapeHints);

  return victory.positions.map((position: Position) => {
    const steps: number = getGridSteps(anchor, position);

    return {
      player: victory.player,
      position,
      steps,
      delayMs: steps * WAVE_DELAY_PER_STEP_MS
    };
  });
}

function getVictoryAnchor(
  victory: WinLine,
  shapeHints: readonly ShapeHint[]
): Position {
  const victoryKeys = new Set<string>(victory.positions.map(positionKey));
  const matchingHint: ShapeHint | undefined = shapeHints.find(
    (hint: ShapeHint) =>
      hint.player === victory.player &&
      hint.positions.length >= 5 &&
      hint.positions.every((position: Position) =>
        victoryKeys.has(positionKey(position))
      )
  );

  return matchingHint?.anchor ?? victory.positions[0];
}

function playStoneWaveBurst(
  burst: WaveBurst,
  stones: ReadonlyMap<string, SVGCircleElement>,
  activeUntilByStone: Map<string, number>
): void {
  for (const highlight of burst.highlights) {
    const key: string = positionKey(highlight.position);
    const animationStartsAt: number = performance.now() + highlight.delayMs;
    const activeUntil: number = activeUntilByStone.get(key) ?? 0;

    if (activeUntil > animationStartsAt) {
      continue;
    }

    const stone: SVGCircleElement | undefined = stones.get(
      key
    );

    if (stone === undefined) {
      continue;
    }

    activeUntilByStone.set(
      key,
      animationStartsAt + WAVE_DURATION_MS
    );

    stone.animate(
      [
        { offset: 0, transform: "scale(1) translateY(0)" },
        { offset: 0.14, transform: "scale(1.04) translateY(-0.015px)" },
        { offset: 0.28, transform: "scale(1.15) translateY(-0.045px)" },
        { offset: 0.43, transform: "scale(1.3) translateY(-0.09px)" },
        { offset: 0.58, transform: "scale(1.12) translateY(-0.04px)" },
        { offset: 0.76, transform: "scale(0.98) translateY(0.016px)" },
        { offset: 1, transform: "scale(1) translateY(0)" }
      ],
      {
        delay: highlight.delayMs,
        duration: WAVE_DURATION_MS,
        easing: "cubic-bezier(0.25, 1, 0.5, 1)",
        fill: "both"
      }
    );
  }
}

function setStoneRef(
  refs: Map<string, SVGCircleElement>,
  key: string
): (node: SVGCircleElement | null) => void {
  return (node: SVGCircleElement | null): void => {
    if (node === null) {
      refs.delete(key);
      return;
    }

    refs.set(key, node);
  };
}

function getWaveBurstDuration(highlights: readonly WaveHighlight[]): number {
  return highlights.reduce(
    (duration: number, highlight: WaveHighlight) =>
      Math.max(duration, highlight.delayMs + WAVE_DURATION_MS),
    0
  );
}

function getGridSteps(anchor: Position, position: Position): number {
  return Math.max(
    Math.abs(anchor.row - position.row),
    Math.abs(anchor.col - position.col)
  );
}

function getStoneWaveStyle(
  waveHighlight: WaveHighlight | undefined
): CSSProperties | undefined {
  if (waveHighlight === undefined) {
    return undefined;
  }

  const style: CSSProperties & { "--wave-delay": string } = {
    "--wave-delay": `${waveHighlight.delayMs}ms`
  };

  return style;
}
