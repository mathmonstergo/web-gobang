import {
  createInitialState,
  placeStone,
  undoMove
} from "@shared/gobang/game-logic";
import { type Player, type Position } from "@shared/gobang/types";

import {
  type JoinRoomInput,
  type JoinRoomResult,
  type OnlineErrorCode,
  type OnlinePlayer,
  type OnlinePlayerClock,
  type OnlinePlayerColor,
  type OnlineRoomClientState,
  type OnlineRoomMutationResult,
  type OnlineRoomState,
  type PlayerHeartbeatState,
  type RoomJoinability
} from "./protocol";

const RECONNECT_WINDOW_MS = 5 * 60 * 1000;
const PRE_PLAY_ROOM_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10 * 1000;
const MOVE_CLOCK_MS = 45 * 1000;
const GAME_CLOCK_MS = 10 * 60 * 1000;
const PLAYER_COLORS: readonly OnlinePlayerColor[] = ["black", "white"];

type PersistedOnlineRoomState = Omit<
  OnlineRoomState,
  "createdAt" | "hasEnteredPlaying" | "clocks"
> &
  Partial<Pick<OnlineRoomState, "createdAt" | "hasEnteredPlaying" | "clocks">>;

export function createInitialRoomState(
  roomCode: string,
  now: number
): OnlineRoomState {
  return {
    roomCode,
    isCreated: false,
    players: {},
    heartbeats: {},
    game: createInitialState(),
    phase: "waiting",
    endReason: null,
    pendingRequest: null,
    clocks: {},
    gameNumber: 1,
    createdAt: now,
    hasEnteredPlaying: false,
    startedAt: null,
    turnStartedAt: null,
    turnPausedAt: null,
    turnPausedDurationMs: 0,
    lastActivityAt: now
  };
}

export function markRoomCreated(
  state: OnlineRoomState,
  now: number
): OnlineRoomState {
  return {
    ...state,
    isCreated: true,
    createdAt: now,
    hasEnteredPlaying: false,
    lastActivityAt: now
  };
}

export function joinRoom(
  state: OnlineRoomState,
  input: JoinRoomInput,
  now: number
): JoinRoomResult {
  if (!state.isCreated) {
    return { success: false, error: "room-not-created", state };
  }

  const currentColor = findPlayerColor(state, input.playerId);
  if (currentColor !== null) {
    const player = state.players[currentColor];
    if (
      player?.sessionTokenHash === input.sessionTokenHash
    ) {
      const nextPlayer = toConnectedPlayer(player, input);
      const nextState = applyPlayers(
        state,
        { [currentColor]: nextPlayer },
        now
      );
      return { success: true, state: nextState, player: nextPlayer };
    }
  }

  const reusableColor = findReusableDisconnectedColor(
    state,
    input.sessionTokenHash,
    now
  );
  if (reusableColor !== null) {
    const player = state.players[reusableColor];
    if (player !== undefined) {
      const nextPlayer = toConnectedPlayer(player, input);
      const nextState = applyPlayers(
        state,
        { [reusableColor]: nextPlayer },
        now
      );
      return { success: true, state: nextState, player: nextPlayer };
    }
  }

  const openColor = findOpenColor(state, now);
  if (openColor === null) {
    return { success: false, error: "room-full", state };
  }

  const player: OnlinePlayer = {
    ...input,
    color: openColor,
    isConnected: true,
    isHeartbeatHealthy: true,
    disconnectedAt: null
  };
  const nextState = applyPlayers(state, { [openColor]: player }, now);

  return { success: true, state: nextState, player };
}

export function disconnectPlayer(
  state: OnlineRoomState,
  playerId: string,
  now: number
): OnlineRoomState {
  const color = findPlayerColor(state, playerId);
  if (color === null) {
    return state;
  }

  const player = state.players[color];
  if (player === undefined) {
    return state;
  }

  const nextPlayer: OnlinePlayer = {
    ...player,
    isConnected: false,
    isHeartbeatHealthy: false,
    disconnectedAt: now
  };
  return {
    ...state,
    players: {
      ...state.players,
      [color]: nextPlayer
    },
    lastActivityAt: now
  };
}

