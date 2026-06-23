import { type GameState } from "@/modules/gobang/types";

import {
  type ClientMessage,
  type OnlineEndReason,
  type OnlineGamePhase,
  type OnlineNotificationEvent,
  type OnlinePlayer,
  type PendingRoomRequest,
  type ServerMessage
} from "../../../worker/protocol";

export type {
  ClientMessage,
  OnlineEndReason,
  OnlineGamePhase,
  OnlineNotificationEvent,
  OnlinePlayer,
  PendingRoomRequest,
  ServerMessage
};

export type OnlineModeStatus =
  | "idle"
  | "creating"
  | "joining"
  | "connected"
  | "room-full"
  | "disconnected"
  | "error";

export type CreateOnlineRoomResponse = {
  roomCode: string;
  inviteUrl: string;
};

export type RoomValidationResult =
  | { exists: false; joinable: false; reason: "not-found" }
  | { exists: true; joinable: true; reason: "joinable" }
  | { exists: true; joinable: false; reason: "room-full" };

export type OnlineRoomSnapshot = {
  roomCode: string;
  players: Partial<Record<"black" | "white", OnlinePlayer>>;
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
  viewerColor: "black" | "white" | null;
};

export type OnlineNotification = {
  id: string;
  event: OnlineNotificationEvent;
  text: string;
};

export type OnlineServerMessage = ServerMessage;
