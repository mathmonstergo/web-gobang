import Matter from "matter-js";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement
} from "react";

import { BOARD_GRID_MAX, positionKey } from "@/modules/gobang/board-geometry";
import {
  BLOOM_DURATION_MS,
  VICTORY_LOOP_MS,
  createInkPoints,
  createVictoryWaveHighlights,
  createWaveHighlights,
  getWaveAnimationDuration,
  getWaveScaleFromDelay,
  type CanvasLayout,
  type InkPoint
} from "@/modules/gobang/canvas-effects";
import {
  BOARD_SIZE,
  type DerivedEffects,
  type GameState,
  type Move,
  type Player,
  type Position,
  type WaveHighlight
} from "@/modules/gobang/types";

type GobangBoardProps = {
  state: GameState;
  effects: DerivedEffects;
  onPlace: (position: Position) => void;
};

type WritableRef<T> = {
  current: T;
};

export type ScreenPoint = {
  x: number;
  y: number;
};

export type GobangBoardHandle = {
  playResetAnimation: (
    moves: readonly Move[],
    origin?: ScreenPoint
  ) => void;
  playUndoAnimation: (move: Move) => void;
};

type BloomAnimation = {
  id: string;
  player: Player;
  position: Position;
  points: readonly InkPoint[];
  startedAt: number;
};

type CanvasWaveHighlight = WaveHighlight & {
  turn: number;
};

type CanvasWaveAnimation = {
  id: string;
  player: Player;
  highlights: readonly CanvasWaveHighlight[];
  startedAt: number;
};

type BoardRectSnapshot = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type PhysicsMode = "reset" | "undo";

type PhysicsStone = {
  id: string;
  player: Player;
  body: Matter.Body;
  radius: number;
  mode: PhysicsMode;
  origin: ScreenPoint;
  boardRect: BoardRectSnapshot;
  createdAt: number;
  impactAt: number;
  impactedAt: number | null;
  isFalling: boolean;
};

type UndoLift = {
  id: string;
  player: Player;
  start: ScreenPoint;
  radius: number;
  boardRect: BoardRectSnapshot;
  startedAt: number;
};

type RingAnimation = {
  id: string;
  origin: ScreenPoint;
  startedAt: number;
  maxRadius: number;
};

const STAR_POINTS: readonly Position[] = [
  { row: 3, col: 3 },
  { row: 3, col: 7 },
  { row: 3, col: 11 },
  { row: 7, col: 3 },
  { row: 7, col: 7 },
  { row: 7, col: 11 },
  { row: 11, col: 3 },
  { row: 11, col: 7 },
  { row: 11, col: 11 }
];
const EMPTY_LAYOUT: CanvasLayout = { size: 0, cellSize: 0, padding: 0 };
const STONE_RADIUS_RATIO = 0.43;
const UNDO_LIFT_DURATION_MS = 360;
const RESET_RING_SPEED = 850;
const PHYSICS_MAX_LIFE_MS = 6500;
const DEVICE_PIXEL_RATIO_CAP = 2;

