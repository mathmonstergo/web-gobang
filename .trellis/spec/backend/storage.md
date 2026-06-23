# Storage & Caching

> Session caching with Cloudflare Cache API and R2 storage patterns.

---

## Session Caching (Cloudflare Cache API)

### Overview

Use Cloudflare Workers Cache API to cache session data, reducing database queries for Bearer Token authentication.

### Why Cache Sessions?

| Scenario                        | Without Cache           | With Cache            |
| ------------------------------- | ----------------------- | --------------------- |
| Client making 100 API calls/min | 100 DB queries/min      | ~2 DB queries/min     |
| Session validation latency      | 20-50ms (DB round-trip) | <1ms (edge cache hit) |
| Database load                   | High                    | Low                   |

### Implementation Architecture

```
Request (Bearer Token)
    |
hashToken(token)  ->  tokenHash
    |
+---------------------+
| Cache API lookup    |  <- caches.default.match(cacheKey)
+----------+----------+
           |
      [Cache Hit] -> Validate expiry -> Return SessionData
           |
      [Cache Miss]
           |
+---------------------+
| Database query      |
+----------+----------+
           |
      [Found] -> Write to cache (non-blocking) -> Return SessionData
           |
      [Not Found] -> Return null
```

### Cache Configuration

| Setting    | Value                      | Rationale                                            |
| ---------- | -------------------------- | ---------------------------------------------------- |
| TTL        | 1 hour (3600s)             | Balance between cache hits and staleness             |
| Cache Key  | Pseudo-URL with tokenHash  | `https://session-cache.internal/session/{tokenHash}` |
| Write Mode | Non-blocking (`waitUntil`) | Don't slow down response                             |

### Core Implementation

#### Cache Module

```typescript
// src/lib/session-cache.ts

// Cloudflare Workers extends CacheStorage with .default
interface CloudflareCacheStorage extends CacheStorage {
  default: Cache;
}

const CACHE_TTL_SECONDS = 3600; // 1 hour
const CACHE_URL_PREFIX = "https://session-cache.internal/session/";

function buildCacheKey(tokenHash: string): Request {
  const url = `${CACHE_URL_PREFIX}${tokenHash}`;
  return new Request(url, { method: "GET" });
}

// Read from cache
export async function getSessionFromCache(
  tokenHash: string,
): Promise<CachedSessionData | null> {
  const cache = (caches as CloudflareCacheStorage).default;
  const cacheKey = buildCacheKey(tokenHash);

  const response = await cache.match(cacheKey);
  if (!response) return null;

  const data = await response.json<CachedSessionData>();

  // Restore Date object (JSON serializes as string)
  return {
    session: {
      ...data.session,
      expiresAt: new Date(data.session.expiresAt),
    },
    user: data.user,
  };
}

// Write to cache (non-blocking)
export function setSessionToCache(
  ctx: ExecutionContext,
  tokenHash: string,
  sessionData: CachedSessionData,
): void {
  const cache = (caches as CloudflareCacheStorage).default;
  const cacheKey = buildCacheKey(tokenHash);

  const response = new Response(JSON.stringify(sessionData), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `s-maxage=${CACHE_TTL_SECONDS}`,
    },
  });

  // Non-blocking write
  ctx.waitUntil(cache.put(cacheKey, response));
}

// Delete from cache (for logout)
export async function deleteSessionFromCache(
  tokenHash: string,
): Promise<boolean> {
  const cache = (caches as CloudflareCacheStorage).default;
  const cacheKey = buildCacheKey(tokenHash);
  return cache.delete(cacheKey);
}
```

#### Usage in Auth Middleware

