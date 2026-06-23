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
const PLAYER_COLORS: readonly OnlinePlayerColor[] = ["black", "white"];

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
      return { success: true, state: resumeTurnIfReady(nextState, now), player: nextPlayer };
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
      return { success: true, state: resumeTurnIfReady(nextState, now), player: nextPlayer };
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
  const shouldPauseTurn = state.phase === "playing" && state.turnPausedAt === null;

  return {
    ...state,
    players: {
      ...state.players,
      [color]: nextPlayer
    },
    turnPausedAt: shouldPauseTurn ? now : state.turnPausedAt,
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

export function normalizeRoomState(state: OnlineRoomState): OnlineRoomState {
  const persistedState = state as OnlineRoomState &
    Partial<Pick<OnlineRoomState, "createdAt" | "hasEnteredPlaying">>;
  if (
    typeof persistedState.createdAt === "number" &&
    typeof persistedState.hasEnteredPlaying === "boolean"
  ) {
    return state;
  }

  const hasStarted = state.startedAt !== null || state.phase === "playing" || state.phase === "ended";

  return {
    ...state,
    createdAt:
      typeof persistedState.createdAt === "number"
        ? persistedState.createdAt
        : state.lastActivityAt,
    hasEnteredPlaying:
      typeof persistedState.hasEnteredPlaying === "boolean"
        ? persistedState.hasEnteredPlaying
        : hasStarted
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
  if (state.phase !== "playing") {
    return failure(state, "not-playing");
  }

  const color = findPlayerColor(state, playerId);
  if (color === null) {
    return failure(state, "invalid-player");
  }

  if (color !== state.game.currentPlayer) {
    return failure(state, "not-your-turn");
  }

  const moveResult = placeStone(state.game, position);
  if (moveResult.success === false) {
    return failure(state, "illegal-move");
  }

  return {
    success: true,
    state: {
      ...state,
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
  if (state.phase !== "playing") {
    return failure(state, "not-playing");
  }

  const color = findPlayerColor(state, playerId);
  const latestMove = state.game.moves.at(-1);
  if (color === null || latestMove?.player !== color) {
    return failure(state, "request-not-allowed");
  }

  if (state.pendingRequest !== null) {
    return failure(state, "request-not-allowed");
  }

  return {
    success: true,
    state: {
      ...state,
      pendingRequest: {
        type: "undo",
        requestId: createRequestId("undo", state.gameNumber, now),
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
  const request = state.pendingRequest;
  if (request?.type !== "undo" || request.requestId !== requestId) {
    return failure(state, "request-not-found");
  }

  const color = findPlayerColor(state, playerId);
  if (color === null || color === request.requestedBy) {
    return failure(state, "request-not-allowed");
  }

  if (now > request.expiresAt) {
    return {
      success: false,
      error: "request-expired",
      state: { ...state, pendingRequest: null, lastActivityAt: now }
    };
  }

  if (!accept) {
    return {
      success: true,
      state: { ...state, pendingRequest: null, lastActivityAt: now }
    };
  }

  const latestMove = state.game.moves.at(-1);
  if (latestMove?.turn !== request.targetMoveTurn) {
    return failure(state, "request-stale");
  }

  return {
    success: true,
    state: {
      ...state,
      game: undoMove(state.game),
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
  if (state.phase !== "playing") {
    return failure(state, "not-playing");
  }

  const color = findPlayerColor(state, playerId);
  if (color === null || state.pendingRequest !== null) {
    return failure(state, "request-not-allowed");
  }

  return {
    success: true,
    state: {
      ...state,
      pendingRequest: {
        type: "surrender",
        requestId: createRequestId("surrender", state.gameNumber, now),
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
  const request = state.pendingRequest;
  if (
    request?.type !== "surrender" ||
    request.requestId !== requestId
  ) {
    return failure(state, "request-not-found");
  }

  const color = findPlayerColor(state, playerId);
  if (color === null || color === request.requestedBy) {
    return failure(state, "request-not-allowed");
  }

  if (now > request.expiresAt) {
    return {
      success: false,
      error: "request-expired",
      state: { ...state, pendingRequest: null, lastActivityAt: now }
    };
  }

  if (!accept) {
    return {
      success: true,
      state: { ...state, pendingRequest: null, lastActivityAt: now }
    };
  }

  return {
    success: true,
    state: createNextStabilizingGame(state, now)
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
  const nextState: OnlineRoomState = {
    ...state,
    players,
    heartbeats: {
      ...state.heartbeats,
      [color]: nextHeartbeat
    },
    lastActivityAt: now
  };

  if (
    nextState.phase === "stabilizing" &&
    hasStableHeartbeats(nextState) &&
    areBothPlayersConnected(nextState.players)
  ) {
    return {
      success: true,
      state: {
        ...nextState,
        phase: "playing",
        hasEnteredPlaying: true,
        startedAt: now,
        turnStartedAt: now,
        turnPausedAt: null,
        turnPausedDurationMs: 0
      }
    };
  }

  return { success: true, state: nextState };
}

export function startNewGame(
  state: OnlineRoomState,
  playerId: string,
  now: number
): OnlineRoomMutationResult {
  if (findPlayerColor(state, playerId) === null) {
    return failure(state, "invalid-player");
  }

  if (state.phase !== "ended") {
    return failure(state, "not-ended");
  }

  return {
    success: true,
    state: createNextStabilizingGame(state, now)
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
    gameNumber: state.gameNumber,
    startedAt: state.startedAt,
    turnStartedAt: state.turnStartedAt,
    turnPausedAt: state.turnPausedAt,
    turnPausedDurationMs: state.turnPausedDurationMs,
    serverNow,
    viewerColor: findPlayerColor(state, viewerPlayerId)
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

function resumeTurnIfReady(state: OnlineRoomState, now: number): OnlineRoomState {
  if (
    state.phase !== "playing" ||
    state.turnPausedAt === null ||
    !areBothPlayersConnected(state.players)
  ) {
    return state;
  }

  return {
    ...state,
    turnPausedDurationMs:
      state.turnPausedDurationMs + (now - state.turnPausedAt),
    turnPausedAt: null,
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
    gameNumber: state.gameNumber + 1,
    heartbeats: {},
    startedAt: null,
    turnStartedAt: null,
    turnPausedAt: null,
    turnPausedDurationMs: 0,
    lastActivityAt: now
  };
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
