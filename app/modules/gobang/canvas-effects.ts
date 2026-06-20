import { positionKey } from "@/modules/gobang/board-geometry";
import {
  type Player,
  type Position,
  type ShapeHint,
  type WaveHighlight,
  type WinLine
} from "@/modules/gobang/types";

export const BLOOM_DURATION_MS = 580;
export const WAVE_STONE_DURATION_MS = 360;
export const WAVE_STAGGER_MS = 125;
export const VICTORY_LOOP_MS = 2200;

export type CanvasLayout = {
  size: number;
  cellSize: number;
  padding: number;
};

export type InkPoint = {
  angle: number;
  radius: number;
  speed: number;
  size: number;
};

export type WaveAnimation = {
  id: string;
  player: Player;
  highlights: readonly WaveHighlight[];
  startedAt: number;
};

export function createWaveHighlights(
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
        delayMs: steps * WAVE_STAGGER_MS
      });
    }
  }

  return [...highlights.values()];
}

export function createVictoryWaveHighlights(
  victory: WinLine | null,
  shapeHints: readonly ShapeHint[],
  anchorOverride?: Position
): readonly WaveHighlight[] {
  if (victory === null) {
    return [];
  }

  const anchor: Position = anchorOverride ?? getVictoryAnchor(victory, shapeHints);
  const positions: readonly Position[] = getVictoryWindow(
    victory.positions,
    anchor
  );

  return positions.map((position: Position) => {
    const steps: number = getGridSteps(anchor, position);

    return {
      player: victory.player,
      position,
      steps,
      delayMs: steps * WAVE_STAGGER_MS
    };
  });
}

export function getVictoryWindow(
  positions: readonly Position[],
  anchor: Position
): readonly Position[] {
  if (positions.length <= 5) {
    return positions;
  }

  const anchorIndex: number = positions.findIndex(
    (position: Position) =>
      position.row === anchor.row && position.col === anchor.col
  );
  const originIndex: number = Math.max(0, anchorIndex);
  const startIndex: number = Math.max(
    0,
    Math.min(originIndex - 2, positions.length - 5)
  );

  return positions.slice(startIndex, startIndex + 5);
}

export function getVictoryAnchor(
  victory: WinLine,
  shapeHints: readonly ShapeHint[]
): Position {
  const victoryKeys = new Set<string>(
    victory.positions.map((position: Position) => positionKey(position))
  );
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

export function getGridSteps(anchor: Position, position: Position): number {
  return Math.max(
    Math.abs(anchor.row - position.row),
    Math.abs(anchor.col - position.col)
  );
}

export function getWaveScale(
  wave: WaveAnimation,
  position: Position,
  now: number
): number {
  const highlight: WaveHighlight | undefined = wave.highlights.find(
    (item: WaveHighlight) =>
      item.position.row === position.row && item.position.col === position.col
  );

  if (highlight === undefined) {
    return 1;
  }

  return getWaveScaleFromDelay(wave.startedAt, highlight.delayMs, now);
}

export function getWaveScaleFromDelay(
  startedAt: number,
  delayMs: number,
  now: number
): number {
  const elapsed: number = now - startedAt - delayMs;

  if (elapsed <= 0 || elapsed >= WAVE_STONE_DURATION_MS) {
    return 1;
  }

  return 1 + 0.165 * Math.sin((elapsed / WAVE_STONE_DURATION_MS) * Math.PI);
}

export function getWaveAnimationDuration(
  highlights: readonly WaveHighlight[]
): number {
  return highlights.reduce(
    (duration: number, highlight: WaveHighlight) =>
      Math.max(duration, highlight.delayMs + WAVE_STONE_DURATION_MS + 80),
    0
  );
}

export function createInkPoints(
  player: Player,
  seed: number
): readonly InkPoint[] {
  if (player === "white") {
    return [];
  }

  return Array.from({ length: 9 }, (_, index: number) => ({
    angle: seededRandom(seed, index * 4) * Math.PI * 2,
    radius: 0.82 + seededRandom(seed, index * 4 + 1) * 0.36,
    speed: 1.25 + seededRandom(seed, index * 4 + 2) * 1.7,
    size: 0.85 + seededRandom(seed, index * 4 + 3) * 1.3
  }));
}

function seededRandom(seed: number, offset: number): number {
  return hash32(seed * 1009 + offset) / 0xffffffff;
}

function hash32(value: number): number {
  let result: number = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  return (result ^ (result >>> 16)) >>> 0;
}
