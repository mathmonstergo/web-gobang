import { normalizeRoomCode, createRoomCode } from "./room-code";
import { type WorkerEnv } from "./types";

export { GobangRoom } from "./room-object";

const ROOM_ROUTE_PATTERN = /^\/api\/rooms\/([^/]+)(?:\/(ws))?$/;

type CreateRoomResponse = {
  roomCode: string;
  inviteUrl: string;
};

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/rooms" && request.method === "POST") {
      return createRoom(request, env);
    }

    const roomRouteMatch = ROOM_ROUTE_PATTERN.exec(url.pathname);
    if (roomRouteMatch !== null) {
      const roomCode = normalizeRoomCode(roomRouteMatch[1]);
      const routeKind = roomRouteMatch[2];

      if (roomCode === null) {
        return json({ success: false, reason: "invalid-room-code" }, 400);
      }

      if (routeKind === "ws") {
        return forwardRoomRequest(request, env, roomCode);
      }

      if (request.method === "GET") {
        return forwardRoomRequest(request, env, roomCode);
      }

      return json({ success: false, reason: "method-not-allowed" }, 405);
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ success: false, reason: "not-found" }, 404);
    }

    return env.ASSETS.fetch(request);
  }
};

async function createRoom(request: Request, env: WorkerEnv): Promise<Response> {
  const roomCode = createRoomCode();
  const durableObjectResponse = await fetchRoomObject(env, roomCode, "/create", {
    method: "POST"
  });

  if (!durableObjectResponse.ok) {
    return json({ success: false, reason: "room-create-failed" }, 500);
  }

  const response: CreateRoomResponse = {
    roomCode,
    inviteUrl: createInviteUrl(request.url, roomCode)
  };

  return json(response, 201);
}

function forwardRoomRequest(
  request: Request,
  env: WorkerEnv,
  roomCode: string
): Promise<Response> {
  const url = new URL(request.url);
  const internalPath = url.pathname.endsWith("/ws") ? "/ws" : "/status";

  return fetchRoomObject(env, roomCode, internalPath, request);
}

function fetchRoomObject(
  env: WorkerEnv,
  roomCode: string,
  path: string,
  init: RequestInit | Request
): Promise<Response> {
  const durableObjectId = env.ROOMS.idFromName(roomCode);
  const room = env.ROOMS.get(durableObjectId);
  const request =
    init instanceof Request
      ? withRoomHeaders(init, roomCode, path)
      : new Request(`https://room.internal${path}`, {
          ...init,
          headers: { "x-room-code": roomCode }
        });

  return room.fetch(request);
}

function withRoomHeaders(
  request: Request,
  roomCode: string,
  path: string
): Request {
  const headers = new Headers(request.headers);
  const sourceUrl = new URL(request.url);
  headers.set("x-room-code", roomCode);

  return new Request(`https://room.internal${path}${sourceUrl.search}`, {
    body: request.body,
    headers,
    method: request.method
  });
}

function createInviteUrl(requestUrl: string, roomCode: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}/?room=${roomCode}`;
}

function json(body: unknown, statusOrInit: number | ResponseInit = 200): Response {
  const init =
    typeof statusOrInit === "number" ? { status: statusOrInit } : statusOrInit;

  return Response.json(body, init);
}
