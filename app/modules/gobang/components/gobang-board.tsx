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
import { createPortal } from "react-dom";

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
  ) => number;
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

type ResetImpulse = {
  at: number;
  dvx: number;
  dvy: number;
};

type ResetPhysicsStone = {
  id: string;
  player: Player;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isOnBoard: boolean;
  exitNormalX: number;
  exitNormalY: number;
  nonZeroMomentumAt: number;
  depth: number;
  depthVelocity: number;
  scale: number;
  alpha: number;
  impulses: ResetImpulse[];
  radius: number;
  boardOrigin: ScreenPoint;
  createdAt: number;
};

type CatPawRemoval = {
  id: string;
  player: Player;
  start: ScreenPoint;
  corner: ScreenPoint;
  direction: number;
  radius: number;
  startedAt: number;
};

type WaterRipple = {
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
const CAT_PAW_APPROACH_MS = 480;
const CAT_PAW_GRAB_MS = 200;
const CAT_PAW_HOLD_MS = 420;
const CAT_PAW_CARRY_MS = 520;
const CAT_PAW_TOTAL_MS =
  CAT_PAW_APPROACH_MS + CAT_PAW_GRAB_MS + CAT_PAW_HOLD_MS + CAT_PAW_CARRY_MS;
const CAT_PAW_RADIUS_MULTIPLIER = 3.75;
const RIPPLE_SPEED = 370;
const RIPPLE_LAMBDA = 60;
const RIPPLE_VISUAL_RING_COUNT = 4;
const IMPULSE_BASE = 1180;
const IMPULSE_DIST_DECAY = 760;
const RESET_EXIT_TARGET_SECONDS = 0.86;
const RESET_MIN_EXIT_SPEED = 760;
const RESET_MAX_EXIT_SPEED = 1700;
const RESET_ZERO_MOMENTUM_NUDGE_AFTER_MS = 360;
const RESET_ZERO_MOMENTUM_NUDGE_SPEED = 190;
const RESET_INITIAL_FALL_VELOCITY = 140;
const RESET_FALL_GRAVITY = 1700;
const RESET_FALL_SCALE_DEPTH = 540;
const RESET_FALL_FADE_START_DEPTH = 180;
const RESET_FALL_FADE_DISTANCE = 620;
const RESET_LOCK_AFTER_LAST_IMPULSE_MS = 3600;
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
    const isKeyboardCursorVisibleRef = useRef(false);
    const bloomsRef = useRef<BloomAnimation[]>([]);
    const wavesRef = useRef<CanvasWaveAnimation[]>([]);
    const resetPhysicsStonesRef = useRef<ResetPhysicsStone[]>([]);
    const catPawRemovalsRef = useRef<CatPawRemoval[]>([]);
    const waterRipplesRef = useRef<WaterRipple[]>([]);
    const hiddenKeysRef = useRef<Set<string>>(new Set());
    const seenPlacementIdsRef = useRef<Set<string>>(new Set());
    const seenWaveIdsRef = useRef<Set<string>>(new Set());
    const lastResetPhysicsTimestampRef = useRef<number>(0);
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
      (moves: readonly Move[], origin?: ScreenPoint): number => {
        if (moves.length === 0) {
          return 0;
        }

        const canvas: HTMLCanvasElement | null = mainCanvasRef.current;
        if (canvas === null) {
          return 0;
        }

        const rect: DOMRect = canvas.getBoundingClientRect();
        const layout: CanvasLayout = layoutRef.current;
        if (layout.size <= 0 || layout.cellSize <= 0) {
          return 0;
        }

        const boardRect: BoardRectSnapshot = getBoardRectSnapshot(rect, layout);
        const shockOrigin: ScreenPoint =
          origin ?? getBoardCenterFromRect(boardRect);
        const now: number = performance.now();
        const radius: number = layout.cellSize * STONE_RADIUS_RATIO;
        const maxRadius: number =
          getMaxDistanceToBoardCorners(shockOrigin, boardRect) + RIPPLE_LAMBDA;

        bloomsRef.current = [];
        wavesRef.current = [];
        catPawRemovalsRef.current = [];
        hiddenKeysRef.current.clear();
        resetPhysicsStonesRef.current = [];
        waterRipplesRef.current = [];
        waterRipplesRef.current.push({
          id: createAnimationId("water-ripple"),
          origin: shockOrigin,
          startedAt: now,
          maxRadius
        });
        lastResetPhysicsTimestampRef.current = now;

        let maxImpulseDelay = 0;
        for (const move of moves) {
          const point: ScreenPoint = getBoardPoint(move, layout);
          const viewportPoint: ScreenPoint = {
            x: rect.left + point.x,
            y: rect.top + point.y
          };
          const distance: number = Math.max(
            1,
            Math.hypot(viewportPoint.x - shockOrigin.x, viewportPoint.y - shockOrigin.y)
          );
          const normalX: number = (viewportPoint.x - shockOrigin.x) / distance;
          const normalY: number = (viewportPoint.y - shockOrigin.y) / distance;
          const distanceFactor: number = Math.exp(-distance / IMPULSE_DIST_DECAY);
          const hitDelay: number = (distance / RIPPLE_SPEED) * 1000;
          const rawImpulse: number = IMPULSE_BASE * distanceFactor;
          const exitSpeed: number = getExitSpeedForBoardPoint(
            point,
            normalX,
            normalY,
            layout.size,
            radius
          );
          const impulse: number = clampNumber(
            Math.max(rawImpulse, exitSpeed),
            RESET_MIN_EXIT_SPEED,
            RESET_MAX_EXIT_SPEED
          );
          const impulses: ResetImpulse[] = [];

          impulses.push({
            at: now + hitDelay,
            dvx: normalX * impulse,
            dvy: normalY * impulse
          });
          maxImpulseDelay = Math.max(maxImpulseDelay, hitDelay);

          resetPhysicsStonesRef.current.push({
            id: createAnimationId("reset-stone"),
            player: move.player,
            x: point.x,
            y: point.y,
            vx: 0,
            vy: 0,
            isOnBoard: true,
            exitNormalX: normalX,
            exitNormalY: normalY,
            nonZeroMomentumAt:
              now + hitDelay + RESET_ZERO_MOMENTUM_NUDGE_AFTER_MS,
            depth: 0,
            depthVelocity: 0,
            scale: 1,
            alpha: 1,
            impulses,
            radius,
            boardOrigin: {
              x: rect.left,
              y: rect.top
            },
            createdAt: now,
          });
        }

        return maxImpulseDelay + RESET_LOCK_AFTER_LAST_IMPULSE_MS;
      },
      [createAnimationId]
    );

    const playUndoAnimation = useCallback(
      (move: Move): void => {
        const canvas: HTMLCanvasElement | null = mainCanvasRef.current;
        if (canvas === null) {
          return;
        }

        const layout: CanvasLayout = layoutRef.current;
        if (layout.size <= 0 || layout.cellSize <= 0) {
          return;
        }

        const start: ScreenPoint = getBoardPoint(move, layout);
        const corner: ScreenPoint = {
          x: move.col < BOARD_SIZE / 2 ? 0 : layout.size,
          y: move.row < BOARD_SIZE / 2 ? 0 : layout.size
        };
        const radius: number = layout.cellSize * STONE_RADIUS_RATIO;
        hiddenKeysRef.current.add(positionKey(move));
        catPawRemovalsRef.current.push({
          id: createAnimationId("cat-paw"),
          player: move.player,
          start,
          corner,
          direction: Math.atan2(start.y - corner.y, start.x - corner.x),
          radius,
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
          isKeyboardCursorVisible: isKeyboardCursorVisibleRef.current,
          bloomsRef,
          wavesRef,
          resetPhysicsStonesRef,
          catPawRemovalsRef,
          hiddenKeysRef,
          timestamp
        });
        drawOverlayCanvas({
          canvas: overlay,
          layout: layoutRef.current,
          resetPhysicsStonesRef,
          waterRipplesRef,
          lastResetPhysicsTimestampRef,
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
      isKeyboardCursorVisibleRef.current = false;
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
        const cursor: Position = cursorRef.current;
        const cell: Player | null | undefined = state.board[cursor.row]?.[cursor.col];
        if (cell === null) {
          isKeyboardCursorVisibleRef.current = false;
          setRenderTick((value: number) => value + 1);
        }
        onPlace(cursor);
      }
    };

    const setCursorPosition = (position: Position): void => {
      cursorRef.current = {
        row: clampBoardIndex(position.row),
        col: clampBoardIndex(position.col)
      };
      isKeyboardCursorVisibleRef.current = true;
      setRenderTick((value: number) => value + 1);
    };

    return (
      <div className="board-shell">
        {typeof document === "undefined"
          ? null
          : createPortal(
              <canvas
                ref={overlayCanvasRef}
                aria-hidden="true"
                className="physics-overlay-canvas"
              />,
              document.body
            )}
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
  isKeyboardCursorVisible: boolean;
  bloomsRef: WritableRef<BloomAnimation[]>;
  wavesRef: WritableRef<CanvasWaveAnimation[]>;
  resetPhysicsStonesRef: WritableRef<ResetPhysicsStone[]>;
  catPawRemovalsRef: WritableRef<CatPawRemoval[]>;
  hiddenKeysRef: WritableRef<Set<string>>;
  timestamp: number;
};

type DrawOverlayCanvasInput = {
  canvas: HTMLCanvasElement;
  layout: CanvasLayout;
  resetPhysicsStonesRef: WritableRef<ResetPhysicsStone[]>;
  waterRipplesRef: WritableRef<WaterRipple[]>;
  lastResetPhysicsTimestampRef: WritableRef<number>;
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
  drawFocusCursor(
    context,
    input.cursor,
    input.isFocused && input.isKeyboardCursorVisible,
    layout
  );

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

  drawCatPawRemovals({
    context,
    catPawRemovalsRef: input.catPawRemovalsRef,
    timestamp: input.timestamp
  });
  drawOnBoardResetPhysicsStones(
    context,
    input.resetPhysicsStonesRef.current
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
  const rect: DOMRect = input.canvas.getBoundingClientRect();
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  context.save();
  context.translate(-rect.left, -rect.top);
  drawWaterRipples(context, input.waterRipplesRef, input.timestamp);
  updateResetPhysicsStones(
    input.resetPhysicsStonesRef,
    input.lastResetPhysicsTimestampRef,
    input.layout,
    input.timestamp,
    input.deltaMs
  );
  drawOffBoardResetPhysicsStones(
    context,
    input.resetPhysicsStonesRef.current
  );
  context.restore();
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

function drawWaterRipples(
  context: CanvasRenderingContext2D,
  ripplesRef: WritableRef<WaterRipple[]>,
  timestamp: number
): void {
  ripplesRef.current = ripplesRef.current.filter((ripple: WaterRipple) => {
    const seconds: number = (timestamp - ripple.startedAt) / 1000;
    if (seconds < 0) {
      return true;
    }

    if (RIPPLE_SPEED * seconds > ripple.maxRadius + RIPPLE_LAMBDA) {
      return false;
    }

    drawWaterRipple(context, ripple, seconds);
    return seconds < 3.5;
  });
}

function drawWaterRipple(
  context: CanvasRenderingContext2D,
  ripple: WaterRipple,
  seconds: number
): void {
  const { origin } = ripple;

  if (seconds < 0.4) {
    const splashProgress: number = seconds / 0.4;
    const splashRadius: number = Math.max(0.1, splashProgress * 28);
    context.save();
    context.beginPath();
    context.arc(origin.x, origin.y, splashRadius, 0, Math.PI * 2);
    context.strokeStyle = `rgba(255,252,235,${Math.max(0, (1 - splashProgress) * 0.85)})`;
    context.lineWidth = 2.5;
    context.shadowColor = `rgba(255,240,180,${(1 - splashProgress) * 0.6})`;
    context.shadowBlur = 14;
    context.stroke();
    context.restore();
  }

  for (let ring = 0; ring < RIPPLE_VISUAL_RING_COUNT; ring += 1) {
    const radius: number = RIPPLE_SPEED * seconds - ring * RIPPLE_LAMBDA;
    if (radius <= 0.5) {
      continue;
    }

    const distanceDecay: number = Math.exp(-radius / 460);
    const timeDecay: number = Math.max(0, 1 - seconds / 2.1);
    const ringDecay: number = Math.pow(0.7, ring);
    const alpha: number = distanceDecay * timeDecay * ringDecay;
    if (alpha < 0.015) {
      continue;
    }

    context.save();
    context.beginPath();
    context.arc(origin.x, origin.y, radius, 0, Math.PI * 2);
    context.strokeStyle = `rgba(205,232,255,${alpha * 0.88})`;
    context.lineWidth = 1.8;
    context.shadowColor = `rgba(160,215,255,${alpha * 0.6})`;
    context.shadowBlur = 12;
    context.stroke();

    if (radius > 7) {
      context.beginPath();
      context.arc(origin.x, origin.y, Math.max(0.5, radius - 6), 0, Math.PI * 2);
      context.strokeStyle = `rgba(195,228,255,${alpha * 0.28})`;
      context.lineWidth = 10;
      context.shadowBlur = 24;
      context.stroke();
    }

    context.restore();
  }
}

type DrawCatPawRemovalsInput = {
  context: CanvasRenderingContext2D;
  catPawRemovalsRef: WritableRef<CatPawRemoval[]>;
  timestamp: number;
};

function drawCatPawRemovals(input: DrawCatPawRemovalsInput): void {
  const activeRemovals: CatPawRemoval[] = [];

  for (const removal of input.catPawRemovalsRef.current) {
    const age: number = input.timestamp - removal.startedAt;
    if (age >= CAT_PAW_TOTAL_MS) {
      continue;
    }

    drawCatPawRemoval(input.context, removal, age);
    activeRemovals.push(removal);
  }

  input.catPawRemovalsRef.current = activeRemovals;
}

function drawCatPawRemoval(
  context: CanvasRenderingContext2D,
  removal: CatPawRemoval,
  age: number
): void {
  let pawPoint: ScreenPoint = removal.corner;
  let pawScale = 1;
  let pawAlpha = 1;
  let stonePoint: ScreenPoint = removal.start;

  if (age < CAT_PAW_APPROACH_MS) {
    const progress: number = easeInOutSine(age / CAT_PAW_APPROACH_MS);
    pawPoint = lerpPoint(removal.corner, removal.start, progress);
    pawAlpha = Math.min(1, age / 80);
    stonePoint = removal.start;
  } else if (age < CAT_PAW_APPROACH_MS + CAT_PAW_GRAB_MS) {
    const progress: number = (age - CAT_PAW_APPROACH_MS) / CAT_PAW_GRAB_MS;
    pawPoint = removal.start;
    pawScale = 1 - 0.13 * Math.sin(progress * Math.PI);
    stonePoint = removal.start;
  } else if (age < CAT_PAW_APPROACH_MS + CAT_PAW_GRAB_MS + CAT_PAW_HOLD_MS) {
    const holdProgress: number =
      (age - CAT_PAW_APPROACH_MS - CAT_PAW_GRAB_MS) / CAT_PAW_HOLD_MS;
    pawPoint = removal.start;
    pawScale = 1 + 0.025 * Math.sin(holdProgress * Math.PI * 2);
    stonePoint = removal.start;
  } else {
    const progress: number = easeInOutSine(
      (age - CAT_PAW_APPROACH_MS - CAT_PAW_GRAB_MS - CAT_PAW_HOLD_MS) /
        CAT_PAW_CARRY_MS
    );
    pawPoint = lerpPoint(removal.start, removal.corner, progress);
    stonePoint = pawPoint;
  }

  context.save();
  drawStone(context, stonePoint.x, stonePoint.y, removal.radius, removal.player);
  context.restore();

  context.save();
  context.globalAlpha = pawAlpha;
  context.translate(pawPoint.x, pawPoint.y);
  context.scale(pawScale, pawScale);
  context.translate(-pawPoint.x, -pawPoint.y);
  drawCatPaw(
    context,
    pawPoint.x,
    pawPoint.y,
    removal.radius * CAT_PAW_RADIUS_MULTIPLIER,
    removal.direction
  );
  context.restore();
}

function drawCatPaw(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  direction: number
): void {
  if (radius <= 0) {
    return;
  }

  context.save();
  context.translate(x, y);
  context.rotate(direction);

  const fill = "rgba(234, 172, 182, 0.96)";
  const stroke = "rgba(192, 112, 128, 0.52)";
  const highlight = "rgba(255, 218, 224, 0.55)";

  context.shadowColor = "rgba(140, 50, 70, 0.28)";
  context.shadowBlur = 10;
  context.shadowOffsetX = 1.5;
  context.shadowOffsetY = 1.5;
  context.fillStyle = fill;
  context.beginPath();
  context.ellipse(0, 0, radius * 0.44, radius * 0.4, 0, 0, Math.PI * 2);
  context.fill();

  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 0;
  context.strokeStyle = stroke;
  context.lineWidth = 1.2;
  context.stroke();

  context.fillStyle = highlight;
  context.beginPath();
  context.ellipse(-radius * 0.06, -radius * 0.1, radius * 0.22, radius * 0.17, 0, 0, Math.PI * 2);
  context.fill();

  const toes: readonly {
    x: number;
    y: number;
    rx: number;
    ry: number;
  }[] = [
    { x: radius * 0.47, y: -radius * 0.28, rx: radius * 0.163, ry: radius * 0.145 },
    { x: radius * 0.6, y: -radius * 0.08, rx: radius * 0.153, ry: radius * 0.138 },
    { x: radius * 0.6, y: radius * 0.08, rx: radius * 0.153, ry: radius * 0.138 },
    { x: radius * 0.47, y: radius * 0.28, rx: radius * 0.163, ry: radius * 0.145 }
  ];

  for (const toe of toes) {
    context.fillStyle = fill;
    context.beginPath();
    context.ellipse(toe.x, toe.y, toe.rx, toe.ry, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = stroke;
    context.lineWidth = 0.9;
    context.stroke();

    context.fillStyle = highlight;
    context.beginPath();
    context.ellipse(
      toe.x - toe.rx * 0.2,
      toe.y - toe.ry * 0.25,
      toe.rx * 0.5,
      toe.ry * 0.45,
      0,
      0,
      Math.PI * 2
    );
    context.fill();
  }

  context.restore();
}

function updateResetPhysicsStones(
  stonesRef: WritableRef<ResetPhysicsStone[]>,
  lastTimestampRef: WritableRef<number>,
  layout: CanvasLayout,
  timestamp: number,
  deltaMs: number
): void {
  if (stonesRef.current.length === 0 || layout.size <= 0) {
    lastTimestampRef.current = timestamp;
    return;
  }

  const previousTimestamp: number = lastTimestampRef.current || timestamp;
  const deltaSeconds: number = Math.min(
    0.033,
    Math.max(0, (timestamp - previousTimestamp || deltaMs) / 1000)
  );
  lastTimestampRef.current = timestamp;
  if (deltaSeconds <= 0) {
    return;
  }

  applyResetImpulses(stonesRef.current, timestamp);
  integrateResetPhysics(stonesRef.current, deltaSeconds, layout.size, timestamp);
  resolveResetCollisions(stonesRef.current);

  stonesRef.current = stonesRef.current.filter(
    (stone: ResetPhysicsStone) => stone.isOnBoard || stone.alpha > 0.01
  );
}

function applyResetImpulses(
  stones: readonly ResetPhysicsStone[],
  timestamp: number
): void {
  for (const stone of stones) {
    stone.impulses = stone.impulses.filter((impulse: ResetImpulse) => {
      if (timestamp < impulse.at) {
        return true;
      }

      stone.vx += impulse.dvx;
      stone.vy += impulse.dvy;
      return false;
    });
  }
}

function integrateResetPhysics(
  stones: readonly ResetPhysicsStone[],
  deltaSeconds: number,
  boardSize: number,
  timestamp: number
): void {
  for (const stone of stones) {
    if (stone.isOnBoard) {
      applyZeroMomentumNudge(stone, timestamp);
    } else {
      stone.depthVelocity += RESET_FALL_GRAVITY * deltaSeconds;
      stone.depth += stone.depthVelocity * deltaSeconds;
      stone.scale = clampNumber(
        1 - stone.depth / RESET_FALL_SCALE_DEPTH,
        0.035,
        1
      );
      stone.alpha = clampNumber(
        1 -
          Math.max(0, stone.depth - RESET_FALL_FADE_START_DEPTH) /
            RESET_FALL_FADE_DISTANCE,
        0,
        1
      );
    }

    stone.x += stone.vx * deltaSeconds;
    stone.y += stone.vy * deltaSeconds;

    if (
      stone.isOnBoard &&
      (stone.x < 0 || stone.x > boardSize || stone.y < 0 || stone.y > boardSize)
    ) {
      stone.isOnBoard = false;
      stone.depth = 0;
      stone.depthVelocity =
        RESET_INITIAL_FALL_VELOCITY + Math.hypot(stone.vx, stone.vy) * 0.08;
    }
  }
}

function applyZeroMomentumNudge(
  stone: ResetPhysicsStone,
  timestamp: number
): void {
  if (timestamp < stone.nonZeroMomentumAt || stone.impulses.length > 0) {
    return;
  }

  const speed: number = Math.hypot(stone.vx, stone.vy);
  if (speed >= RESET_ZERO_MOMENTUM_NUDGE_SPEED) {
    return;
  }

  const fallbackSpeed: number = Math.max(speed, RESET_ZERO_MOMENTUM_NUDGE_SPEED);
  stone.vx = stone.exitNormalX * fallbackSpeed;
  stone.vy = stone.exitNormalY * fallbackSpeed;
}

function resolveResetCollisions(stones: readonly ResetPhysicsStone[]): void {
  const onBoardStones: ResetPhysicsStone[] = stones.filter(
    (stone: ResetPhysicsStone) => stone.isOnBoard
  );
  if (onBoardStones.length < 2) {
    return;
  }

  const radius: number = onBoardStones[0]?.radius ?? 0;
  const diameter: number = radius * 2;
  for (let index = 0; index < onBoardStones.length - 1; index += 1) {
    const stoneA: ResetPhysicsStone = onBoardStones[index];
    for (let otherIndex = index + 1; otherIndex < onBoardStones.length; otherIndex += 1) {
      const stoneB: ResetPhysicsStone = onBoardStones[otherIndex];
      const dx: number = stoneB.x - stoneA.x;
      const dy: number = stoneB.y - stoneA.y;
      const distanceSquared: number = dx * dx + dy * dy;
      if (distanceSquared >= diameter * diameter) {
        continue;
      }

      const normal: ScreenPoint = getCollisionNormal(
        stoneA,
        stoneB,
        dx,
        dy,
        distanceSquared
      );
      const distance: number = Math.max(0.001, Math.sqrt(distanceSquared));
      const normalX: number = normal.x;
      const normalY: number = normal.y;
      const penetration: number = (diameter - distance) * 0.52;
      stoneA.x -= normalX * penetration;
      stoneA.y -= normalY * penetration;
      stoneB.x += normalX * penetration;
      stoneB.y += normalY * penetration;

      const relativeVelocity: number =
        (stoneB.vx - stoneA.vx) * normalX + (stoneB.vy - stoneA.vy) * normalY;
      if (relativeVelocity >= 0) {
        continue;
      }

      const impulse: number = -relativeVelocity;
      stoneA.vx -= impulse * normalX;
      stoneA.vy -= impulse * normalY;
      stoneB.vx += impulse * normalX;
      stoneB.vy += impulse * normalY;
      applyZeroMomentumNudge(stoneA, stoneA.nonZeroMomentumAt);
      applyZeroMomentumNudge(stoneB, stoneB.nonZeroMomentumAt);
    }
  }
}

function getCollisionNormal(
  stoneA: ResetPhysicsStone,
  stoneB: ResetPhysicsStone,
  dx: number,
  dy: number,
  distanceSquared: number
): ScreenPoint {
  if (distanceSquared >= 1e-6) {
    const distance: number = Math.sqrt(distanceSquared);
    return {
      x: dx / distance,
      y: dy / distance
    };
  }

  const fallbackX: number = stoneB.exitNormalX - stoneA.exitNormalX;
  const fallbackY: number = stoneB.exitNormalY - stoneA.exitNormalY;
  const fallbackLength: number = Math.hypot(fallbackX, fallbackY);
  if (fallbackLength >= 1e-6) {
    return {
      x: fallbackX / fallbackLength,
      y: fallbackY / fallbackLength
    };
  }

  const seed: number = hashStringToUnit(`${stoneA.id}:${stoneB.id}:normal`);
  const angle: number = seed * Math.PI * 2;
  return {
    x: Math.cos(angle),
    y: Math.sin(angle)
  };
}

function drawOnBoardResetPhysicsStones(
  context: CanvasRenderingContext2D,
  stones: readonly ResetPhysicsStone[]
): void {
  for (const stone of stones) {
    if (!stone.isOnBoard) {
      continue;
    }

    drawStone(context, stone.x, stone.y, stone.radius, stone.player);
  }
}

function drawOffBoardResetPhysicsStones(
  context: CanvasRenderingContext2D,
  stones: readonly ResetPhysicsStone[]
): void {
  for (const stone of stones) {
    if (stone.isOnBoard) {
      continue;
    }

    const viewportX: number = stone.boardOrigin.x + stone.x;
    const viewportY: number = stone.boardOrigin.y + stone.y;
    context.save();
    context.globalAlpha = stone.alpha;
    context.translate(viewportX, viewportY);
    context.scale(stone.scale, stone.scale);
    context.translate(-viewportX, -viewportY);
    drawStone(context, viewportX, viewportY, stone.radius, stone.player);
    context.restore();
  }
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

function getExitSpeedForBoardPoint(
  point: ScreenPoint,
  normalX: number,
  normalY: number,
  boardSize: number,
  radius: number
): number {
  const exitDistance: number = getRayExitDistanceFromBoard(
    point,
    normalX,
    normalY,
    boardSize,
    radius
  );
  return Math.max(
    RESET_MIN_EXIT_SPEED,
    (exitDistance + radius * 2) / RESET_EXIT_TARGET_SECONDS
  );
}

function getRayExitDistanceFromBoard(
  point: ScreenPoint,
  normalX: number,
  normalY: number,
  boardSize: number,
  radius: number
): number {
  const candidates: number[] = [];

  if (normalX > 0.001) {
    candidates.push((boardSize + radius - point.x) / normalX);
  } else if (normalX < -0.001) {
    candidates.push((-radius - point.x) / normalX);
  }

  if (normalY > 0.001) {
    candidates.push((boardSize + radius - point.y) / normalY);
  } else if (normalY < -0.001) {
    candidates.push((-radius - point.y) / normalY);
  }

  const positiveCandidates: number[] = candidates.filter(
    (candidate: number) => candidate > 0
  );
  if (positiveCandidates.length === 0) {
    return boardSize;
  }

  return Math.min(...positiveCandidates);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function easeInOutSine(value: number): number {
  const clamped: number = Math.min(1, Math.max(0, value));
  return (1 - Math.cos(Math.PI * clamped)) / 2;
}

function lerpPoint(
  start: ScreenPoint,
  end: ScreenPoint,
  progress: number
): ScreenPoint {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress
  };
}

function hashStringToUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