```typescript
// src/middleware/auth.ts

export async function getSession(
  env: Bindings,
  ctx: ExecutionContext, // Required for cache write
  headers: Headers,
  authHeader?: string | null,
): Promise<SessionData | null> {
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const tokenHash = await hashToken(token);

    // 1. Check cache first
    const cached = await getSessionFromCache(tokenHash);
    if (cached && cached.session.expiresAt > new Date()) {
      return cached;
    }

    // 2. Cache miss - query database
    const sessionRecord = await db.query.session.findFirst({
      where: and(
        eq(schema.session.token, tokenHash),
        gt(schema.session.expiresAt, new Date()),
      ),
      with: { user: true },
    });

    if (sessionRecord?.user) {
      const sessionData = {
        /* ... */
      };

      // 3. Write to cache (non-blocking)
      setSessionToCache(ctx, tokenHash, sessionData);

      return sessionData;
    }
  }

  // ... Cookie session handling
}
```

### Cloudflare Cache API Key Points

1. **Cache Key must be a Request object**

   ```typescript
   // Correct
   const cacheKey = new Request("https://example.com/path", { method: "GET" });

   // Wrong - string doesn't work
   const cacheKey = "session:abc123";
   ```

2. **`caches.default` is Cloudflare-specific**

   ```typescript
   // Standard CacheStorage doesn't have .default
   // Need type assertion for TypeScript
   interface CloudflareCacheStorage extends CacheStorage {
     default: Cache;
   }
   const cache = (caches as CloudflareCacheStorage).default;
   ```

3. **Use `waitUntil` for non-blocking writes**

   ```typescript
   // Non-blocking - response returns immediately
   ctx.waitUntil(cache.put(cacheKey, response));

   // Blocking - waits for cache write
   await cache.put(cacheKey, response);
   ```

4. **TTL via Cache-Control header**
   ```typescript
   const response = new Response(JSON.stringify(data), {
     headers: {
       "Cache-Control": "s-maxage=3600", // 1 hour
     },
   });
   ```

### Cache Invalidation Strategy

| Event              | Action                                   |
| ------------------ | ---------------------------------------- |
| User logs out      | Call `deleteSessionFromCache(tokenHash)` |
| Session expires    | Cache TTL handles automatically          |
| Permissions change | Short TTL (1h) limits staleness          |
| Token revoked      | DB check will fail, cache ignored        |

### Session Cache Best Practices

**DO:**

- Always check session expiry after cache hit
- Use `waitUntil` for non-blocking cache writes
- Use pseudo-URL as cache key (e.g., `https://cache.internal/...`)
- Handle Date serialization (JSON -> string -> Date)
- Delete cache on logout

**DON'T:**

- Cache sensitive data that changes frequently
- Use very long TTL (>1h) for security-sensitive data
- Forget to pass `ExecutionContext` to cache write functions
- Block response waiting for cache write

---

## R2 Storage Guidelines

> **Cloudflare R2 storage operations with type-safe wrapper**

### Directory Structure

```
src/lib/r2/
├── index.ts          # Main entry - exports all functions and types
├── types.ts          # Type definitions (StoragePrefix, R2UploadOptions, etc.)
├── operations.ts     # Core operations (upload, download, delete, list)
└── utils.ts          # Utilities (key generation, MIME types, validation)
```

### Storage Key Convention

All storage keys follow this format:

```
{prefix}/{workspaceId}/{entityId?}/{filename}
```

**Supported Prefixes:**

| Prefix        | Purpose                            | Cache Control      |
| ------------- | ---------------------------------- | ------------------ |
| `attachments` | Entity attachments (images, files) | 1 year (immutable) |
| `avatars`     | User/workspace avatars             | 1 day              |
| `exports`     | Exported data (CSV, JSON)          | 1 hour             |
| `temp`        | Temporary files                    | 5 minutes          |

### Basic Usage