export function expireDisconnectedSlots(
  state: OnlineRoomState,
  now: number
): OnlineRoomState {
  const players: Partial<Record<Player, OnlinePlayer>> = {};
  let hasExpiredPlayer = false;

  for (const color of PLAYER_COLORS) {
    const player = state.players[color];
    if (player === undefined) {
      continue;
    }

    if (
      player.disconnectedAt !== null &&
      now - player.disconnectedAt > RECONNECT_WINDOW_MS
    ) {
      hasExpiredPlayer = true;
      continue;
    }

    players[color] = player;
  }

  if (!hasExpiredPlayer) {
    return state;
  }

  return {
    ...state,
    players,
    phase: getPhaseForPlayers(players, state.phase),
    lastActivityAt: now
  };
}

export function cleanupRoomStateForAccess(
  state: OnlineRoomState,
  now: number
): OnlineRoomState {
  const normalizedState = normalizeRoomState(state);
  const stateWithoutExpiredSlots = expireDisconnectedSlots(normalizedState, now);

  if (
    stateWithoutExpiredSlots.isCreated &&
    !stateWithoutExpiredSlots.hasEnteredPlaying &&
    now - stateWithoutExpiredSlots.createdAt > PRE_PLAY_ROOM_TTL_MS
  ) {
    return createInitialRoomState(stateWithoutExpiredSlots.roomCode, now);
  }

  return stateWithoutExpiredSlots;
}

export function normalizeRoomState(
  state: PersistedOnlineRoomState
): OnlineRoomState {
  if (
    typeof state.createdAt === "number" &&
    typeof state.hasEnteredPlaying === "boolean" &&
    state.clocks !== undefined
  ) {
    return state as OnlineRoomState;
  }

  const hasStarted = state.startedAt !== null || state.phase === "playing" || state.phase === "ended";

  return {
    ...state,
    createdAt:
      typeof state.createdAt === "number"
        ? state.createdAt
        : state.lastActivityAt,
    hasEnteredPlaying:
      typeof state.hasEnteredPlaying === "boolean"
        ? state.hasEnteredPlaying
        : hasStarted,
    clocks: state.clocks ?? {}
  };
}

export function getRoomJoinability(state: OnlineRoomState): RoomJoinability {
  if (!state.isCreated) {
    return { exists: false, joinable: false, reason: "not-found" };
  }

  if (state.players.black !== undefined && state.players.white !== undefined) {
    return { exists: true, joinable: false, reason: "room-full" };
  }

  return { exists: true, joinable: true, reason: "joinable" };
}

export function placeOnlineStone(
  state: OnlineRoomState,
  playerId: string,
  position: Position,
  now: number
): OnlineRoomMutationResult {
  const activeState = normalizeActiveTimeout(state, now);
  if (activeState.phase !== "playing") {
    if (state.phase === "playing" && activeState.phase === "ended") {
      return { success: true, state: activeState };
    }
    return failure(activeState, "not-playing");
  }

  const color = findPlayerColor(activeState, playerId);
  if (color === null) {
    return failure(activeState, "invalid-player");
  }

  if (color !== activeState.game.currentPlayer) {
    return failure(activeState, "not-your-turn");
  }

  const clockedState = commitActiveClock(activeState, now);
  const moveResult = placeStone(clockedState.game, position);
  if (moveResult.success === false) {
    return failure(clockedState, "illegal-move");
  }

  return {
    success: true,
    state: {
      ...clockedState,
      game: moveResult.state,
      phase: moveResult.state.status === "won" ? "ended" : "playing",
      endReason:
        moveResult.state.winner === null
          ? null
          : { type: "win", winner: moveResult.state.winner.player },
      pendingRequest: null,
      turnStartedAt: now,
      turnPausedAt: null,
      turnPausedDurationMs: 0,
      lastActivityAt: now
    }
  };
}

