import { describe, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    protected readonly ctx: unknown;
    protected readonly env: unknown;

    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  }
}));

const { GobangRoom } = await import("./room-object");

class TestStorage {
  private readonly values = new Map<string, unknown>();

  get(key: string): Promise<unknown> {
    return Promise.resolve(this.values.get(key));
  }

  put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
    return Promise.resolve();
  }
}

describe("GobangRoom Durable Object", () => {
  it("loads room creation state across object instance recreation", async () => {
    const storage = new TestStorage();
    const firstInstance = createRoomObject(storage);
    const secondInstance = createRoomObject(storage);

    const createResponse = await firstInstance.fetch(roomRequest("/create", "POST"));
    expect(createResponse.ok).toBe(true);

    const statusResponse = await secondInstance.fetch(roomRequest("/status", "GET"));
    const status = await statusResponse.json();

    expect(status).toEqual({
      exists: true,
      joinable: true,
      reason: "joinable"
    });
  });
});

function createRoomObject(storage: TestStorage): InstanceType<typeof GobangRoom> {
  return new GobangRoom(
    { storage } as unknown as DurableObjectState,
    {} as Env
  );
}

function roomRequest(pathname: string, method: "GET" | "POST"): Request {
  return new Request(`https://room.internal${pathname}`, {
    headers: { "x-room-code": "ABCDEF" },
    method
  });
}