```typescript
import {
  generateStorageKey,
  generateUniqueFilename,
  uploadObject,
  downloadObject,
  deleteObject,
} from "../lib/r2";

// 1. Generate a unique storage key
const key = generateStorageKey({
  prefix: "attachments",
  workspaceId: workspace.id,
  entityId: entity.id,
  filename: generateUniqueFilename(file.name),
});
// => 'attachments/ws_123/ent_456/1702800000000-a1b2c3d4-image.png'

// 2. Upload file
const result = await uploadObject(c.env.R2_BUCKET, key, file.stream(), {
  contentType: file.type,
});

if (result.success) {
  // Save metadata to database
  await db.insert(attachment).values({
    storageKey: key,
    fileName: file.name,
    fileSize: result.size,
    fileType: file.type,
  });
}

// 3. Download file
const download = await downloadObject(c.env.R2_BUCKET, key);
if (download.success) {
  return new Response(download.body, {
    headers: { "Content-Type": download.contentType },
  });
}

// 4. Delete file
await deleteObject(c.env.R2_BUCKET, attachment.storageKey);
```

### Upload Endpoint Pattern

```typescript
// src/routes/attachments/procedures/upload.ts
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../../../types";
import {
  generateStorageKey,
  generateUniqueFilename,
  uploadObject,
  validateUpload,
} from "../../../lib/r2";

export const uploadAttachment: MiddlewareHandler<AppEnv> = async (c) => {
  const logger = c.get("logger");
  const user = c.get("user");
  const workspaceId = c.get("workspaceId");

  if (!user || !workspaceId) {
    return c.json({ success: false, reason: "Unauthorized" }, 401);
  }

  // 1. Validate request
  const contentLength = c.req.header("content-length");
  const contentType = c.req.header("content-type");

  const validationError = validateUpload(
    contentLength ? parseInt(contentLength, 10) : null,
    contentType ?? null,
  );

  if (validationError) {
    return c.json(validationError, 400);
  }

  // 2. Get file from form data
  const formData = await c.req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return c.json({ success: false, reason: "No file provided" }, 400);
  }

  // 3. Generate storage key
  const key = generateStorageKey({
    prefix: "attachments",
    workspaceId,
    filename: generateUniqueFilename(file.name),
  });

  // 4. Upload to R2
  const result = await uploadObject(c.env.R2_BUCKET, key, file.stream(), {
    contentType: file.type,
    customMetadata: {
      originalName: file.name,
      uploadedBy: user.id,
    },
  });

  if (!result.success) {
    logger.error("upload_failed", { error: result.message });
    return c.json(result, 500);
  }

  // 5. Save to database
  const db = getDb(c.env);
  const [attachment] = await db
    .insert(attachmentTable)
    .values({
      workspaceId,
      storageKey: key,
      fileName: file.name,
      fileType: file.type,
      fileSize: result.size,
      createdBy: user.id,
    })
    .returning();

  logger.info("attachment_uploaded", {
    attachmentId: attachment.id,
    key,
    size: result.size,
  });

  return c.json({
    success: true,
    attachment: {
      id: attachment.id,
      fileName: attachment.fileName,
      fileSize: attachment.fileSize,
      fileType: attachment.fileType,
    },
  });
};
```

### Download Endpoint Pattern

```typescript
// src/routes/attachments/procedures/download.ts
import { downloadObjectWithHeaders } from "../../../lib/r2";

export const downloadAttachment: MiddlewareHandler<AppEnv> = async (c) => {
  const attachmentId = c.req.param("id");
  const workspaceId = c.get("workspaceId");

  // 1. Get attachment from database
  const db = getDb(c.env);
  const attachment = await db.query.attachment.findFirst({
    where: and(
      eq(attachmentTable.id, attachmentId),
      eq(attachmentTable.workspaceId, workspaceId),
    ),
  });

  if (!attachment) {
    return c.json({ success: false, reason: "Attachment not found" }, 404);
  }

  // 2. Serve from R2 with HTTP caching support
  return downloadObjectWithHeaders(
    c.env.R2_BUCKET,
    attachment.storageKey,
    c.req.raw.headers,
  );
};
```

### Batch Delete Pattern

