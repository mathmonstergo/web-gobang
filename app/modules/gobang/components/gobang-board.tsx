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
import { getResetWaveCrestCount } from "@/modules/gobang/reset-physics";

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

type PlacementReplay = {
  id: string;
  player: Player;
  highlights: readonly CanvasWaveHighlight[];
  moveKey: string;
  turn: number;
};

type BoardRectSnapshot = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type SceneLayout = {
  width: number;
  height: number;
  boardOffsetX: number;
  boardOffsetY: number;
};

type ResetImpulse = {
  crestStartedAt: number;
  origin: ScreenPoint;
  magnitude: number;
  maxRadius: number;
};

type ResetStoneSetup = {
  move: Move;
  point: ScreenPoint;
  normalX: number;
  normalY: number;
  requiredImpulse: number;
  nonZeroMomentumAt: number;
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
  createdAt: number;
  noCollide: boolean;
  isActivated: boolean;
};

type CatSwatRemoval = {
  id: string;
  player: Player;
  stone: ScreenPoint;
  entry: ScreenPoint;
  swat: ScreenPoint;
  exit: ScreenPoint;
  heading: number;
  radius: number;
  bodyLength: number;
  startedAt: number;
  launched: boolean;
};

type ResetWaveCrest = {
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
const EMPTY_SCENE_LAYOUT: SceneLayout = {
  width: 0,
  height: 0,
  boardOffsetX: 0,
  boardOffsetY: 0
};
const STONE_RADIUS_RATIO = 0.43;
const CAT_BODY_CELLS = 5;
const CAT_RUN_IN_MS = 880;
const CAT_WINDUP_MS = 180;
const CAT_SWAT_MS = 130;
const CAT_RECOVER_MS = 150;
const CAT_RUN_OUT_MS = 820;
const CAT_TOTAL_MS =
  CAT_RUN_IN_MS + CAT_WINDUP_MS + CAT_SWAT_MS + CAT_RECOVER_MS + CAT_RUN_OUT_MS;
const CAT_RUN_CYCLE_MS = 280;
const CAT_SWAT_SPEED = 1350;
const CAT_FUR_DARK = "#37322d";
const CAT_FUR = "#46403a";
const CAT_FUR_FAR = "#5a534b";
const CAT_BELLY = "#6d655c";
const CAT_PINK = "rgba(228,150,160,0.95)";
const RIPPLE_SPEED = 370;
const RIPPLE_LAMBDA = 60;
const RESET_WAVE_INTERVAL_MS = 1500;
const RESET_FORCE_BASE = 820;
const IMPULSE_DIST_DECAY = 760;
const RESET_EXIT_TARGET_SECONDS = 0.86;
const RESET_MIN_EXIT_SPEED = 760;
const RESET_MAX_EXIT_SPEED = 1700;
const RESET_MAX_IMPULSE_PER_CREST = 460;
const RESET_ZERO_MOMENTUM_NUDGE_AFTER_MS = 360;
const RESET_ZERO_MOMENTUM_NUDGE_SPEED = 190;
const RESET_INITIAL_FALL_VELOCITY = 140;
const RESET_FALL_GRAVITY = 1700;
const RESET_FALL_SCALE_DEPTH = 540;
const RESET_FALL_FADE_START_DEPTH = 180;
const RESET_FALL_FADE_DISTANCE = 620;
const RESET_LOCK_AFTER_LAST_IMPULSE_MS = 3600;
const RESET_INPUT_LOCK_MS = 1200;
const PLACEMENT_REPLAY_DELAYS_MS: readonly number[] = [2000, 5000, 10000];
const PLACEMENT_REPLAY_INTERVAL_MS = 10000;
const DEVICE_PIXEL_RATIO_CAP = 2;

export const GobangBoard = forwardRef<GobangBoardHandle, GobangBoardProps>(
  function GobangBoard(
    { state, effects, onPlace }: GobangBoardProps,
    ref
  ): ReactElement {
    const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const boardSurfaceRef = useRef<HTMLDivElement | null>(null);
    const layoutRef = useRef<CanvasLayout>(EMPTY_LAYOUT);
    const sceneLayoutRef = useRef<SceneLayout>(EMPTY_SCENE_LAYOUT);
    const stateRef = useRef<GameState>(state);
    const effectsRef = useRef<DerivedEffects>(effects);
    const cursorRef = useRef<Position>({ row: 7, col: 7 });
    const hoverRef = useRef<Position | null>(null);
    const isFocusedRef = useRef(false);
    const isKeyboardCursorVisibleRef = useRef(false);
    const bloomsRef = useRef<BloomAnimation[]>([]);
    const wavesRef = useRef<CanvasWaveAnimation[]>([]);
    const resetPhysicsStonesRef = useRef<ResetPhysicsStone[]>([]);
    const catSwatRemovalsRef = useRef<CatSwatRemoval[]>([]);
    const resetWaveCrestsRef = useRef<ResetWaveCrest[]>([]);
    const placementReplayRef = useRef<PlacementReplay | null>(null);
    const placementReplayTimeoutsRef = useRef<number[]>([]);
    const placementReplayIntervalRef = useRef<number | null>(null);
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

    const clearPlacementReplayTimers = useCallback((): void => {
      for (const timeoutId of placementReplayTimeoutsRef.current) {
        window.clearTimeout(timeoutId);
      }
      placementReplayTimeoutsRef.current = [];

      if (placementReplayIntervalRef.current !== null) {
        window.clearInterval(placementReplayIntervalRef.current);
        placementReplayIntervalRef.current = null;
      }
    }, []);

    const clearPlacementReplay = useCallback((): void => {
      clearPlacementReplayTimers();
      placementReplayRef.current = null;
    }, [clearPlacementReplayTimers]);

    const enqueuePlacementReplayWave = useCallback(
      (replay: PlacementReplay): void => {
        const moves: readonly Move[] = stateRef.current.moves;
        if (moves.length === 0) {
          return;
        }

        const latestMove: Move = moves[moves.length - 1];
        if (
          latestMove.turn !== replay.turn ||
          positionKey(latestMove) !== replay.moveKey
        ) {
          return;
        }

        const highlights: readonly CanvasWaveHighlight[] =
          filterReplayHighlights(replay.highlights, stateRef.current.moves);
        if (highlights.length === 0) {
          return;
        }

        wavesRef.current.push({
          id: createAnimationId("placement-replay"),
          player: replay.player,
          highlights,
          startedAt: performance.now()
        });
      },
      [createAnimationId]
    );

    const schedulePlacementReplay = useCallback(
      (replay: PlacementReplay): void => {
        clearPlacementReplayTimers();
        placementReplayRef.current = replay;

        placementReplayTimeoutsRef.current = PLACEMENT_REPLAY_DELAYS_MS.map(
          (delayMs: number, index: number) =>
            window.setTimeout(() => {
              if (placementReplayRef.current?.id !== replay.id) {
                return;
              }

              enqueuePlacementReplayWave(replay);
              if (index !== PLACEMENT_REPLAY_DELAYS_MS.length - 1) {
                return;
              }

              placementReplayIntervalRef.current = window.setInterval(() => {
                if (placementReplayRef.current?.id !== replay.id) {
                  return;
                }

                enqueuePlacementReplayWave(replay);
              }, PLACEMENT_REPLAY_INTERVAL_MS);
            }, delayMs)
        );
      },
      [clearPlacementReplayTimers, enqueuePlacementReplayWave]
    );

    const playResetAnimation = useCallback(
      (moves: readonly Move[], origin?: ScreenPoint): number => {
        clearPlacementReplay();
        if (moves.length === 0) {
          return 0;
        }

        const canvas: HTMLCanvasElement | null = mainCanvasRef.current;
        if (canvas === null) {
          return 0;
        }

        const layout: CanvasLayout = layoutRef.current;
        const scene: SceneLayout = sceneLayoutRef.current;
        if (layout.size <= 0 || layout.cellSize <= 0) {
          return 0;
        }
        if (scene.width <= 0 || scene.height <= 0) {
          return 0;
        }

        const boardRect: BoardRectSnapshot = getBoardRectSnapshot(scene, layout);
        const shockOrigin: ScreenPoint =
          origin ?? getBoardCenterFromRect(boardRect);
        const now: number = performance.now();
        const radius: number = layout.cellSize * STONE_RADIUS_RATIO;
        const maxRadius: number =
          getMaxDistanceToBoardCorners(shockOrigin, boardRect) + RIPPLE_LAMBDA;

        bloomsRef.current = [];
        wavesRef.current = [];
        catSwatRemovalsRef.current = [];
        hiddenKeysRef.current.clear();
        resetPhysicsStonesRef.current = [];
        resetWaveCrestsRef.current = [];
        lastResetPhysicsTimestampRef.current = now;

        const setups: ResetStoneSetup[] = [];
        let maxRequiredImpulse = 0;
        for (const move of moves) {
          const boardPoint: ScreenPoint = getBoardPoint(move, layout);
          const point: ScreenPoint = boardPointToScenePoint(boardPoint, scene);
          const distance: number = Math.max(
            1,
            Math.hypot(point.x - shockOrigin.x, point.y - shockOrigin.y)
          );
          const normalX: number = (point.x - shockOrigin.x) / distance;
          const normalY: number = (point.y - shockOrigin.y) / distance;
          const distanceFactor: number = Math.exp(-distance / IMPULSE_DIST_DECAY);
          const rawImpulse: number = RESET_FORCE_BASE * distanceFactor;
          const exitSpeed: number = getExitSpeedForBoardPoint(
            boardPoint,
            normalX,
            normalY,
            layout.size,
            radius
          );
          const requiredImpulse: number = clampNumber(
            Math.max(rawImpulse, exitSpeed),
            RESET_MIN_EXIT_SPEED,
            RESET_MAX_EXIT_SPEED
          );
          maxRequiredImpulse = Math.max(maxRequiredImpulse, requiredImpulse);
          setups.push({
            move,
            point,
            normalX,
            normalY,
            requiredImpulse,
            nonZeroMomentumAt: now + RESET_ZERO_MOMENTUM_NUDGE_AFTER_MS
          });
        }

        const crestCount: number = getResetWaveCrestCount(
          maxRequiredImpulse,
          RESET_MAX_IMPULSE_PER_CREST
        );
        for (let crestIndex = 0; crestIndex < crestCount; crestIndex += 1) {
          resetWaveCrestsRef.current.push({
            id: createAnimationId("reset-wave-crest"),
            origin: shockOrigin,
            startedAt: now + crestIndex * RESET_WAVE_INTERVAL_MS,
            maxRadius
          });
        }

        for (const setup of setups) {
          const impulses: ResetImpulse[] = [];
          const impulsePerCrest: number = setup.requiredImpulse / crestCount;

          for (let crestIndex = 0; crestIndex < crestCount; crestIndex += 1) {
            const crestDelay: number = crestIndex * RESET_WAVE_INTERVAL_MS;
            impulses.push({
              crestStartedAt: now + crestDelay,
              origin: shockOrigin,
              magnitude: impulsePerCrest,
              maxRadius
            });
          }

          resetPhysicsStonesRef.current.push({
            id: createAnimationId("reset-stone"),
            player: setup.move.player,
            x: setup.point.x,
            y: setup.point.y,
            vx: 0,
            vy: 0,
            isOnBoard: true,
            exitNormalX: setup.normalX,
            exitNormalY: setup.normalY,
            nonZeroMomentumAt: setup.nonZeroMomentumAt,
            depth: 0,
            depthVelocity: 0,
            scale: 1,
            alpha: 1,
            impulses,
            radius,
            createdAt: now,
            noCollide: false,
            isActivated: false
          });
        }

        const fullAnimationDuration: number =
          (crestCount - 1) * RESET_WAVE_INTERVAL_MS +
          (maxRadius / RIPPLE_SPEED) * 1000 +
          RESET_LOCK_AFTER_LAST_IMPULSE_MS;
        return Math.min(fullAnimationDuration, RESET_INPUT_LOCK_MS);
      },
      [clearPlacementReplay, createAnimationId]
    );

    const playUndoAnimation = useCallback(
      (move: Move): void => {
        clearPlacementReplay();
        bloomsRef.current = [];
        wavesRef.current = [];

        const canvas: HTMLCanvasElement | null = mainCanvasRef.current;
        if (canvas === null) {
          return;
        }

        const layout: CanvasLayout = layoutRef.current;
        if (layout.size <= 0 || layout.cellSize <= 0) {
          return;
        }

        const scene: SceneLayout = sceneLayoutRef.current;
        if (scene.width <= 0 || scene.height <= 0) {
          return;
        }

        const start: ScreenPoint = getSceneBoardPoint(move, layout, scene);
        const radius: number = layout.cellSize * STONE_RADIUS_RATIO;
        hiddenKeysRef.current.add(positionKey(move));
        const bodyLength: number = CAT_BODY_CELLS * layout.cellSize;
        const corner: ScreenPoint = {
          x:
            move.col < BOARD_SIZE / 2
              ? scene.boardOffsetX - bodyLength * 0.4
              : scene.boardOffsetX + layout.size + bodyLength * 0.4,
          y:
            move.row < BOARD_SIZE / 2
              ? scene.boardOffsetY - bodyLength * 0.4
              : scene.boardOffsetY + layout.size + bodyLength * 0.4
        };
        const heading: number = Math.atan2(start.y - corner.y, start.x - corner.x);
        const directionX: number = Math.cos(heading);
        const directionY: number = Math.sin(heading);
        const reach: number = bodyLength * 0.52;
        const swat: ScreenPoint = {
          x: start.x - directionX * reach,
          y: start.y - directionY * reach
        };
        const runDistance: number = bodyLength * 1.5 + layout.cellSize * 3;

        catSwatRemovalsRef.current.push({
          id: createAnimationId("cat-swat"),
          player: move.player,
          stone: start,
          entry: {
            x: swat.x - directionX * runDistance,
            y: swat.y - directionY * runDistance
          },
          swat,
          exit: {
            x: swat.x + directionX * runDistance,
            y: swat.y + directionY * runDistance
          },
          heading,
          radius,
          bodyLength,
          startedAt: performance.now(),
          launched: false
        });
      },
      [clearPlacementReplay, createAnimationId]
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
      if (
        placement === null ||
        placement.replayOnly === true ||
        seenPlacementIdsRef.current.has(placement.id)
      ) {
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
        clearPlacementReplay();
        return;
      }

      const waveId = `shape-${placement.id}`;
      const highlights: readonly CanvasWaveHighlight[] =
        snapshotWaveHighlights(
          createWaveHighlights(effects.shapeHints),
          state.moves
        );

      if (highlights.length === 0) {
        clearPlacementReplay();
        return;
      }

      const replay: PlacementReplay = {
        id: `${waveId}-${state.moves.length}`,
        player: placement.player,
        highlights,
        moveKey: positionKey(placement.position),
        turn: placement.turn
      };

      if (
        placement.replayOnly !== true &&
        !seenWaveIdsRef.current.has(waveId)
      ) {
        seenWaveIdsRef.current.add(waveId);
        wavesRef.current.push({
          id: waveId,
          player: placement.player,
          highlights,
          startedAt: performance.now()
        });
      }

      if (effects.victory !== null) {
        clearPlacementReplay();
        return;
      }

      schedulePlacementReplay(replay);
    }, [
      clearPlacementReplay,
      effects.placement,
      effects.shapeHints,
      effects.victory,
      schedulePlacementReplay,
      state.moves
    ]);

    useEffect(() => {
      if (state.moves.length > 0) {
        return;
      }

      clearPlacementReplay();
      seenPlacementIdsRef.current.clear();
      seenWaveIdsRef.current.clear();
      hiddenKeysRef.current.clear();
    }, [clearPlacementReplay, state.moves.length]);

    useEffect(() => {
      if (victoryTimerRef.current !== null) {
        window.clearInterval(victoryTimerRef.current);
        victoryTimerRef.current = null;
      }

      if (effects.victory === null) {
        return;
      }

      clearPlacementReplay();
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
    }, [clearPlacementReplay, createAnimationId, effects.victory]);

    useEffect(() => {
      return () => {
        clearPlacementReplay();
      };
    }, [clearPlacementReplay]);

    useEffect(() => {
      const canvas: HTMLCanvasElement | null = mainCanvasRef.current;
      const boardSurface: HTMLDivElement | null = boardSurfaceRef.current;
      if (canvas === null || boardSurface === null) {
        return;
      }

      const resize = (): void => {
        resizeSceneCanvas(canvas, boardSurface, layoutRef, sceneLayoutRef);
      };

      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(boardSurface);
      window.addEventListener("resize", resize);

      let animationFrameId = 0;
      let previousTimestamp: number = performance.now();

      const drawFrame = (timestamp: number): void => {
        resize();
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
          resetWaveCrestsRef,
          catSwatRemovalsRef,
          lastResetPhysicsTimestampRef,
          hiddenKeysRef,
          sceneLayout: sceneLayoutRef.current,
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
        clearPlacementReplay();
      };
    }, [clearPlacementReplay]);

    const handlePointerDown = (
      event: PointerEvent<HTMLDivElement>
    ): void => {
      if (state.status !== "playing") {
        return;
      }

      const position: Position | null = getPositionFromClient(
        event.clientX,
        event.clientY,
        layoutRef.current,
        sceneLayoutRef.current
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
        layoutRef.current,
        sceneLayoutRef.current
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
        <div
          ref={boardSurfaceRef}
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
  resetWaveCrestsRef: WritableRef<ResetWaveCrest[]>;
  catSwatRemovalsRef: WritableRef<CatSwatRemoval[]>;
  lastResetPhysicsTimestampRef: WritableRef<number>;
  hiddenKeysRef: WritableRef<Set<string>>;
  sceneLayout: SceneLayout;
  timestamp: number;
  deltaMs: number;
};

function drawMainCanvas(input: DrawMainCanvasInput): void {
  const context: CanvasRenderingContext2D | null = input.canvas.getContext("2d");
  if (
    context === null ||
    input.layout.size <= 0 ||
    input.sceneLayout.width <= 0 ||
    input.sceneLayout.height <= 0
  ) {
    return;
  }

  const dpr: number = getDevicePixelRatio();
  const layout: CanvasLayout = input.layout;
  const sceneLayout: SceneLayout = input.sceneLayout;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, sceneLayout.width, sceneLayout.height);

  context.save();
  context.translate(sceneLayout.boardOffsetX, sceneLayout.boardOffsetY);
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
  context.restore();

  drawResetWaveCrests(context, input.resetWaveCrestsRef, input.timestamp);
  updateResetPhysicsStones(
    input.resetPhysicsStonesRef,
    input.lastResetPhysicsTimestampRef,
    input.layout,
    input.sceneLayout,
    input.timestamp,
    input.deltaMs
  );
  drawResetPhysicsStones(
    context,
    input.resetPhysicsStonesRef.current
  );
  drawCatSwatRemovals({
    context,
    catSwatRemovalsRef: input.catSwatRemovalsRef,
    resetPhysicsStonesRef: input.resetPhysicsStonesRef,
    timestamp: input.timestamp
  });
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

function drawResetWaveCrests(
  context: CanvasRenderingContext2D,
  crestsRef: WritableRef<ResetWaveCrest[]>,
  timestamp: number
): void {
  crestsRef.current = crestsRef.current.filter((crest: ResetWaveCrest) => {
    const seconds: number = (timestamp - crest.startedAt) / 1000;
    if (seconds < 0) {
      return true;
    }

    if (RIPPLE_SPEED * seconds > crest.maxRadius + RIPPLE_LAMBDA) {
      return false;
    }

    drawResetWaveCrest(context, crest, seconds);
    return true;
  });
}

function drawResetWaveCrest(
  context: CanvasRenderingContext2D,
  crest: ResetWaveCrest,
  seconds: number
): void {
  const { origin } = crest;

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

  const radius: number = RIPPLE_SPEED * seconds;
  if (radius <= 0.5) {
    return;
  }

  const distanceDecay: number = Math.exp(-radius / 460);
  const timeDecay: number = Math.max(0, 1 - seconds / 2.1);
  const alpha: number = distanceDecay * timeDecay;
  if (alpha < 0.015) {
    return;
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

type DrawCatSwatRemovalsInput = {
  context: CanvasRenderingContext2D;
  catSwatRemovalsRef: WritableRef<CatSwatRemoval[]>;
  resetPhysicsStonesRef: WritableRef<ResetPhysicsStone[]>;
  timestamp: number;
};

function drawCatSwatRemovals(input: DrawCatSwatRemovalsInput): void {
  const activeRemovals: CatSwatRemoval[] = [];

  for (const removal of input.catSwatRemovalsRef.current) {
    const age: number = input.timestamp - removal.startedAt;
    if (age >= CAT_TOTAL_MS) {
      continue;
    }

    drawCatSwatRemoval(input, removal, age);
    activeRemovals.push(removal);
  }

  input.catSwatRemovalsRef.current = activeRemovals;
}

function drawCatSwatRemoval(
  input: DrawCatSwatRemovalsInput,
  removal: CatSwatRemoval,
  age: number
): void {
  const runInEnd: number = CAT_RUN_IN_MS;
  const windupEnd: number = runInEnd + CAT_WINDUP_MS;
  const swatEnd: number = windupEnd + CAT_SWAT_MS;
  const recoverEnd: number = swatEnd + CAT_RECOVER_MS;
  let catPoint: ScreenPoint = removal.entry;
  let pawSwipe = 0;
  let shouldDrawStone = !removal.launched;

  if (age < runInEnd) {
    const progress: number = easeOutPower(age / CAT_RUN_IN_MS);
    catPoint = lerpPoint(removal.entry, removal.swat, progress);
  } else if (age < windupEnd) {
    catPoint = removal.swat;
    pawSwipe = -(age - runInEnd) / CAT_WINDUP_MS;
  } else if (age < swatEnd) {
    catPoint = removal.swat;
    pawSwipe = -1 + 2 * easeInPower((age - windupEnd) / CAT_SWAT_MS);
    if (!removal.launched) {
      removal.launched = true;
      shouldDrawStone = false;
      input.resetPhysicsStonesRef.current.push(
        createSwattedPhysicsStone(removal, input.timestamp)
      );
    }
  } else if (age < recoverEnd) {
    catPoint = removal.swat;
    pawSwipe = 1 - (age - swatEnd) / CAT_RECOVER_MS;
  } else {
    const progress: number = easeInPower((age - recoverEnd) / CAT_RUN_OUT_MS);
    catPoint = lerpPoint(removal.swat, removal.exit, progress);
  }

  if (shouldDrawStone) {
    drawStone(
      input.context,
      removal.stone.x,
      removal.stone.y,
      removal.radius,
      removal.player
    );
  }

  drawRunningCat(
    input.context,
    catPoint.x,
    catPoint.y,
    removal.bodyLength,
    removal.heading,
    age / CAT_RUN_CYCLE_MS,
    pawSwipe
  );
}

function createSwattedPhysicsStone(
  removal: CatSwatRemoval,
  timestamp: number
): ResetPhysicsStone {
  const exitNormalX: number = Math.cos(removal.heading);
  const exitNormalY: number = Math.sin(removal.heading);

  return {
    id: `${removal.id}-stone`,
    player: removal.player,
    x: removal.stone.x,
    y: removal.stone.y,
    vx: exitNormalX * CAT_SWAT_SPEED,
    vy: exitNormalY * CAT_SWAT_SPEED,
    isOnBoard: true,
    exitNormalX,
    exitNormalY,
    nonZeroMomentumAt: timestamp + RESET_ZERO_MOMENTUM_NUDGE_AFTER_MS,
    depth: 0,
    depthVelocity: 0,
    scale: 1,
    alpha: 1,
    impulses: [],
    radius: removal.radius,
    createdAt: timestamp,
    noCollide: true,
    isActivated: true
  };
}

function drawCatLeg(
  context: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  groundY: number,
  bodyLength: number,
  swing: number,
  lift: number,
  color: string,
  width: number
): void {
  const footX: number = hipX + swing * bodyLength * 0.11;
  const footY: number = groundY - Math.max(0, lift) * bodyLength * 0.07;
  const kneeX: number = (hipX + footX) / 2 + bodyLength * 0.015;
  const kneeY: number = (hipY + footY) / 2;

  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(hipX, hipY);
  context.quadraticCurveTo(kneeX, kneeY, footX, footY);
  context.stroke();
  context.fillStyle = color;
  context.beginPath();
  context.ellipse(
    footX + bodyLength * 0.012,
    footY,
    bodyLength * 0.028,
    bodyLength * 0.02,
    0,
    0,
    Math.PI * 2
  );
  context.fill();
}

function drawRunningCat(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  bodyLength: number,
  heading: number,
  legPhase: number,
  pawSwipe: number
): void {
  if (bodyLength <= 0) {
    return;
  }

  const phase: number = legPhase * Math.PI * 2;
  const isRunning = pawSwipe === 0;
  const groundY: number = bodyLength * 0.2;
  const bob: number = isRunning ? Math.sin(phase * 2) * bodyLength * 0.012 : 0;
  const hipBackX: number = -bodyLength * 0.18;
  const hipBackY: number = bodyLength * 0.02;
  const hipFrontX: number = bodyLength * 0.16;
  const hipFrontY: number = bodyLength * 0.03;
  const legWidth: number = bodyLength * 0.05;

  context.save();
  context.translate(x, y);
  context.rotate(heading);
  if (Math.cos(heading) < 0) {
    context.scale(1, -1);
  }
  context.translate(0, bob);

  context.fillStyle = "rgba(20,10,4,0.18)";
  context.beginPath();
  context.ellipse(0, groundY + bodyLength * 0.03, bodyLength * 0.34, bodyLength * 0.05, 0, 0, Math.PI * 2);
  context.fill();

  drawCatLeg(context, hipBackX, hipBackY, groundY, bodyLength, isRunning ? Math.sin(phase + Math.PI) : 0.3, isRunning ? Math.sin(phase + Math.PI) : 0, CAT_FUR_FAR, legWidth * 0.85);
  drawCatLeg(context, hipFrontX, hipFrontY, groundY, bodyLength, isRunning ? Math.sin(phase) : -0.3, isRunning ? Math.sin(phase) : 0, CAT_FUR_FAR, legWidth * 0.85);

  const tailSway: number = isRunning
    ? Math.sin(phase + 1) * bodyLength * 0.06
    : Math.sin(legPhase * 6) * bodyLength * 0.03;
  context.strokeStyle = CAT_FUR_DARK;
  context.lineWidth = bodyLength * 0.055;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(-bodyLength * 0.28, -bodyLength * 0.02);
  context.quadraticCurveTo(
    -bodyLength * 0.48,
    -bodyLength * 0.1 + tailSway,
    -bodyLength * 0.46,
    -bodyLength * 0.3 + tailSway
  );
  context.stroke();
  context.fillStyle = CAT_FUR_DARK;
  context.beginPath();
  context.ellipse(-bodyLength * 0.46, -bodyLength * 0.3 + tailSway, bodyLength * 0.035, bodyLength * 0.045, 0, 0, Math.PI * 2);
  context.fill();

  context.save();
  context.shadowColor = "rgba(0,0,0,0.25)";
  context.shadowBlur = bodyLength * 0.04;
  context.shadowOffsetY = bodyLength * 0.012;
  context.fillStyle = CAT_FUR;
  context.beginPath();
  context.ellipse(-bodyLength * 0.02, -bodyLength * 0.04, bodyLength * 0.3, bodyLength * 0.16, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.fillStyle = CAT_FUR_DARK;
  context.beginPath();
  context.ellipse(-bodyLength * 0.05, -bodyLength * 0.11, bodyLength * 0.26, bodyLength * 0.09, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = CAT_BELLY;
  context.beginPath();
  context.ellipse(0, bodyLength * 0.05, bodyLength * 0.22, bodyLength * 0.07, 0, 0, Math.PI * 2);
  context.fill();

  drawCatHead(context, bodyLength);
  drawCatLeg(context, hipBackX, hipBackY, groundY, bodyLength, isRunning ? Math.sin(phase) : 0.4, isRunning ? Math.sin(phase) : 0, CAT_FUR_DARK, legWidth);
  drawCatFrontLeg(context, hipFrontX, hipFrontY, groundY, bodyLength, phase, pawSwipe, isRunning, legWidth);
  context.restore();
}

function drawCatHead(context: CanvasRenderingContext2D, bodyLength: number): void {
  const headX: number = bodyLength * 0.3;
  const headY: number = -bodyLength * 0.12;
  const headRadius: number = bodyLength * 0.155;

  context.fillStyle = CAT_FUR_DARK;
  for (const earX of [-0.55, 0.45]) {
    context.beginPath();
    context.moveTo(headX + earX * headRadius, headY - headRadius * 0.6);
    context.lineTo(headX + earX * headRadius - headRadius * 0.18, headY - headRadius * 1.5);
    context.lineTo(headX + earX * headRadius + headRadius * 0.5, headY - headRadius * 0.85);
    context.closePath();
    context.fill();
    context.fillStyle = CAT_PINK;
    context.beginPath();
    context.moveTo(headX + earX * headRadius + headRadius * 0.02, headY - headRadius * 0.75);
    context.lineTo(headX + earX * headRadius - headRadius * 0.06, headY - headRadius * 1.18);
    context.lineTo(headX + earX * headRadius + headRadius * 0.26, headY - headRadius * 0.88);
    context.closePath();
    context.fill();
    context.fillStyle = CAT_FUR_DARK;
  }

  context.fillStyle = CAT_FUR;
  context.beginPath();
  context.ellipse(headX, headY, headRadius, headRadius * 0.92, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = CAT_BELLY;
  context.beginPath();
  context.ellipse(headX + headRadius * 0.45, headY + headRadius * 0.32, headRadius * 0.5, headRadius * 0.42, 0, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = "#241f1b";
  context.lineWidth = bodyLength * 0.012;
  context.lineCap = "round";
  context.beginPath();
  context.arc(headX + headRadius * 0.2, headY - headRadius * 0.05, headRadius * 0.22, Math.PI * 0.15, Math.PI * 0.85);
  context.stroke();

  context.fillStyle = CAT_PINK;
  context.beginPath();
  context.moveTo(headX + headRadius * 0.78, headY + headRadius * 0.2);
  context.lineTo(headX + headRadius * 0.62, headY + headRadius * 0.32);
  context.lineTo(headX + headRadius * 0.78, headY + headRadius * 0.4);
  context.closePath();
  context.fill();

  context.strokeStyle = "rgba(240,235,225,0.55)";
  context.lineWidth = bodyLength * 0.006;
  for (const whiskerOffset of [-0.05, 0.08]) {
    context.beginPath();
    context.moveTo(headX + headRadius * 0.65, headY + headRadius * (0.25 + whiskerOffset));
    context.lineTo(headX + headRadius * 1.5, headY + headRadius * (0.1 + whiskerOffset * 2));
    context.stroke();
  }
}

function drawCatFrontLeg(
  context: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  groundY: number,
  bodyLength: number,
  phase: number,
  pawSwipe: number,
  isRunning: boolean,
  legWidth: number
): void {
  if (pawSwipe === 0) {
    drawCatLeg(
      context,
      hipX,
      hipY,
      groundY,
      bodyLength,
      Math.sin(phase + Math.PI),
      isRunning ? Math.sin(phase + Math.PI) : 0,
      CAT_FUR_DARK,
      legWidth
    );
    return;
  }

  const reach: number = (pawSwipe + 1) / 2;
  const pawX: number = hipX + bodyLength * (0.05 + reach * 0.4);
  const pawY: number =
    hipY - bodyLength * (0.16 - reach * 0.2) * (1 - Math.abs(pawSwipe) * 0.3);

  context.strokeStyle = CAT_FUR_DARK;
  context.lineWidth = legWidth;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(hipX, hipY);
  context.quadraticCurveTo(hipX + bodyLength * 0.12, hipY - bodyLength * 0.1, pawX, pawY);
  context.stroke();
  context.fillStyle = CAT_FUR_DARK;
  context.beginPath();
  context.ellipse(pawX, pawY, bodyLength * 0.05, bodyLength * 0.045, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = CAT_PINK;
  context.beginPath();
  context.ellipse(pawX + bodyLength * 0.01, pawY + bodyLength * 0.01, bodyLength * 0.025, bodyLength * 0.022, 0, 0, Math.PI * 2);
  context.fill();
}

function updateResetPhysicsStones(
  stonesRef: WritableRef<ResetPhysicsStone[]>,
  lastTimestampRef: WritableRef<number>,
  layout: CanvasLayout,
  sceneLayout: SceneLayout,
  timestamp: number,
  deltaMs: number
): void {
  if (
    stonesRef.current.length === 0 ||
    layout.size <= 0 ||
    sceneLayout.width <= 0 ||
    sceneLayout.height <= 0
  ) {
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
  integrateResetPhysics(
    stonesRef.current,
    deltaSeconds,
    getSceneBoardOuterRect(sceneLayout, layout),
    timestamp
  );
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
      const elapsedMs: number = timestamp - impulse.crestStartedAt;
      if (elapsedMs < 0) {
        return true;
      }

      const waveRadius: number = RIPPLE_SPEED * (elapsedMs / 1000);
      const distance: number = Math.max(
        1,
        Math.hypot(stone.x - impulse.origin.x, stone.y - impulse.origin.y)
      );
      if (waveRadius < Math.max(0, distance - stone.radius)) {
        return waveRadius <= impulse.maxRadius + RIPPLE_LAMBDA;
      }

      stone.isActivated = true;
      stone.vx += ((stone.x - impulse.origin.x) / distance) * impulse.magnitude;
      stone.vy += ((stone.y - impulse.origin.y) / distance) * impulse.magnitude;
      return false;
    });
  }
}

function integrateResetPhysics(
  stones: readonly ResetPhysicsStone[],
  deltaSeconds: number,
  boardRect: BoardRectSnapshot,
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
      (stone.x < boardRect.left - stone.radius ||
        stone.x > boardRect.right + stone.radius ||
        stone.y < boardRect.top - stone.radius ||
        stone.y > boardRect.bottom + stone.radius)
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
  stone.isActivated = true;
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
    if (stoneA.noCollide) {
      continue;
    }

    for (let otherIndex = index + 1; otherIndex < onBoardStones.length; otherIndex += 1) {
      const stoneB: ResetPhysicsStone = onBoardStones[otherIndex];
      if (stoneB.noCollide) {
        continue;
      }

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
      stoneA.isActivated = true;
      stoneB.isActivated = true;
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

function drawResetPhysicsStones(
  context: CanvasRenderingContext2D,
  stones: readonly ResetPhysicsStone[]
): void {
  for (const stone of stones) {
    if (stone.alpha <= 0) {
      continue;
    }

    context.save();
    context.globalAlpha = stone.alpha;
    context.translate(stone.x, stone.y);
    context.scale(stone.scale, stone.scale);
    context.translate(-stone.x, -stone.y);
    drawStone(context, stone.x, stone.y, stone.radius, stone.player);
    context.restore();
  }
}

function resizeSceneCanvas(
  canvas: HTMLCanvasElement,
  boardSurface: HTMLElement,
  layoutRef: WritableRef<CanvasLayout>,
  sceneLayoutRef: WritableRef<SceneLayout>
): void {
  const rect: DOMRect = boardSurface.getBoundingClientRect();
  const size: number = Math.max(1, Math.min(rect.width, rect.height));
  const dpr: number = getDevicePixelRatio();
  const width: number = Math.max(1, window.innerWidth);
  const height: number = Math.max(1, window.innerHeight);
  const pixelWidth: number = Math.round(width * dpr);
  const pixelHeight: number = Math.round(height * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const padding: number = Math.round(size * 0.052);
  layoutRef.current = {
    size,
    padding,
    cellSize: (size - padding * 2) / BOARD_GRID_MAX
  };
  sceneLayoutRef.current = {
    width,
    height,
    boardOffsetX: rect.left,
    boardOffsetY: rect.top
  };
}

function getPositionFromClient(
  clientX: number,
  clientY: number,
  layout: CanvasLayout,
  sceneLayout: SceneLayout
): Position | null {
  if (layout.cellSize <= 0) {
    return null;
  }

  const x: number = clientX - sceneLayout.boardOffsetX;
  const y: number = clientY - sceneLayout.boardOffsetY;
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

function getSceneBoardPoint(
  position: Position,
  layout: CanvasLayout,
  sceneLayout: SceneLayout
): ScreenPoint {
  return boardPointToScenePoint(getBoardPoint(position, layout), sceneLayout);
}

function boardPointToScenePoint(
  point: ScreenPoint,
  sceneLayout: SceneLayout
): ScreenPoint {
  return {
    x: sceneLayout.boardOffsetX + point.x,
    y: sceneLayout.boardOffsetY + point.y
  };
}

function getBoardRectSnapshot(
  sceneLayout: SceneLayout,
  layout: CanvasLayout
): BoardRectSnapshot {
  return {
    left: sceneLayout.boardOffsetX + layout.padding,
    top: sceneLayout.boardOffsetY + layout.padding,
    right:
      sceneLayout.boardOffsetX +
      layout.padding +
      BOARD_GRID_MAX * layout.cellSize,
    bottom:
      sceneLayout.boardOffsetY +
      layout.padding +
      BOARD_GRID_MAX * layout.cellSize
  };
}

function getSceneBoardOuterRect(
  sceneLayout: SceneLayout,
  layout: CanvasLayout
): BoardRectSnapshot {
  return {
    left: sceneLayout.boardOffsetX,
    top: sceneLayout.boardOffsetY,
    right: sceneLayout.boardOffsetX + layout.size,
    bottom: sceneLayout.boardOffsetY + layout.size
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

function filterReplayHighlights(
  highlights: readonly CanvasWaveHighlight[],
  moves: readonly Move[]
): readonly CanvasWaveHighlight[] {
  const turnByPosition = new Map<string, number>(
    moves.map((move: Move) => [positionKey(move), move.turn])
  );

  return highlights.filter((highlight: CanvasWaveHighlight) => {
    const turn: number | undefined = turnByPosition.get(
      positionKey(highlight.position)
    );
    return turn === highlight.turn;
  });
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

function easeOutPower(value: number): number {
  const clamped: number = Math.min(1, Math.max(0, value));
  return 1 - Math.pow(1 - clamped, 2.2);
}

function easeInPower(value: number): number {
  const clamped: number = Math.min(1, Math.max(0, value));
  return Math.pow(clamped, 2.2);
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