export const GobangBoard = forwardRef<GobangBoardHandle, GobangBoardProps>(
  function GobangBoard(
    { state, effects, onPlace }: GobangBoardProps,
    ref
  ): ReactElement {
    const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const layoutRef = useRef<CanvasLayout>(EMPTY_LAYOUT);
    const stateRef = useRef<GameState>(state);
    const effectsRef = useRef<DerivedEffects>(effects);
    const cursorRef = useRef<Position>({ row: 7, col: 7 });
    const hoverRef = useRef<Position | null>(null);
    const isFocusedRef = useRef(false);
    const bloomsRef = useRef<BloomAnimation[]>([]);
    const wavesRef = useRef<CanvasWaveAnimation[]>([]);
    const physicsStonesRef = useRef<PhysicsStone[]>([]);
    const undoLiftsRef = useRef<UndoLift[]>([]);
    const ringsRef = useRef<RingAnimation[]>([]);
    const hiddenKeysRef = useRef<Set<string>>(new Set());
    const seenPlacementIdsRef = useRef<Set<string>>(new Set());
    const seenWaveIdsRef = useRef<Set<string>>(new Set());
    const engineRef = useRef<Matter.Engine | null>(null);
    const nextAnimationIdRef = useRef(0);
    const victoryTimerRef = useRef<number | null>(null);
    const [, setRenderTick] = useState(0);

    stateRef.current = state;
    effectsRef.current = effects;

    const createAnimationId = useCallback((prefix: string): string => {
      nextAnimationIdRef.current += 1;
      return `${prefix}-${nextAnimationIdRef.current}`;
    }, []);

    const playResetAnimation = useCallback(
      (moves: readonly Move[], origin?: ScreenPoint): void => {
        if (moves.length === 0) {
          return;
        }

        const canvas: HTMLCanvasElement | null = mainCanvasRef.current;
        if (canvas === null) {
          return;
        }

        const rect: DOMRect = canvas.getBoundingClientRect();
        const layout: CanvasLayout = layoutRef.current;
        if (layout.size <= 0 || layout.cellSize <= 0) {
          return;
        }

        const boardRect: BoardRectSnapshot = getBoardRectSnapshot(rect, layout);
        const shockOrigin: ScreenPoint =
          origin ?? getBoardCenterFromRect(boardRect);
        const now: number = performance.now();
        const radius: number = layout.cellSize * STONE_RADIUS_RATIO;
        const maxRadius: number =
          getMaxDistanceToBoardCorners(shockOrigin, boardRect) + radius * 4;

        bloomsRef.current = [];
        wavesRef.current = [];
        hiddenKeysRef.current = new Set<string>(
          moves.map((move: Move) => positionKey(move))
        );
        ringsRef.current.push({
          id: createAnimationId("reset-ring"),
          origin: shockOrigin,
          startedAt: now,
          maxRadius
        });

        const engine: Matter.Engine = getPhysicsEngine(engineRef);
        for (const move of moves) {
          const point: ScreenPoint = getScreenPointFromMove(move, rect, layout);
          const distance: number = Math.max(
            1,
            Math.hypot(point.x - shockOrigin.x, point.y - shockOrigin.y)
          );
          const body: Matter.Body = Matter.Bodies.circle(
            point.x,
            point.y,
            radius,
            {
              density: 0.004,
              friction: 0.04,
              frictionAir: 0.008,
              isStatic: true,
              restitution: 0.82
            },
            32
          );

          Matter.Composite.add(engine.world, body);
          physicsStonesRef.current.push({
            id: createAnimationId("reset-stone"),
            player: move.player,
            body,
            radius,
            mode: "reset",
            origin: shockOrigin,
            boardRect,
            createdAt: now,
            impactAt: now + (distance / RESET_RING_SPEED) * 1000,
            impactedAt: null,
            isFalling: false
          });
        }
      },
      [createAnimationId]
    );

    const playUndoAnimation = useCallback(
      (move: Move): void => {
        const canvas: HTMLCanvasElement | null = mainCanvasRef.current;
        if (canvas === null) {
          return;
        }

        const rect: DOMRect = canvas.getBoundingClientRect();
        const layout: CanvasLayout = layoutRef.current;
        if (layout.size <= 0 || layout.cellSize <= 0) {
          return;
        }

        hiddenKeysRef.current.add(positionKey(move));
        undoLiftsRef.current.push({
          id: createAnimationId("undo-lift"),
          player: move.player,
          start: getScreenPointFromMove(move, rect, layout),
          radius: layout.cellSize * STONE_RADIUS_RATIO,
          boardRect: getBoardRectSnapshot(rect, layout),
          startedAt: performance.now()
        });
      },
      [createAnimationId]
    );

    useImperativeHandle(
      ref,
      () => ({
        playResetAnimation,
        playUndoAnimation
      }),
      [playResetAnimation, playUndoAnimation]
    );

    useEffect(() => {
      const placement = effects.placement;
      if (placement === null || seenPlacementIdsRef.current.has(placement.id)) {
        return;
      }

      seenPlacementIdsRef.current.add(placement.id);
      bloomsRef.current.push({
        id: placement.id,
        player: placement.player,
        position: placement.position,
        points: createInkPoints(
          placement.player,
          placement.position.col * 17 + placement.position.row
        ),
        startedAt: performance.now()
      });
    }, [effects.placement]);

    useEffect(() => {
      const placement = effects.placement;
      if (placement === null || effects.shapeHints.length === 0) {
        return;
      }

      const waveId = `shape-${placement.id}`;
      if (seenWaveIdsRef.current.has(waveId)) {
        return;
      }

      const highlights: readonly CanvasWaveHighlight[] =
        snapshotWaveHighlights(
          createWaveHighlights(effects.shapeHints),
          state.moves
        );

      if (highlights.length === 0) {
        return;
      }

      seenWaveIdsRef.current.add(waveId);
      wavesRef.current.push({
        id: waveId,
        player: placement.player,
        highlights,
        startedAt: performance.now()
      });
    }, [effects.placement, effects.shapeHints, state.moves]);

    useEffect(() => {
      if (state.moves.length > 0) {
        return;
      }

      seenPlacementIdsRef.current.clear();
      seenWaveIdsRef.current.clear();
      hiddenKeysRef.current.clear();
    }, [state.moves.length]);

    useEffect(() => {
      if (victoryTimerRef.current !== null) {
        window.clearInterval(victoryTimerRef.current);
        victoryTimerRef.current = null;
      }

      if (effects.victory === null) {
        return;
      }

      const enqueueVictoryWave = (): void => {
        const latestEffects: DerivedEffects = effectsRef.current;
        if (latestEffects.victory === null) {
          return;
        }

        const highlights: readonly CanvasWaveHighlight[] =
          snapshotWaveHighlights(
            createVictoryWaveHighlights(
              latestEffects.victory,
              latestEffects.shapeHints,
              latestEffects.placement?.position
            ),
            stateRef.current.moves
          );

        if (highlights.length === 0) {
          return;
        }

        wavesRef.current.push({
          id: createAnimationId("victory-wave"),
          player: latestEffects.victory.player,
          highlights,
          startedAt: performance.now()
        });
      };

      victoryTimerRef.current = window.setInterval(
        enqueueVictoryWave,
        VICTORY_LOOP_MS
      );

      return () => {
        if (victoryTimerRef.current !== null) {
          window.clearInterval(victoryTimerRef.current);
          victoryTimerRef.current = null;
        }
      };
    }, [createAnimationId, effects.victory]);

    useEffect(() => {
      const canvas: HTMLCanvasElement | null = mainCanvasRef.current;
      const overlay: HTMLCanvasElement | null = overlayCanvasRef.current;
      if (canvas === null || overlay === null) {
        return;
      }

      const resize = (): void => {
        resizeMainCanvas(canvas, layoutRef);
        resizeOverlayCanvas(overlay);
      };

      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      window.addEventListener("resize", resize);

      let animationFrameId = 0;
      let previousTimestamp: number = performance.now();

      const drawFrame = (timestamp: number): void => {
        const deltaMs: number = Math.min(
          33.34,
          Math.max(8, timestamp - previousTimestamp)
        );
        previousTimestamp = timestamp;

        drawMainCanvas({
          canvas,
          layout: layoutRef.current,
          state: stateRef.current,
          cursor: cursorRef.current,
          hover: hoverRef.current,
          isFocused: isFocusedRef.current,
          bloomsRef,
          wavesRef,
          hiddenKeysRef,
          timestamp
        });
        drawOverlayCanvas({
          canvas: overlay,
          engineRef,
          physicsStonesRef,
          undoLiftsRef,
          ringsRef,
          timestamp,
          deltaMs
        });

        animationFrameId = window.requestAnimationFrame(drawFrame);
      };

      animationFrameId = window.requestAnimationFrame(drawFrame);

      return () => {
        observer.disconnect();
        window.removeEventListener("resize", resize);
        window.cancelAnimationFrame(animationFrameId);
        if (victoryTimerRef.current !== null) {
          window.clearInterval(victoryTimerRef.current);
          victoryTimerRef.current = null;
        }
      };
    }, []);

    const handlePointerDown = (
      event: PointerEvent<HTMLDivElement>
    ): void => {
      if (state.status !== "playing") {
        return;
      }

      const position: Position | null = getPositionFromClient(
        event.clientX,
        event.clientY,
        mainCanvasRef.current,
        layoutRef.current
      );

      if (position === null) {
        return;
      }

      cursorRef.current = position;
      setRenderTick((value: number) => value + 1);
      onPlace(position);
    };

    const handlePointerMove = (
      event: PointerEvent<HTMLDivElement>
    ): void => {
      hoverRef.current = getPositionFromClient(
        event.clientX,
        event.clientY,
        mainCanvasRef.current,
        layoutRef.current
      );
    };

    const handlePointerLeave = (): void => {
      hoverRef.current = null;
    };

    const handleKeyDown = (
      event: KeyboardEvent<HTMLDivElement>
    ): void => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCursorPosition({ ...cursorRef.current, row: cursorRef.current.row - 1 });
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCursorPosition({ ...cursorRef.current, row: cursorRef.current.row + 1 });
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCursorPosition({ ...cursorRef.current, col: cursorRef.current.col - 1 });
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setCursorPosition({ ...cursorRef.current, col: cursorRef.current.col + 1 });
        return;
      }

      if ((event.key === "Enter" || event.key === " ") && state.status === "playing") {
        event.preventDefault();
        onPlace(cursorRef.current);
      }
    };

    const setCursorPosition = (position: Position): void => {
      cursorRef.current = {
        row: clampBoardIndex(position.row),
        col: clampBoardIndex(position.col)
      };
      setRenderTick((value: number) => value + 1);
    };

    return (
      <div className="board-shell">
        <canvas
          ref={overlayCanvasRef}
          aria-hidden="true"
          className="physics-overlay-canvas"
        />
        <div
          aria-label="五子棋棋盘"
          aria-rowcount={BOARD_SIZE}
          aria-colcount={BOARD_SIZE}
          className="board-surface"
          onBlur={() => {
            isFocusedRef.current = false;
          }}
          onFocus={() => {
            isFocusedRef.current = true;
          }}
          onKeyDown={handleKeyDown}
          onPointerDown={handlePointerDown}
          onPointerLeave={handlePointerLeave}
          onPointerMove={handlePointerMove}
          role="grid"
          tabIndex={0}
        >
          <canvas
            ref={mainCanvasRef}
            aria-hidden="true"
            className="board-canvas"
          />
        </div>
      </div>
    );
  }
);

