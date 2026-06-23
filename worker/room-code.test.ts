import { describe, expect, it } from "vitest";

import {
  ROOM_CODE_ALPHABET,
  createRoomCode,
  normalizeRoomCode,
  parseRoomCodeInput
} from "./room-code";

describe("room code helpers", () => {
  it("generates six-character uppercase codes from the allowed alphabet", () => {
    const codes = Array.from({ length: 100 }, () => createRoomCode());
    const allowedCharacters = new Set(ROOM_CODE_ALPHABET);

    expect(codes.every((code: string) => code.length === 6)).toBe(true);
    expect(
      codes.every((code: string) =>
        Array.from(code).every((character: string) =>
          allowedCharacters.has(character)
        )
      )
    ).toBe(true);
  });

  it("normalizes lowercase raw room codes", () => {
    expect(normalizeRoomCode("abcd23")).toBe("ABCD23");
    expect(normalizeRoomCode("  abcd23  ")).toBe("ABCD23");
  });

  it("parses full invite links from the room query parameter", () => {
    expect(parseRoomCodeInput("https://example.com/?room=abcd23")).toBe(
      "ABCD23"
    );
    expect(parseRoomCodeInput("https://example.com/play?room=JKLM89")).toBe(
      "JKLM89"
    );
  });

  it("returns null for invalid room code inputs", () => {
    expect(normalizeRoomCode("ABC123")).toBeNull();
    expect(normalizeRoomCode("ABCD2")).toBeNull();
    expect(normalizeRoomCode("ABCD234")).toBeNull();
    expect(parseRoomCodeInput("https://example.com/?room=ABC123")).toBeNull();
    expect(parseRoomCodeInput("not a room")).toBeNull();
  });
});
