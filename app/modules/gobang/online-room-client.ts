import {
  type CreateOnlineRoomResponse,
  type RoomValidationResult
} from "@/modules/gobang/online-types";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;

export type WebSocketUrlInput = {
  origin: string;
  roomCode: string;
  playerId: string;
  sessionToken: string;
  nickname: string;
  avatarInitial: string;
  avatarColor: string;
};

export async function createOnlineRoom(): Promise<CreateOnlineRoomResponse> {
  const response = await fetch("/api/rooms", { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to create room");
  }

  const data: unknown = await response.json();
  return data as CreateOnlineRoomResponse;
}

export async function validateOnlineRoom(
  value: string
): Promise<RoomValidationResult | { reason: "invalid-format" }> {
  const roomCode = parseInviteRoomCode(value);
  if (roomCode === null) {
    return { reason: "invalid-format" };
  }

  const response = await fetch(`/api/rooms/${roomCode}`);
  if (!response.ok) {
    return { exists: false, joinable: false, reason: "not-found" };
  }

  const data: unknown = await response.json();
  return data as RoomValidationResult;
}

export function parseInviteRoomCode(value: string): string | null {
  const rawValue = value.trim();
  const directCode = normalizeRoomCode(rawValue);
  if (directCode !== null) {
    return directCode;
  }

  try {
    const url = new URL(rawValue);
    const roomValue = url.searchParams.get("room");
    return roomValue === null ? null : normalizeRoomCode(roomValue);
  } catch {
    return null;
  }
}

export function buildRoomWebSocketUrl(input: WebSocketUrlInput): string {
  const url = new URL(`/api/rooms/${input.roomCode}/ws`, input.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("playerId", input.playerId);
  url.searchParams.set("sessionToken", input.sessionToken);
  url.searchParams.set("nickname", input.nickname);
  url.searchParams.set("avatarInitial", input.avatarInitial);
  url.searchParams.set("avatarColor", input.avatarColor);
  return url.toString();
}

function normalizeRoomCode(value: string): string | null {
  const normalizedValue = value.trim().toUpperCase();
  if (normalizedValue.length !== ROOM_CODE_LENGTH) {
    return null;
  }

  const allowedCharacters = new Set(ROOM_CODE_ALPHABET);
  const isValid = Array.from(normalizedValue).every((character: string) =>
    allowedCharacters.has(character)
  );

  return isValid ? normalizedValue : null;
}