GobangBoard.displayName = "GobangBoard";

type DrawMainCanvasInput = {
  canvas: HTMLCanvasElement;
  layout: CanvasLayout;
  state: GameState;
  cursor: Position;
  hover: Position | null;
  isFocused: boolean;
  bloomsRef: WritableRef<BloomAnimation[]>;
  wavesRef: WritableRef<CanvasWaveAnimation[]>;
  hiddenKeysRef: WritableRef<Set<string>>;
  timestamp: number;
};

type DrawOverlayCanvasInput = {
  canvas: HTMLCanvasElement;
  engineRef: WritableRef<Matter.Engine | null>;
  physicsStonesRef: WritableRef<PhysicsStone[]>;
  undoLiftsRef: WritableRef<UndoLift[]>;
  ringsRef: WritableRef<RingAnimation[]>;
  timestamp: number;
  deltaMs: number;
};

function drawMainCanvas(input: DrawMainCanvasInput): void {
  const context: CanvasRenderingContext2D | null = input.canvas.getContext("2d");
  if (context === null || input.layout.size <= 0) {
    return;
  }

  const dpr: number = getDevicePixelRatio();
  const layout: CanvasLayout = input.layout;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, layout.size, layout.size);

  drawBoard(context, layout);
  pruneHiddenKeys(input.hiddenKeysRef.current, input.state.moves);

  const activeWaves: readonly CanvasWaveAnimation[] = input.wavesRef.current;
  const baseRadius: number = layout.cellSize * STONE_RADIUS_RATIO;

  for (const move of input.state.moves) {
    const key: string = positionKey(move);
    if (input.hiddenKeysRef.current.has(key)) {
      continue;
    }

    const point: ScreenPoint = getBoardPoint(move, layout);
    const scale: number = getMoveWaveScale(move, activeWaves, input.timestamp);
    context.save();
    context.translate(point.x, point.y);
    context.scale(scale, scale);
    context.translate(-point.x, -point.y);
    drawStone(context, point.x, point.y, baseRadius, move.player);
    context.restore();
  }

  drawLastMoveMarker(context, input.state, input.hiddenKeysRef.current, layout);
  drawHoverStone(context, input.state, input.hover, layout);
  drawFocusCursor(context, input.cursor, input.isFocused, layout);

  input.bloomsRef.current = input.bloomsRef.current.filter(
    (bloom: BloomAnimation) => {
      const age: number = input.timestamp - bloom.startedAt;
      if (age >= BLOOM_DURATION_MS) {
        return false;
      }

      const point: ScreenPoint = getBoardPoint(bloom.position, layout);
      drawBloom(context, point.x, point.y, baseRadius, bloom.player, age, bloom.points);
      return true;
    }
  );

  input.wavesRef.current = input.wavesRef.current.filter(
    (wave: CanvasWaveAnimation) =>
      input.timestamp - wave.startedAt < getWaveAnimationDuration(wave.highlights)
  );
}