```typescript
import { deleteObjects, buildEntityPrefix, listObjects } from "../../../lib/r2";

// Delete all attachments for an entity
async function deleteEntityAttachments(
  bucket: R2Bucket,
  workspaceId: string,
  entityId: string,
): Promise<void> {
  const prefix = buildEntityPrefix("attachments", workspaceId, entityId);

  // List all objects with this prefix
  const result = await listObjects(bucket, { prefix });

  if (result.success && result.objects.length > 0) {
    const keys = result.objects.map((obj) => obj.key);
    await deleteObjects(bucket, keys);
  }
}
```

### Available Functions

| Function                                          | Purpose                            |
| ------------------------------------------------- | ---------------------------------- |
| `generateStorageKey(params)`                      | Generate storage key from params   |
| `generateUniqueFilename(name)`                    | Add timestamp + random to filename |
| `parseStorageKey(key)`                            | Parse key back to params           |
| `uploadObject(bucket, key, body, options)`        | Upload file to R2                  |
| `downloadObject(bucket, key)`                     | Download file from R2              |
| `downloadObjectWithHeaders(bucket, key, headers)` | Download with HTTP caching         |
| `getObjectMeta(bucket, key)`                      | Get metadata without body          |
| `deleteObject(bucket, key)`                       | Delete single object               |
| `deleteObjects(bucket, keys)`                     | Batch delete objects               |
| `listObjects(bucket, options)`                    | List objects with prefix           |
| `objectExists(bucket, key)`                       | Check if object exists             |
| `validateUpload(contentLength, contentType)`      | Validate upload request            |

### Error Handling

All operations return discriminated unions:

```typescript
const result = await uploadObject(bucket, key, body);

if (result.success) {
  // result is R2UploadResult
  console.log(result.key, result.size, result.etag);
} else {
  // result is R2Error
  console.log(result.code, result.message);
  // code: 'NOT_FOUND' | 'FORBIDDEN' | 'PAYLOAD_TOO_LARGE' | 'INVALID_KEY' | 'UPLOAD_FAILED' | 'UNKNOWN'
}
```

### R2 Best Practices

**DO:**

- Always use `generateStorageKey()` for consistent key format
- Use `generateUniqueFilename()` to prevent collisions
- Store `storageKey` in database for later retrieval
- Use `downloadObjectWithHeaders()` for serving files (supports Range, ETag)
- Validate file size before upload with `validateUpload()`
- Delete R2 objects when deleting database records
- Use batch delete for multiple objects

**DON'T:**

- Construct storage keys manually (use `generateStorageKey`)
- Store files without workspace isolation
- Forget to handle upload errors
- Use `downloadObject` for HTTP endpoints (use `downloadObjectWithHeaders`)
- Leave orphaned R2 objects after database deletion

### Configuration

R2 bucket is configured in `wrangler.toml`:

```toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "your-bucket-name"
```

Access via `c.env.R2_BUCKET` in handlers.

---

## KV Storage (Quick Reference)

For key-value storage needs:

```typescript
// Read
const value = await c.env.MY_KV.get("key");
const data = await c.env.MY_KV.get("key", "json");

// Write
await c.env.MY_KV.put("key", "value");
await c.env.MY_KV.put("key", JSON.stringify(data), {
  expirationTtl: 3600, // 1 hour
});

// Delete
await c.env.MY_KV.delete("key");

// List
const list = await c.env.MY_KV.list({ prefix: "user:" });
```

Configure in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "MY_KV"
id = "your-kv-namespace-id"
```

## Scenario: Durable Object Room State Snapshots

### 1. Scope / Trigger

- Trigger: real-time room or session state is owned by a Durable Object and must
  survive object instance recreation, Wrangler local reloads, and short runtime
  lifecycle changes.
- Use this for small authoritative state such as room creation markers, player
  slots, reconnect windows, pending request timestamps, and board snapshots.
- Do not rely on class private fields alone for any state that an HTTP
  validation route or a reconnecting WebSocket must observe later.

### 2. Signatures

```typescript
const ROOM_STATE_STORAGE_KEY = "room-state-v1";