export function requestUndo(
  state: OnlineRoomState,
  playerId: string,
  now: number
): OnlineRoomMutationResult {
  const activeState = normalizeActiveTimeout(state, now);
  if (activeState.phase !== "playing") {
    if (state.phase === "playing" && activeState.phase === "ended") {
      return { success: true, state: activeState };
    }
    return failure(activeState, "not-playing");
  }

  const color = findPlayerColor(activeState, playerId);
  const latestMove = activeState.game.moves.at(-1);
  if (color === null || latestMove?.player !== color) {
    return failure(activeState, "request-not-allowed");
  }

  if (activeState.pendingRequest !== null) {
    return failure(activeState, "request-not-allowed");
  }

  return {
    success: true,
    state: {
      ...activeState,
      pendingRequest: {
        type: "undo",
        requestId: createRequestId("undo", activeState.gameNumber, now),
        requestedBy: color,
        targetMoveTurn: latestMove.turn,
        expiresAt: now + REQUEST_TIMEOUT_MS
      },
      lastActivityAt: now
    }
  };
}

export function respondUndo(
  state: OnlineRoomState,
  playerId: string,
  requestId: string,
  accept: boolean,
  now: number
): OnlineRoomMutationResult {
  const activeState = normalizeActiveTimeout(state, now);
  if (state.phase === "playing" && activeState.phase === "ended") {
    return { success: true, state: activeState };
  }

  const request = activeState.pendingRequest;
  if (request?.type !== "undo" || request.requestId !== requestId) {
    return failure(activeState, "request-not-found");
  }

  const color = findPlayerColor(activeState, playerId);
  if (color === null || color === request.requestedBy) {
    return failure(activeState, "request-not-allowed");
  }

  if (now > request.expiresAt) {
    return {
      success: false,
      error: "request-expired",
      state: { ...activeState, pendingRequest: null, lastActivityAt: now }
    };
  }

  if (!accept) {
    return {
      success: true,
      state: { ...activeState, pendingRequest: null, lastActivityAt: now }
    };
  }

  const latestMove = activeState.game.moves.at(-1);
  if (latestMove?.turn !== request.targetMoveTurn) {
    return failure(activeState, "request-stale");
  }
  const clockedState = commitActiveClock(activeState, now);

  return {
    success: true,
    state: {
      ...clockedState,
      game: undoMove(clockedState.game),
      pendingRequest: null,
      turnStartedAt: now,
      turnPausedAt: null,
      turnPausedDurationMs: 0,
      lastActivityAt: now
    }
  };
}

export function requestSurrender(
  state: OnlineRoomState,
  playerId: string,
  now: number
): OnlineRoomMutationResult {
  const activeState = normalizeActiveTimeout(state, now);
  if (activeState.phase !== "playing") {
    if (state.phase === "playing" && activeState.phase === "ended") {
      return { success: true, state: activeState };
    }
    return failure(activeState, "not-playing");
  }

  const color = findPlayerColor(activeState, playerId);
  if (color === null || activeState.pendingRequest !== null) {
    return failure(activeState, "request-not-allowed");
  }

  return {
    success: true,
    state: {
      ...activeState,
      pendingRequest: {
        type: "surrender",
        requestId: createRequestId("surrender", activeState.gameNumber, now),
        requestedBy: color,
        expiresAt: now + REQUEST_TIMEOUT_MS
      },
      lastActivityAt: now
    }
  };
}

export function respondSurrender(
  state: OnlineRoomState,
  playerId: string,
  requestId: string,
  accept: boolean,
  now: number
): OnlineRoomMutationResult {
  const activeState = normalizeActiveTimeout(state, now);
  if (state.phase === "playing" && activeState.phase === "ended") {
    return { success: true, state: activeState };
  }

  const request = activeState.pendingRequest;
  if (
    request?.type !== "surrender" ||
    request.requestId !== requestId
  ) {
    return failure(activeState, "request-not-found");
  }

  const color = findPlayerColor(activeState, playerId);
  if (color === null || color === request.requestedBy) {
    return failure(activeState, "request-not-allowed");
  }

  if (now > request.expiresAt) {
    return {
      success: false,
      error: "request-expired",
      state: { ...activeState, pendingRequest: null, lastActivityAt: now }
    };
  }

  if (!accept) {
    return {
      success: true,
      state: { ...activeState, pendingRequest: null, lastActivityAt: now }
    };
  }

  return {
    success: true,
    state: createNextStabilizingGame(activeState, now)
  };
}

