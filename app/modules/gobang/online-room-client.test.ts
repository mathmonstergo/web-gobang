import { describe, expect, it } from "vitest";

import { buildRoomWebSocketUrl, parseInviteRoomCode } from "./online-room-client";

describe("online room client helpers", () => {
  it("parses raw room codes and invite links", () => {
    expect(parseInviteRoomCode("abcd23")).toBe("ABCD23");
    expect(parseInviteRoomCode("https://example.com/?room=JKLM89")).toBe(
      "JKLM89"
    );
    expect(parseInviteRoomCode("bad-code")).toBeNull();
  });

  it("builds websocket URLs from the current location", () => {
    const url = buildRoomWebSocketUrl({
      origin: "https://example.com",
      roomCode: "ABCD23",
      playerId: "player-1",
      sessionToken: "token-1",
      nickname: "阿达",
      avatarInitial: "阿",
      avatarColor: "#2f8f68"
    });

    expect(url).toBe(
      "wss://example.com/api/rooms/ABCD23/ws?playerId=player-1&sessionToken=token-1&nickname=%E9%98%BF%E8%BE%BE&avatarInitial=%E9%98%BF&avatarColor=%232f8f68"
    );
  });
});