function drawOverlayCanvas(input: DrawOverlayCanvasInput): void {
  const context: CanvasRenderingContext2D | null = input.canvas.getContext("2d");
  if (context === null) {
    return;
  }

  const width: number = window.innerWidth;
  const height: number = window.innerHeight;
  const dpr: number = getDevicePixelRatio();
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  drawResetRings(context, input.ringsRef, input.timestamp);
  drawUndoLifts({
    context,
    engineRef: input.engineRef,
    physicsStonesRef: input.physicsStonesRef,
    undoLiftsRef: input.undoLiftsRef,
    timestamp: input.timestamp
  });
  updatePhysicsStones(input.engineRef, input.physicsStonesRef, input.timestamp, input.deltaMs);
  drawPhysicsStones(context, input.physicsStonesRef.current, input.timestamp);
}

function drawBoard(context: CanvasRenderingContext2D, layout: CanvasLayout): void {
  const { size, cellSize, padding } = layout;
  const background: CanvasGradient = context.createRadialGradient(
    size * 0.44,
    size * 0.41,
    0,
    size * 0.5,
    size * 0.5,
    size * 0.78
  );
  background.addColorStop(0, "#e1bd68");
  background.addColorStop(0.5, "#c79840");
  background.addColorStop(1, "#9e7728");

  context.fillStyle = background;
  context.beginPath();
  context.roundRect(0, 0, size, size, 7);
  context.fill();

  for (let index = 0; index < 55; index += 1) {
    const y: number = (size / 55) * index + Math.sin(index * 1.5 + 0.4) * 2.8;
    const isHeavy: boolean = index % 7 === 0;
    context.strokeStyle = `rgba(${isHeavy ? 90 : 122},${isHeavy ? 50 : 70},${isHeavy ? 10 : 14},${isHeavy ? 0.072 : 0.036})`;
    context.lineWidth = isHeavy ? 1 : 0.55;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(size, y);
    context.stroke();
  }

  context.strokeStyle = "rgba(58, 32, 7, 0.58)";
  context.lineWidth = 0.85;
  for (let index = 0; index < BOARD_SIZE; index += 1) {
    const point: number = padding + index * cellSize;
    context.beginPath();
    context.moveTo(point, padding);
    context.lineTo(point, padding + BOARD_GRID_MAX * cellSize);
    context.stroke();
    context.beginPath();
    context.moveTo(padding, point);
    context.lineTo(padding + BOARD_GRID_MAX * cellSize, point);
    context.stroke();
  }

  context.strokeStyle = "rgba(46, 24, 5, 0.82)";
  context.lineWidth = 1.7;
  context.strokeRect(
    padding,
    padding,
    BOARD_GRID_MAX * cellSize,
    BOARD_GRID_MAX * cellSize
  );

  context.fillStyle = "rgba(46, 24, 5, 0.76)";
  const starRadius: number = Math.max(0.5, cellSize * 0.105);
  for (const star of STAR_POINTS) {
    const point: ScreenPoint = getBoardPoint(star, layout);
    context.beginPath();
    context.arc(point.x, point.y, starRadius, 0, Math.PI * 2);
    context.fill();
  }

  const vignette: CanvasGradient = context.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.27,
    size / 2,
    size / 2,
    size * 0.74
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.18)");
  context.fillStyle = vignette;
  context.beginPath();
  context.roundRect(0, 0, size, size, 7);
  context.fill();
}

