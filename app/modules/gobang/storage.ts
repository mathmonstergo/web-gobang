import { createStateFromMoves } from "@/modules/gobang/game-logic";
import {
  BOARD_SIZE,
  type GameState,
  type Move,
  type Player
} from "@/modules/gobang/types";

const STORAGE_KEY = "web-gobang-state-v1";

type StoredGame = {
  version: 1;
  moves: readonly Move[];
  savedAt: number;
};

export function loadStoredGameState(): GameState | null {
  const rawValue: string | null = window.localStorage.getItem(STORAGE_KEY);

  if (rawValue === null) {
    return null;
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    if (!isStoredGame(parsedValue)) {
      return null;
    }

    return createStateFromMoves(parsedValue.moves);
  } catch (error: unknown) {
    console.error("gobang_storage_load_failed", { error });
    return null;
  }
}

export function saveGameState(state: GameState): void {
  const storedGame: StoredGame = {
    version: 1,
    moves: state.moves,
    savedAt: Date.now()
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedGame));
}

export function clearStoredGameState(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

function isStoredGame(value: unknown): value is StoredGame {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate: Record<string, unknown> = value as Record<string, unknown>;

  if (
    !("version" in candidate) ||
    !("moves" in candidate) ||
    !("savedAt" in candidate)
  ) {
    return false;
  }

  return (
    candidate.version === 1 &&
    typeof candidate.savedAt === "number" &&
    Array.isArray(candidate.moves) &&
    candidate.moves.every(isMove)
  );
}

function isMove(value: unknown): value is Move {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate: Record<string, unknown> = value as Record<string, unknown>;

  if (
    !("row" in candidate) ||
    !("col" in candidate) ||
    !("turn" in candidate) ||
    !("player" in candidate)
  ) {
    return false;
  }

  return (
    Number.isInteger(candidate.row) &&
    Number.isInteger(candidate.col) &&
    Number.isInteger(candidate.turn) &&
    typeof candidate.row === "number" &&
    typeof candidate.col === "number" &&
    typeof candidate.turn === "number" &&
    candidate.row >= 0 &&
    candidate.row < BOARD_SIZE &&
    candidate.col >= 0 &&
    candidate.col < BOARD_SIZE &&
    candidate.turn >= 1 &&
    isPlayer(candidate.player)
  );
}

function isPlayer(value: unknown): value is Player {
  return value === "black" || value === "white";
}
