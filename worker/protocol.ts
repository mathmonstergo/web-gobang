import { type GameState, type Player } from "@shared/gobang/types";

export type OnlineGamePhase =
  | "waiting"
  | "stabilizing"
  | "playing"
  | "ended"
  | "resetting";

export type OnlinePlayerColor = Player;

export type OnlineErrorCode =
  | "room-not-created"
  | "room-full"
  | "invalid-player"
  | "not-playing"
  | "not-ended"
  | "not-your-turn"
  | "illegal-move"
  | "request-not-allowed"
  | "request-not-found"
  | "request-expired"
  | "request-stale";

export type OnlineNotificationEvent =
  | "opponent-joined"
  | "opponent-disconnected"
  | "opponent-reconnected"
  | "undo-requested"
  | "undo-accepted"
  | "undo-rejected"
  | "undo-expired"
  | "surrender-requested"
  | "surrender-accepted"
  | "surrender-rejected"
  | "surrender-expired"
  | "game-started"
  | "room-full"
  | "invite-copied"
  | "new-game-started";

export type OnlineEndReason =
  | { type: "win"; winner: OnlinePlayerColor }
  | {
      type: "surrender";
      winner: OnlinePlayerColor;
      surrenderedBy: OnlinePlayerColor;
    };

export type OnlinePlayer = {
  playerId: string;
  sessionTokenHash: string;
  nickname: string;
  avatarInitial: string;
  avatarColor: string;
  color: OnlinePlayerColor;
  isConnected: boolean;
  isHeartbeatHealthy: boolean;
  disconnectedAt: number | null;
};

export type PlayerHeartbeatState = {
  generation: number;
  validCount: number;
  lastHeartbeatAt: number | null;
};

export type PendingRoomRequest =
  | {
      type: "undo";
      requestId: string;
      requestedBy: OnlinePlayerColor;
      targetMoveTurn: number;
      expiresAt: number;
    }
  | {
      type: "surrender";
      requestId: string;
      requestedBy: OnlinePlayerColor;
      expiresAt: number;
    };

export type OnlineRoomState = {
  roomCode: string;
  isCreated: boolean;
  players: Partial<Record<OnlinePlayerColor, OnlinePlayer>>;
  heartbeats: Partial<Record<OnlinePlayerColor, PlayerHeartbeatState>>;
  game: GameState;
  phase: OnlineGamePhase;
  endReason: OnlineEndReason | null;
  pendingRequest: PendingRoomRequest | null;
  gameNumber: number;
  startedAt: number | null;
  turnStartedAt: number | null;
  turnPausedAt: number | null;
  turnPausedDurationMs: number;
  lastActivityAt: number;
};

export type JoinRoomInput = {
  playerId: string;
  sessionTokenHash: string;
  nickname: string;
  avatarInitial: string;
  avatarColor: string;
};

export type JoinRoomResult =
  | { success: true; state: OnlineRoomState; player: OnlinePlayer }
  | { success: false; error: OnlineErrorCode; state: OnlineRoomState };

export type OnlineRoomMutationResult =
  | { success: true; state: OnlineRoomState }
  | { success: false; error: OnlineErrorCode; state: OnlineRoomState };

export type RoomJoinability =
  | { exists: false; joinable: false; reason: "not-found" }
  | { exists: true; joinable: true; reason: "joinable" }
  | { exists: true; joinable: false; reason: "room-full" };

export type OnlineRoomClientState = {
  roomCode: string;
  players: Partial<Record<OnlinePlayerColor, OnlinePlayer>>;
  game: GameState;
  phase: OnlineGamePhase;
  endReason: OnlineEndReason | null;
  pendingRequest: PendingRoomRequest | null;
  gameNumber: number;
  startedAt: number | null;
  turnStartedAt: number | null;
  turnPausedAt: number | null;
  turnPausedDurationMs: number;
  serverNow: number;
  viewerColor: OnlinePlayerColor | null;
};

export type ClientMessage =
  | { type: "place"; row: number; col: number }
  | { type: "heartbeat"; gameNumber: number; sentAt: number }
  | { type: "request_undo" }
  | { type: "respond_undo"; requestId: string; accept: boolean }
  | { type: "request_surrender" }
  | { type: "respond_surrender"; requestId: string; accept: boolean }
  | { type: "start_new_game" }
  | { type: "reset_animation_complete"; gameNumber: number };

export type ServerMessage =
  | { type: "snapshot"; state: OnlineRoomClientState }
  | { type: "notification"; event: OnlineNotificationEvent; text: string }
  | { type: "error"; code: OnlineErrorCode; message: string };