function drawStone(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  player: Player
): void {
  if (radius <= 0) {
    return;
  }

  context.save();
  if (player === "black") {
    const gradient: CanvasGradient = context.createRadialGradient(
      x - radius * 0.3,
      y - radius * 0.34,
      radius * 0.05,
      x + radius * 0.08,
      y + radius * 0.1,
      radius * 1.06
    );
    gradient.addColorStop(0, "#6e6e6e");
    gradient.addColorStop(0.18, "#2e2e2e");
    gradient.addColorStop(0.58, "#111111");
    gradient.addColorStop(1, "#040404");
    context.shadowColor = "rgba(0,0,0,0.68)";
    context.shadowBlur = radius * 0.9;
    context.shadowOffsetY = radius * 0.17;
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;

    const shine: CanvasGradient = context.createRadialGradient(
      x - radius * 0.32,
      y - radius * 0.36,
      0,
      x - radius * 0.05,
      y - radius * 0.08,
      radius * 0.7
    );
    shine.addColorStop(0, "rgba(255,255,255,0.2)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = shine;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  } else {
    const gradient: CanvasGradient = context.createRadialGradient(
      x - radius * 0.24,
      y - radius * 0.28,
      radius * 0.04,
      x + radius * 0.1,
      y + radius * 0.14,
      radius * 1.06
    );
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.28, "#f0e8d8");
    gradient.addColorStop(0.7, "#cdbf9e");
    gradient.addColorStop(1, "#ae9470");
    context.shadowColor = "rgba(0,0,0,0.36)";
    context.shadowBlur = radius * 0.72;
    context.shadowOffsetY = radius * 0.14;
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;

    const shine: CanvasGradient = context.createRadialGradient(
      x - radius * 0.3,
      y - radius * 0.35,
      0,
      x - radius * 0.08,
      y - radius * 0.1,
      radius * 0.62
    );
    shine.addColorStop(0, "rgba(255,255,255,0.55)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = shine;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawBloom(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  player: Player,
  age: number,
  points: readonly InkPoint[]
): void {
  if (radius <= 0) {
    return;
  }

  context.save();
  if (player === "black") {
    const innerProgress: number = easeOutQuad(age / 260);
    context.strokeStyle = `rgba(16,8,2,${(1 - innerProgress) * 0.42})`;
    context.lineWidth = 1.9;
    context.shadowColor = "rgba(16,8,2,0.28)";
    context.shadowBlur = 5;
    context.beginPath();
    context.arc(x, y, radius * (1 + innerProgress * 1.35), 0, Math.PI * 2);
    context.stroke();

    const outerProgress: number = easeOutQuad(Math.max(0, age - 70) / 340);
    context.strokeStyle = `rgba(10,5,1,${(1 - outerProgress) * 0.22})`;
    context.lineWidth = 1;
    context.shadowBlur = 7;
    context.beginPath();
    context.arc(x, y, radius * (1.18 + outerProgress * 1.9), 0, Math.PI * 2);
    context.stroke();

    context.shadowBlur = 2.5;
    for (const point of points) {
      const progress: number = Math.min(1, Math.max(0, age - 25) / 420);
      const particleRadius: number =
        radius * point.radius + progress * point.speed * radius;
      const alpha: number = Math.max(0, (1 - progress * 1.05) * 0.74);
      context.fillStyle = `rgba(8,4,1,${alpha})`;
      context.shadowColor = `rgba(8,4,1,${alpha * 0.35})`;
      context.beginPath();
      context.arc(
        x + Math.cos(point.angle) * particleRadius,
        y + Math.sin(point.angle) * particleRadius,
        point.size,
        0,
        Math.PI * 2
      );
      context.fill();
    }
  } else {
    const progress: number = easeOutQuad(age / 490);
    const glowRadius: number = radius * (1.5 + progress * 2.2);
    const gradient: CanvasGradient = context.createRadialGradient(
      x,
      y,
      radius * 0.7,
      x,
      y,
      glowRadius
    );
    gradient.addColorStop(0, `rgba(195,220,255,${(1 - progress) * 0.55})`);
    gradient.addColorStop(0.5, `rgba(210,230,255,${(1 - progress) * 0.28})`);
    gradient.addColorStop(1, "rgba(210,230,255,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, glowRadius, 0, Math.PI * 2);
    context.fill();

    const innerProgress: number = easeOutQuad(age / 300);
    context.strokeStyle = `rgba(200,225,255,${(1 - innerProgress) * 0.65})`;
    context.lineWidth = 1.8;
    context.shadowColor = `rgba(180,210,255,${(1 - innerProgress) * 0.45})`;
    context.shadowBlur = 8;
    context.beginPath();
    context.arc(x, y, radius * (1 + innerProgress * 1.2), 0, Math.PI * 2);
    context.stroke();

    const outerProgress: number = easeOutQuad(Math.max(0, age - 60) / 380);
    context.strokeStyle = `rgba(180,210,255,${(1 - outerProgress) * 0.35})`;
    context.lineWidth = 1;
    context.shadowBlur = 6;
    context.beginPath();
    context.arc(x, y, radius * (1.15 + outerProgress * 1.85), 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

function drawLastMoveMarker(
  context: CanvasRenderingContext2D,
  state: GameState,
  hiddenKeys: ReadonlySet<string>,
  layout: CanvasLayout
): void {
  if (state.status === "won" || state.moves.length === 0) {
    return;
  }

  const lastMove: Move = state.moves[state.moves.length - 1];
  if (hiddenKeys.has(positionKey(lastMove))) {
    return;
  }

  const point: ScreenPoint = getBoardPoint(lastMove, layout);
  context.fillStyle =
    lastMove.player === "black"
      ? "rgba(255,255,255,0.42)"
      : "rgba(45,25,7,0.38)";
  context.beginPath();
  context.arc(point.x, point.y, Math.max(0.5, layout.cellSize * 0.095), 0, Math.PI * 2);
  context.fill();
}

function drawHoverStone(
  context: CanvasRenderingContext2D,
  state: GameState,
  hover: Position | null,
  layout: CanvasLayout
): void {
  if (hover === null || state.status !== "playing") {
    return;
  }

  const cell = state.board[hover.row]?.[hover.col];
  if (cell !== null) {
    return;
  }

  const point: ScreenPoint = getBoardPoint(hover, layout);
  context.save();
  context.globalAlpha = 0.4;
  drawStone(
    context,
    point.x,
    point.y,
    layout.cellSize * STONE_RADIUS_RATIO,
    state.currentPlayer
  );
  context.restore();
}

function drawFocusCursor(
  context: CanvasRenderingContext2D,
  cursor: Position,
  isFocused: boolean,
  layout: CanvasLayout
): void {
  if (!isFocused) {
    return;
  }

  const point: ScreenPoint = getBoardPoint(cursor, layout);
  context.save();
  context.strokeStyle = "rgba(31, 71, 56, 0.8)";
  context.lineWidth = Math.max(1, layout.cellSize * 0.045);
  context.setLineDash([layout.cellSize * 0.13, layout.cellSize * 0.16]);
  context.beginPath();
  context.arc(point.x, point.y, layout.cellSize * 0.5, 0, Math.PI * 2);
  context.stroke();
  context.restore();
}

function drawResetRings(
  context: CanvasRenderingContext2D,
  ringsRef: WritableRef<RingAnimation[]>,
  timestamp: number
): void {
  ringsRef.current = ringsRef.current.filter((ring: RingAnimation) => {
    const seconds: number = (timestamp - ring.startedAt) / 1000;
    const radius: number = RESET_RING_SPEED * seconds;
    if (radius > ring.maxRadius) {
      return false;
    }

    const alpha: number = Math.max(0, 0.82 - seconds * 1.55);
    if (alpha <= 0) {
      return false;
    }

    context.save();
    context.beginPath();
    context.arc(ring.origin.x, ring.origin.y, radius, 0, Math.PI * 2);
    context.strokeStyle = `rgba(240,200,100,${alpha})`;
    context.lineWidth = Math.max(2, 7 - seconds * 4);
    context.shadowColor = `rgba(255,220,120,${alpha * 0.75})`;
    context.shadowBlur = 18;
    context.stroke();
    context.restore();
    return true;
  });
}

type DrawUndoLiftsInput = {
  context: CanvasRenderingContext2D;
  engineRef: WritableRef<Matter.Engine | null>;
  physicsStonesRef: WritableRef<PhysicsStone[]>;
  undoLiftsRef: WritableRef<UndoLift[]>;
  timestamp: number;
};

function drawUndoLifts(input: DrawUndoLiftsInput): void {
  const activeLifts: UndoLift[] = [];

  for (const lift of input.undoLiftsRef.current) {
    const progress: number = Math.min(
      1,
      (input.timestamp - lift.startedAt) / UNDO_LIFT_DURATION_MS
    );

    if (progress >= 1) {
      launchUndoStone(input.engineRef, input.physicsStonesRef, lift, input.timestamp);
      continue;
    }

    const eased: number = easeOutQuad(progress);
    const x: number = lift.start.x;
    const y: number = lift.start.y - eased * lift.radius * 4.6;
    const scale: number = 1 + eased * 0.22;
    input.context.save();
    input.context.translate(x, y);
    input.context.scale(scale, scale);
    input.context.translate(-x, -y);
    drawStone(input.context, x, y, lift.radius, lift.player);
    input.context.restore();
    activeLifts.push(lift);
  }

  input.undoLiftsRef.current = activeLifts;
}

function launchUndoStone(
  engineRef: WritableRef<Matter.Engine | null>,
  physicsStonesRef: WritableRef<PhysicsStone[]>,
  lift: UndoLift,
  timestamp: number
): void {
  const engine: Matter.Engine = getPhysicsEngine(engineRef);
  const launchPoint: ScreenPoint = {
    x: lift.start.x,
    y: lift.start.y - lift.radius * 4.6
  };
  const boardCenter: ScreenPoint = getBoardCenterFromRect(lift.boardRect);
  const directionX: number = launchPoint.x < boardCenter.x ? -1 : 1;
  const verticalBias: number = launchPoint.y < boardCenter.y ? -3.8 : -6.2;
  const body: Matter.Body = Matter.Bodies.circle(
    launchPoint.x,
    launchPoint.y,
    lift.radius,
    {
      density: 0.004,
      friction: 0.04,
      frictionAir: 0.006,
      restitution: 0.74
    },
    32
  );

  Matter.Composite.add(engine.world, body);
  Matter.Body.setVelocity(body, {
    x: directionX * 15.5,
    y: verticalBias
  });
  Matter.Body.setAngularVelocity(body, directionX * 0.26);

  physicsStonesRef.current.push({
    id: lift.id,
    player: lift.player,
    body,
    radius: lift.radius,
    mode: "undo",
    origin: boardCenter,
    boardRect: lift.boardRect,
    createdAt: timestamp,
    impactAt: timestamp,
    impactedAt: timestamp,
    isFalling: false
  });
}

function updatePhysicsStones(
  engineRef: WritableRef<Matter.Engine | null>,
  physicsStonesRef: WritableRef<PhysicsStone[]>,
  timestamp: number,
  deltaMs: number
): void {
  if (physicsStonesRef.current.length === 0) {
    return;
  }

  const engine: Matter.Engine = getPhysicsEngine(engineRef);

  for (const stone of physicsStonesRef.current) {
    if (stone.mode === "reset" && stone.impactedAt === null && timestamp >= stone.impactAt) {
      impactResetStone(stone, timestamp);
    }
  }

  Matter.Engine.update(engine, deltaMs);

  const activeStones: PhysicsStone[] = [];
  for (const stone of physicsStonesRef.current) {
    updateStoneFalling(stone);
    const isExpired: boolean =
      stone.body.position.y > window.innerHeight + stone.radius * 8 ||
      timestamp - stone.createdAt > PHYSICS_MAX_LIFE_MS;

    if (isExpired) {
      Matter.Composite.remove(engine.world, stone.body);
      continue;
    }

    activeStones.push(stone);
  }

  physicsStonesRef.current = activeStones;
}

function impactResetStone(stone: PhysicsStone, timestamp: number): void {
  const position = stone.body.position;
  const dx: number = position.x - stone.origin.x;
  const dy: number = position.y - stone.origin.y;
  const distance: number = Math.max(1, Math.hypot(dx, dy));
  const nx: number = dx / distance;
  const ny: number = dy / distance;
  const tangential: number = ((hashStringToUnit(stone.id) - 0.5) * 2) * 2.4;

  Matter.Body.setStatic(stone.body, false);
  Matter.Body.setVelocity(stone.body, {
    x: nx * 19 + -ny * tangential,
    y: ny * 16 + nx * tangential - 3.5
  });
  Matter.Body.setAngularVelocity(stone.body, (hashStringToUnit(`${stone.id}:a`) - 0.5) * 0.5);
  stone.impactedAt = timestamp;
}

function updateStoneFalling(stone: PhysicsStone): void {
  if (stone.impactedAt === null) {
    return;
  }

  const position = stone.body.position;
  const outsideBoard: boolean =
    position.x < stone.boardRect.left - stone.radius ||
    position.x > stone.boardRect.right + stone.radius ||
    position.y < stone.boardRect.top - stone.radius ||
    position.y > stone.boardRect.bottom + stone.radius;

  if (!outsideBoard) {
    return;
  }

  if (!stone.isFalling) {
    Matter.Body.setVelocity(stone.body, {
      x: stone.body.velocity.x * 0.5,
      y: Math.max(stone.body.velocity.y, 2.2)
    });
    stone.isFalling = true;
    return;
  }

  Matter.Body.setVelocity(stone.body, {
    x: stone.body.velocity.x * 0.985,
    y: stone.body.velocity.y
  });
}

function drawPhysicsStones(
  context: CanvasRenderingContext2D,
  stones: readonly PhysicsStone[],
  timestamp: number
): void {
  for (const stone of stones) {
    const position = stone.body.position;
    const impactAge: number =
      stone.impactedAt === null ? -1 : timestamp - stone.impactedAt;
    const impactScale: number =
      impactAge >= 0 && impactAge < 120
        ? 1 + 0.38 * Math.sin((impactAge / 120) * Math.PI)
        : 1;

    context.save();
    context.translate(position.x, position.y);
    context.rotate(stone.body.angle);
    context.scale(impactScale, impactScale);
    drawStone(context, 0, 0, stone.radius, stone.player);
    context.restore();
  }
}

function getPhysicsEngine(
  engineRef: WritableRef<Matter.Engine | null>
): Matter.Engine {
  if (engineRef.current !== null) {
    return engineRef.current;
  }

  const engine: Matter.Engine = Matter.Engine.create();
  engine.gravity.x = 0;
  engine.gravity.y = 1.35;
  engine.gravity.scale = 0.0017;
  engineRef.current = engine;
  return engine;
}

function resizeMainCanvas(
  canvas: HTMLCanvasElement,
  layoutRef: WritableRef<CanvasLayout>
): void {
  const rect: DOMRect = canvas.getBoundingClientRect();
  const size: number = Math.max(1, Math.min(rect.width, rect.height));
  const dpr: number = getDevicePixelRatio();
  const pixelSize: number = Math.round(size * dpr);

  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize;
    canvas.height = pixelSize;
  }

  const padding: number = Math.round(size * 0.052);
  layoutRef.current = {
    size,
    padding,
    cellSize: (size - padding * 2) / BOARD_GRID_MAX
  };
}

function resizeOverlayCanvas(canvas: HTMLCanvasElement): void {
  const dpr: number = getDevicePixelRatio();
  const width: number = Math.max(1, Math.round(window.innerWidth * dpr));
  const height: number = Math.max(1, Math.round(window.innerHeight * dpr));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function getPositionFromClient(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement | null,
  layout: CanvasLayout
): Position | null {
  if (canvas === null || layout.cellSize <= 0) {
    return null;
  }

  const rect: DOMRect = canvas.getBoundingClientRect();
  const x: number = clientX - rect.left;
  const y: number = clientY - rect.top;
  const col: number = Math.round((x - layout.padding) / layout.cellSize);
  const row: number = Math.round((y - layout.padding) / layout.cellSize);

  if (row < 0 || row > BOARD_GRID_MAX || col < 0 || col > BOARD_GRID_MAX) {
    return null;
  }

  return { row, col };
}

function getBoardPoint(position: Position, layout: CanvasLayout): ScreenPoint {
  return {
    x: layout.padding + position.col * layout.cellSize,
    y: layout.padding + position.row * layout.cellSize
  };
}

function getScreenPointFromMove(
  move: Move,
  rect: DOMRect,
  layout: CanvasLayout
): ScreenPoint {
  const point: ScreenPoint = getBoardPoint(move, layout);
  return {
    x: rect.left + point.x,
    y: rect.top + point.y
  };
}

function getBoardRectSnapshot(
  rect: DOMRect,
  layout: CanvasLayout
): BoardRectSnapshot {
  return {
    left: rect.left + layout.padding,
    top: rect.top + layout.padding,
    right: rect.left + layout.padding + BOARD_GRID_MAX * layout.cellSize,
    bottom: rect.top + layout.padding + BOARD_GRID_MAX * layout.cellSize
  };
}

function getBoardCenterFromRect(rect: BoardRectSnapshot): ScreenPoint {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2
  };
}

function getMaxDistanceToBoardCorners(
  origin: ScreenPoint,
  rect: BoardRectSnapshot
): number {
  const corners: readonly ScreenPoint[] = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.left, y: rect.bottom },
    { x: rect.right, y: rect.bottom }
  ];

  return corners.reduce(
    (maxDistance: number, corner: ScreenPoint) =>
      Math.max(maxDistance, Math.hypot(corner.x - origin.x, corner.y - origin.y)),
    0
  );
}

function snapshotWaveHighlights(
  highlights: readonly WaveHighlight[],
  moves: readonly Move[]
): readonly CanvasWaveHighlight[] {
  const turnByPosition = new Map<string, number>(
    moves.map((move: Move) => [positionKey(move), move.turn])
  );
  const snapshots: CanvasWaveHighlight[] = [];

  for (const highlight of highlights) {
    const turn: number | undefined = turnByPosition.get(positionKey(highlight.position));
    if (turn === undefined) {
      continue;
    }

    snapshots.push({ ...highlight, turn });
  }

  return snapshots;
}

function getMoveWaveScale(
  move: Move,
  waves: readonly CanvasWaveAnimation[],
  timestamp: number
): number {
  let scale = 1;

  for (const wave of waves) {
    for (const highlight of wave.highlights) {
      if (
        highlight.turn !== move.turn ||
        highlight.position.row !== move.row ||
        highlight.position.col !== move.col
      ) {
        continue;
      }

      scale = Math.max(
        scale,
        getWaveScaleFromDelay(wave.startedAt, highlight.delayMs, timestamp)
      );
    }
  }

  return scale;
}

function pruneHiddenKeys(
  hiddenKeys: Set<string>,
  moves: readonly Move[]
): void {
  if (hiddenKeys.size === 0) {
    return;
  }

  const activeKeys = new Set<string>(
    moves.map((move: Move) => positionKey(move))
  );
  for (const key of hiddenKeys) {
    if (!activeKeys.has(key)) {
      hiddenKeys.delete(key);
    }
  }
}

function clampBoardIndex(value: number): number {
  return Math.min(BOARD_GRID_MAX, Math.max(0, value));
}

function getDevicePixelRatio(): number {
  return Math.min(
    DEVICE_PIXEL_RATIO_CAP,
    Math.max(1, window.devicePixelRatio || 1)
  );
}

function easeOutQuad(value: number): number {
  const clamped: number = Math.min(1, Math.max(0, value));
  return 1 - Math.pow(1 - clamped, 2);
}

function hashStringToUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