type RoomState = {
  roomCode: string;
  isCreated: boolean;
  createdAt: number;
  hasEnteredPlaying: boolean;
  lastActivityAt: number;
  clocks?: Partial<Record<"black" | "white", OnlinePlayerClock>>;
};

type OnlinePlayerClock = {
  stepRemainingMs: number;
  gameRemainingMs: number;
};

async function loadRoomState(roomCode: string): Promise<RoomState>;
async function persistRoomState(state: RoomState): Promise<void>;
function normalizeRoomState(state: RoomState): RoomState;
function cleanupRoomStateForAccess(state: RoomState, now: number): RoomState;
function canStartGame(state: RoomState): boolean;
function startGame(
  state: RoomState,
  playerId: string,
  now: number,
  randomValue: number,
): RoomState;
```

### 3. Contracts

- Durable Object id: derive from stable room identity, for example
  `env.ROOMS.idFromName(roomCode)`.
- Storage key: use one versioned key per room object, for example
  `room-state-v1`.
- Stored value: JSON-serializable object using Unix millisecond timestamps.
- In-memory cache: private fields are allowed as a per-instance cache, but every
  mutating API/WebSocket path that changes authoritative state must write the
  updated snapshot to `this.ctx.storage`.
- Load path: every request path that needs room state must first load storage
  when the in-memory field is empty or belongs to a different room code.
- Lifecycle cleanup is request-driven. Run `cleanupRoomStateForAccess` after
  loading storage and before `/status`, WebSocket join, or client-message
  handling. Do not add a global cron unless a separate room-code index and
  proactive storage deletion are explicitly required.
- Store enough lifecycle metadata for cleanup: `createdAt` is the actual room
  creation time, and `hasEnteredPlaying` flips to true only when an explicit
  accepted `start_game` mutation enters `playing`. Stable heartbeats are a
  readiness signal, not a phase transition. A later rematch returning to
  `stabilizing` must not reset `hasEnteredPlaying`.
- Normalize older snapshots on access. If `createdAt` is missing, fall back to
  `lastActivityAt`; if `hasEnteredPlaying` is missing, infer it from
  `startedAt !== null`, `phase === "playing"`, or `phase === "ended"`.
- Expose online start readiness as derived client state such as `canStart`.
  Do not persist `canStart`; recompute it from phase, occupied player slots,
  connection state, and the required heartbeat counts for the current
  `gameNumber`.
- Persist service-owned countdown data with the room snapshot. Player clocks
  are millisecond durations, not wall-clock timestamps. Active turn elapsed time
  is derived from `turnStartedAt` plus the current request time.
- Heartbeats for active games must run timeout normalization before returning a
  snapshot, but they must not pause clocks. Disconnecting a player updates
  connection state only; the current player's step and total game countdowns
  continue until a move, timeout, or other end condition is processed.

### 4. Validation & Error Matrix

| Condition | Behavior |
| --- | --- |
| No stored snapshot and no in-memory snapshot | Create a default uncreated room state |
| Stored snapshot `roomCode` differs from request room code | Ignore stored value and create default state for request room |
| `/create` succeeds | Set `isCreated: true` and persist before responding |
| `/status` after object recreation | Load persisted state and return created/joinable status |
| `/status` sees disconnected slots older than reconnect window | Expire those slots before returning joinability |
| Created room never reached `playing` and is older than pre-play TTL | Reset to a default uncreated room and return `not-found` |
| Created room reached `playing` before | Do not expire it with the pre-play TTL; use player reconnect rules instead |
| Both players reach stable heartbeat count before start | Keep phase `stabilizing`; return derived `canStart: true` in client snapshots |
| `start_game` arrives before `canStartGame(state)` | Reject or ignore without entering `playing` |
| Accepted `start_game` from `stabilizing` or `ended` | Randomize black/white seats, clear board, initialize clocks, set `hasEnteredPlaying: true`, and persist before broadcast |
| Active heartbeat or gameplay message finds a timed-out current player | Transition to `ended` with timeout reason and persist before broadcast |
| Active player disconnects during their turn | Mark that player offline; do not pause `turnStartedAt` or clock countdowns |
| WebSocket join mutates player slots | Persist accepted join before broadcasting snapshots |
| WebSocket close mutates connectivity | Persist disconnect state before broadcasting snapshots |

### 5. Good/Base/Bad Cases

- Good: `POST /api/rooms` calls the room DO `/create`, persists
  `{ isCreated: true }`, and a later `GET /api/rooms/:roomCode` from a fresh DO
  instance returns `exists: true`.
- Base: pure ephemeral UI state or non-authoritative display effects may stay
  in the browser only.
- Bad: `isCreated` is stored only in a private class field; `POST /create`
  returns 201, but the next `/status` request initializes a fresh uncreated room
  and reports `not-found`.
- Bad: disconnected player slots are expired only inside the join reducer, so
  `/status` keeps returning `room-full` after the reconnect window and invite
  validation blocks the next user.
- Bad: a global cron scans room state to find stale pre-play rooms without a
  real room-code index. This adds periodic load while still not fixing
  correctness unless `/status` and join paths also clean on access.
- Bad: stable heartbeats directly transition a room into `playing`; users see a
  game start without an explicit `start_game` mutation and cannot verify start
  readiness through the UI first.

### 6. Tests Required

- Unit/integration test with shared fake DO storage:
  1. create one DO instance and call `/create`
  2. create a second DO instance with the same fake storage
  3. call `/status`
  4. assert `exists: true`, `joinable: true`, and `reason: "joinable"`
- Reducer tests should still cover pure state transitions separately from DO
  storage behavior.
- Add reducer/Object tests for cleanup:
  1. seeded full room with disconnected slots older than the reconnect window
     returns `joinable` from `/status`
  2. seeded room that never entered `playing` returns `not-found` after the
     pre-play TTL
  3. stable heartbeats keep the phase pre-play while the client snapshot exposes
     `canStart: true`
  4. accepted `start_game` sets `hasEnteredPlaying: true`, initializes clocks,
     and persists the state
  5. heartbeat or gameplay timeout ends the active game without pausing for
     disconnected players

### 7. Wrong vs Correct

#### Wrong

```typescript
class RoomObject extends DurableObject<Env> {
  private roomState: RoomState | null = null;

