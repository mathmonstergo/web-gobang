const ONLINE_PROFILE_STORAGE_KEY = "web-gobang-online-profile-v1";
const ONLINE_SESSION_STORAGE_KEY = "web-gobang-online-session-v1";
const MAX_NICKNAME_LENGTH = 8;

export type OnlineProfile = {
  playerId: string;
  nickname: string;
};

export type OnlineSession = {
  roomCode: string;
  playerId: string;
  sessionToken: string;
};

export type NicknameValidationResult =
  | { success: true; nickname: string }
  | { success: false; error: "empty" | "too-long" };

export function countVisibleCharacters(value: string): number {
  return Array.from(value).length;
}

export function validateNickname(value: string): NicknameValidationResult {
  const nickname = value.trim();

  if (nickname.length === 0) {
    return { success: false, error: "empty" };
  }

  if (countVisibleCharacters(nickname) > MAX_NICKNAME_LENGTH) {
    return { success: false, error: "too-long" };
  }

  return { success: true, nickname };
}

export function loadOnlineProfile(): OnlineProfile | null {
  const parsedValue = parseStoredJson(ONLINE_PROFILE_STORAGE_KEY);

  return isOnlineProfile(parsedValue) ? parsedValue : null;
}

export function saveOnlineProfile(profile: OnlineProfile): void {
  globalThis.localStorage.setItem(
    ONLINE_PROFILE_STORAGE_KEY,
    JSON.stringify(profile)
  );
}

export function loadOnlineSession(roomCode: string): OnlineSession | null {
  const parsedValue = parseStoredJson(ONLINE_SESSION_STORAGE_KEY);

  if (!isOnlineSessionMap(parsedValue)) {
    return null;
  }

  return parsedValue[roomCode] ?? null;
}

export function saveOnlineSession(session: OnlineSession): void {
  const parsedValue = parseStoredJson(ONLINE_SESSION_STORAGE_KEY);
  const sessionMap = isOnlineSessionMap(parsedValue) ? parsedValue : {};

  globalThis.localStorage.setItem(
    ONLINE_SESSION_STORAGE_KEY,
    JSON.stringify({
      ...sessionMap,
      [session.roomCode]: session
    })
  );
}

export function clearOnlineSession(roomCode: string): void {
  const parsedValue = parseStoredJson(ONLINE_SESSION_STORAGE_KEY);
  if (!isOnlineSessionMap(parsedValue)) {
    return;
  }

  const nextSessionMap: Record<string, OnlineSession> = {};
  for (const [key, session] of Object.entries(parsedValue)) {
    if (key !== roomCode) {
      nextSessionMap[key] = session;
    }
  }

  globalThis.localStorage.setItem(
    ONLINE_SESSION_STORAGE_KEY,
    JSON.stringify(nextSessionMap)
  );
}

function parseStoredJson(key: string): unknown {
  const rawValue = globalThis.localStorage.getItem(key);
  if (rawValue === null) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as unknown;
  } catch {
    return null;
  }
}

function isOnlineProfile(value: unknown): value is OnlineProfile {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.playerId === "string" &&
    typeof candidate.nickname === "string" &&
    validateNickname(candidate.nickname).success === true
  );
}

function isOnlineSession(value: unknown): value is OnlineSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.roomCode === "string" &&
    typeof candidate.playerId === "string" &&
    typeof candidate.sessionToken === "string"
  );
}

function isOnlineSessionMap(
  value: unknown
): value is Record<string, OnlineSession> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry: unknown) => isOnlineSession(entry));
}
