import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  countVisibleCharacters,
  loadOnlineProfile,
  loadOnlineSession,
  saveOnlineProfile,
  saveOnlineSession,
  validateNickname
} from "@/modules/gobang/online-storage";

describe("online storage", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  it("counts visible nickname characters with Chinese text", () => {
    expect(countVisibleCharacters("五子棋玩家")).toBe(5);
    expect(countVisibleCharacters("Ada")).toBe(3);
  });

  it("validates nicknames at the 8 visible character limit", () => {
    expect(validateNickname("一二三四五六七八")).toEqual({
      success: true,
      nickname: "一二三四五六七八"
    });
    expect(validateNickname("一二三四五六七八九")).toEqual({
      success: false,
      error: "too-long"
    });
    expect(validateNickname("   ")).toEqual({
      success: false,
      error: "empty"
    });
  });

  it("saves and loads the current device profile", () => {
    saveOnlineProfile({ playerId: "player-1", nickname: "阿达" });

    expect(loadOnlineProfile()).toEqual({
      playerId: "player-1",
      nickname: "阿达"
    });
  });

  it("returns null for corrupt profile JSON", () => {
    globalThis.localStorage.setItem("web-gobang-online-profile-v1", "{bad");

    expect(loadOnlineProfile()).toBeNull();
  });

  it("saves and loads room sessions by room code", () => {
    saveOnlineSession({
      roomCode: "ABCDEF",
      playerId: "player-1",
      sessionToken: "secret-token"
    });

    expect(loadOnlineSession("ABCDEF")).toEqual({
      roomCode: "ABCDEF",
      playerId: "player-1",
      sessionToken: "secret-token"
    });
    expect(loadOnlineSession("JKLM89")).toBeNull();
  });
});

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}