  async fetch(request: Request): Promise<Response> {
    this.roomState ??= createInitialRoomState(roomCode);
    if (new URL(request.url).pathname === "/create") {
      this.roomState = { ...this.roomState, isCreated: true };
      return Response.json({ success: true });
    }
    return Response.json(getJoinability(this.roomState));
  }
}
```

#### Correct

```typescript
class RoomObject extends DurableObject<Env> {
  private roomState: RoomState | null = null;

  async fetch(request: Request): Promise<Response> {
    this.roomState = await this.loadRoomState(roomCode);
    this.roomState = cleanupRoomStateForAccess(this.roomState, Date.now());
    if (new URL(request.url).pathname === "/create") {
      this.roomState = { ...this.roomState, isCreated: true };
      await this.ctx.storage.put(ROOM_STATE_STORAGE_KEY, this.roomState);
      return Response.json({ success: true });
    }
    return Response.json(getJoinability(this.roomState));
  }
}
```

#### Correct

```typescript
function receiveHeartbeat(state: RoomState, playerId: string, now: number): RoomState {
  const nextState = normalizeTimeout(state, now);
  return updateHeartbeat(nextState, playerId, now);
}

function handleClientMessage(state: RoomState, message: ClientMessage, now: number): RoomState {
  if (message.type === "start_game") {
    if (!canStartGame(state)) {
      return state;
    }
    return startGame(state, message.playerId, now, Math.random());
  }

  return applyPlayingMutation(normalizeTimeout(state, now), message, now);
}
```

## Reference

- [Cloudflare Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [Cloudflare KV](https://developers.cloudflare.com/kv/)
