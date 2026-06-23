export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;

export function createRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte: number) =>
    ROOM_CODE_ALPHABET.charAt(byte % ROOM_CODE_ALPHABET.length)
  ).join("");
}

export function normalizeRoomCode(value: string): string | null {
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

export function parseRoomCodeInput(value: string): string | null {
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