export function receiveHeartbeat(
  state: OnlineRoomState,
  playerId: string,
  gameNumber: number,
  now: number
): OnlineRoomMutationResult {
  const color = findPlayerColor(state, playerId);
  if (color === null || gameNumber !== state.gameNumber) {
    return failure(state, "invalid-player");
  }

  const previousHeartbeat = state.heartbeats[color];
  const nextHeartbeat: PlayerHeartbeatState = {
    generation: gameNumber,
    validCount:
      previousHeartbeat?.generation === gameNumber
        ? previousHeartbeat.validCount + 1
        : 1,
    lastHeartbeatAt: now
  };
  const player = state.players[color];
  const players =
    player === undefined
      ? state.players
      : {
          ...state.players,
          [color]: {
            ...player,
            isHeartbeatHealthy: true
          }
        };
  const updatedState: OnlineRoomState = {
    ...state,
    players,
    heartbeats: {
      ...state.heartbeats,
      [color]: nextHeartbeat
    },
    lastActivityAt: now
  };
  const nextState = normalizeActiveTimeout(updatedState, now);

  return { success: true, state: nextState };
}

export function startGame(
  state: OnlineRoomState,
  playerId: string,
  now: number,
  randomValue: number
): OnlineRoomMutationResult {
  const activeState = normalizeActiveTimeout(state, now);
  if (findPlayerColor(activeState, playerId) === null) {
    return failure(activeState, "invalid-player");
  }

  if (!canStartGame(activeState)) {
    return failure(activeState, "request-not-allowed");
  }

  return {
    success: true,
    state: createStartedGame(activeState, now, randomValue)
  };
}

export function toClientState(
  state: OnlineRoomState,
  viewerPlayerId: string,
  serverNow: number
): OnlineRoomClientState {
  return {
    roomCode: state.roomCode,
    players: state.players,
    game: state.game,
    phase: state.phase,
    endReason: state.endReason,
    pendingRequest: state.pendingRequest,
    clocks: getClientClocks(state, serverNow),
    gameNumber: state.gameNumber,
    startedAt: state.startedAt,
    turnStartedAt: state.turnStartedAt,
    turnPausedAt: state.turnPausedAt,
    turnPausedDurationMs: state.turnPausedDurationMs,
    serverNow,
    viewerColor: findPlayerColor(state, viewerPlayerId),
    canStart: canStartGame(state)
  };
}

function applyPlayers(
  state: OnlineRoomState,
  playersPatch: Partial<Record<OnlinePlayerColor, OnlinePlayer>>,
  now: number
): OnlineRoomState {
  const players = {
    ...state.players,
    ...playersPatch
  };

  return {
    ...state,
    players,
    phase: getPhaseForPlayers(players, state.phase),
    lastActivityAt: now
  };
}

function getPhaseForPlayers(
  players: Partial<Record<OnlinePlayerColor, OnlinePlayer>>,
  currentPhase: OnlineRoomState["phase"]
): OnlineRoomState["phase"] {
  if (currentPhase === "playing" || currentPhase === "ended") {
    return currentPhase;
  }

  return players.black !== undefined && players.white !== undefined
    ? "stabilizing"
    : "waiting";
}

function toConnectedPlayer(
  player: OnlinePlayer,
  input: JoinRoomInput
): OnlinePlayer {
  return {
    ...player,
    playerId: input.playerId,
    sessionTokenHash: input.sessionTokenHash,
    nickname: input.nickname,
    avatarInitial: input.avatarInitial,
    avatarColor: input.avatarColor,
    isConnected: true,
    isHeartbeatHealthy: true,
    disconnectedAt: null
  };
}

function findPlayerColor(
  state: OnlineRoomState,
  playerId: string
): OnlinePlayerColor | null {
  for (const color of PLAYER_COLORS) {
    if (state.players[color]?.playerId === playerId) {
      return color;
    }
  }

  return null;
}

function findReusableDisconnectedColor(
  state: OnlineRoomState,
  sessionTokenHash: string,
  now: number
): OnlinePlayerColor | null {
  for (const color of PLAYER_COLORS) {
    const player = state.players[color];
    if (
      player?.sessionTokenHash === sessionTokenHash &&
      player.disconnectedAt !== null &&
      now - player.disconnectedAt <= RECONNECT_WINDOW_MS
    ) {
      return color;
    }
  }

  return null;
}

function findOpenColor(
  state: OnlineRoomState,
  now: number
): OnlinePlayerColor | null {
  for (const color of PLAYER_COLORS) {
    const player = state.players[color];
    if (player === undefined) {
      return color;
    }

    if (
      player.disconnectedAt !== null &&
      now - player.disconnectedAt > RECONNECT_WINDOW_MS
    ) {
      return color;
    }
  }

  return null;
}

function areBothPlayersConnected(
  players: Partial<Record<OnlinePlayerColor, OnlinePlayer>>
): boolean {
  return players.black?.isConnected === true && players.white?.isConnected === true;
}

function hasStableHeartbeats(state: OnlineRoomState): boolean {
  return (
    state.heartbeats.black?.generation === state.gameNumber &&
    state.heartbeats.black.validCount >= 3 &&
    state.heartbeats.white?.generation === state.gameNumber &&
    state.heartbeats.white.validCount >= 3
  );
}

export function canStartGame(state: OnlineRoomState): boolean {
  return (
    (state.phase === "stabilizing" || state.phase === "ended") &&
    areBothPlayersConnected(state.players) &&
    hasStableHeartbeats(state)
  );
}

function createStartedGame(
  state: OnlineRoomState,
  now: number,
  randomValue: number
): OnlineRoomState {
  const blackPlayer = state.players.black;
  const whitePlayer = state.players.white;
  if (blackPlayer === undefined || whitePlayer === undefined) {
    return state;
  }

  const shouldSwap = randomValue >= 0.5;
  const nextBlack = shouldSwap ? whitePlayer : blackPlayer;
  const nextWhite = shouldSwap ? blackPlayer : whitePlayer;
  const nextGameNumber =
    state.phase === "ended" ? state.gameNumber + 1 : state.gameNumber;

  return {
    ...state,
    players: {
      black: { ...nextBlack, color: "black" },
      white: { ...nextWhite, color: "white" }
    },
    game: createInitialState(),
    phase: "playing",
    endReason: null,
    pendingRequest: null,
    clocks: createInitialClocks(),
    gameNumber: nextGameNumber,
    heartbeats: state.phase === "ended" ? {} : state.heartbeats,
    hasEnteredPlaying: true,
    startedAt: now,
    turnStartedAt: now,
    turnPausedAt: null,
    turnPausedDurationMs: 0,
    lastActivityAt: now
  };
}

function createNextStabilizingGame(
  state: OnlineRoomState,
  now: number
): OnlineRoomState {
  return {
    ...state,
    game: createInitialState(),
    phase: areBothPlayersConnected(state.players) ? "stabilizing" : "waiting",
    endReason: null,
    pendingRequest: null,
    clocks: {},
    gameNumber: state.gameNumber + 1,
    heartbeats: {},
    startedAt: null,
    turnStartedAt: null,
    turnPausedAt: null,
    turnPausedDurationMs: 0,
    lastActivityAt: now
  };
}

function normalizeActiveTimeout(
  state: OnlineRoomState,
  now: number
): OnlineRoomState {
  if (state.phase !== "playing" || state.turnStartedAt === null) {
    return state;
  }

  const currentPlayer = state.game.currentPlayer;
  const clocks = getRequiredClocks(state);
  const currentClock = clocks[currentPlayer];
  const elapsedMs = getActiveTurnElapsedMs(state, now);
  const stepRemainingMs = currentClock.stepRemainingMs - elapsedMs;
  const gameRemainingMs = currentClock.gameRemainingMs - elapsedMs;

  if (stepRemainingMs > 0 && gameRemainingMs > 0) {
    return state;
  }

  const clock = stepRemainingMs <= 0 ? "step" : "game";
  const timedOutBy = currentPlayer;
  const winner = getOpponentColor(timedOutBy);

  return {
    ...state,
    phase: "ended",
    endReason: {
      type: "timeout",
      winner,
      timedOutBy,
      clock
    },
    pendingRequest: null,
    clocks: {
      ...clocks,
      [currentPlayer]: {
        stepRemainingMs: Math.max(0, stepRemainingMs),
        gameRemainingMs: Math.max(0, gameRemainingMs)
      }
    },
    turnStartedAt: now,
    turnPausedAt: null,
    turnPausedDurationMs: 0,
    lastActivityAt: now
  };
}

function commitActiveClock(
  state: OnlineRoomState,
  now: number
): OnlineRoomState {
  if (state.phase !== "playing" || state.turnStartedAt === null) {
    return state;
  }

  const currentPlayer = state.game.currentPlayer;
  const clocks = getRequiredClocks(state);
  const currentClock = clocks[currentPlayer];
  const elapsedMs = getActiveTurnElapsedMs(state, now);

  return {
    ...state,
    clocks: {
      ...clocks,
      [currentPlayer]: {
        stepRemainingMs: MOVE_CLOCK_MS,
        gameRemainingMs: Math.max(0, currentClock.gameRemainingMs - elapsedMs)
      }
    }
  };
}

function getClientClocks(
  state: OnlineRoomState,
  serverNow: number
): Partial<Record<OnlinePlayerColor, OnlinePlayerClock>> {
  if (state.phase !== "playing" || state.turnStartedAt === null) {
    return state.clocks;
  }

  const currentPlayer = state.game.currentPlayer;
  const clocks = getRequiredClocks(state);
  const currentClock = clocks[currentPlayer];
  const elapsedMs = getActiveTurnElapsedMs(state, serverNow);

  return {
    ...clocks,
    [currentPlayer]: {
      stepRemainingMs: Math.max(0, currentClock.stepRemainingMs - elapsedMs),
      gameRemainingMs: Math.max(0, currentClock.gameRemainingMs - elapsedMs)
    }
  };
}

function getRequiredClocks(
  state: OnlineRoomState
): Record<OnlinePlayerColor, OnlinePlayerClock> {
  return {
    black: state.clocks.black ?? createInitialClock(),
    white: state.clocks.white ?? createInitialClock()
  };
}

function createInitialClocks(): Record<OnlinePlayerColor, OnlinePlayerClock> {
  return {
    black: createInitialClock(),
    white: createInitialClock()
  };
}

function createInitialClock(): OnlinePlayerClock {
  return {
    stepRemainingMs: MOVE_CLOCK_MS,
    gameRemainingMs: GAME_CLOCK_MS
  };
}

function getActiveTurnElapsedMs(
  state: OnlineRoomState,
  now: number
): number {
  if (state.turnStartedAt === null) {
    return 0;
  }

  return Math.max(0, now - state.turnStartedAt);
}

function getOpponentColor(color: OnlinePlayerColor): OnlinePlayerColor {
  return color === "black" ? "white" : "black";
}

function createRequestId(
  type: "undo" | "surrender",
  gameNumber: number,
  now: number
): string {
  return `${type}-${gameNumber}-${now}`;
}

function failure(
  state: OnlineRoomState,
  error: OnlineErrorCode
): OnlineRoomMutationResult {
  return { success: false, error, state };
}
