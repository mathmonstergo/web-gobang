# Online Room Invite Multiplayer Implementation Plan

> **For agentic workers:** Codex is configured for inline execution in this
> project. Do not dispatch implementation/check subagents. Track steps with
> checkbox syntax and run validation after each major task.

**Goal:** Add invite-link online Gobang rooms with Cloudflare Worker + Durable
Object real-time play while preserving the current local mode.

**Architecture:** The browser keeps local mode unchanged and adds an online room
client hook. A Worker handles API/WebSocket routing and static assets. A
Durable Object owns each room's authoritative state and broadcasts snapshots.

**Tech Stack:** React 19, Vite 6, TypeScript strict mode, Vitest, Cloudflare
Workers, Durable Objects, WebSockets, Wrangler.

---

## Task 1: Prepare Branch, Config, And Shared Type Scope

**Files:**
- Modify: `wrangler.jsonc`
- Modify: `tsconfig.json`
- Modify: `vite.config.ts`

- [ ] Check current branch and worktree.

Run:

```bash
git status --short
git branch --show-current
```

Expected: existing Trellis task files are uncommitted; no unrelated changes are
modified by this work.

- [ ] Create/switch to the required feature branch.

Run:

```bash
git switch -c online
```

Expected: branch changes to `online`. If the branch already exists, run
`git switch online` instead.

- [ ] Update TypeScript and Vite shared path support.

Edit `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./app/*"],
      "@shared/*": ["./shared/*"]
    }
  },
  "include": ["app", "shared", "worker", "vite.config.ts", "worker-configuration.d.ts"]
}
```

Edit `vite.config.ts` alias block:

```ts
alias: {
  "@": fileURLToPath(new URL("./app", import.meta.url)),
  "@shared": fileURLToPath(new URL("./shared", import.meta.url))
}
```

Update Vitest includes:

```ts
test: {
  environment: "node",
  include: ["app/**/*.test.ts", "shared/**/*.test.ts", "worker/**/*.test.ts"]
}
```

- [ ] Configure Worker + Durable Object bindings.

Edit `wrangler.jsonc` to add a Worker entry, assets binding, and Durable Object:

```jsonc
{
  "main": "worker/index.ts",
  "assets": {
    "directory": "./dist",
    "binding": "ASSETS",
    "not_found_handling": "single-page-application"
  },
  "durable_objects": {
    "bindings": [
      {
        "name": "ROOMS",
        "class_name": "GobangRoom"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["GobangRoom"]
    }
  ]
}
```

- [ ] Generate Worker binding types.

Run:

```bash
npx wrangler types
```

Expected: `worker-configuration.d.ts` is created or updated.

## Task 2: Extract Shared Gobang Rules

**Files:**
- Create: `shared/gobang/types.ts`
- Create: `shared/gobang/game-logic.ts`
- Modify: `app/modules/gobang/types.ts`
- Modify: `app/modules/gobang/game-logic.ts`
- Modify: `app/modules/gobang/*.ts`
- Modify: `app/modules/gobang/components/*.tsx`
- Modify: `app/modules/gobang/hooks/*.ts`
- Test: `shared/gobang/game-logic.test.ts`

- [ ] Move rule types to `shared/gobang/types.ts`.

Copy the current exported contents of `app/modules/gobang/types.ts` into
`shared/gobang/types.ts`.

- [ ] Move pure rule functions to `shared/gobang/game-logic.ts`.

Copy the current exported contents of `app/modules/gobang/game-logic.ts` into
`shared/gobang/game-logic.ts` and update its type import:

```ts
import {
  BOARD_SIZE,
  WIN_LENGTH,
  type Board,
  type Cell,
  type Direction,
  type GameState,
  type Move,
  type MoveResult,
  type Player,
  type Position,
  type ShapeHint,
  type WinLine
} from "@shared/gobang/types";
```

- [ ] Leave app compatibility re-exports.

Replace `app/modules/gobang/types.ts` with:

```ts
export * from "@shared/gobang/types";
```

Replace `app/modules/gobang/game-logic.ts` with:

```ts
export * from "@shared/gobang/game-logic";
```

- [ ] Move the pure rule test to shared.

Move `app/modules/gobang/game-logic.test.ts` to
`shared/gobang/game-logic.test.ts` and change imports to:

```ts
import {
  createInitialState,
  createStateFromMoves,
  detectLinePatterns,
  placeStone,
  undoMove
} from "@shared/gobang/game-logic";
import { type GameState, type Move } from "@shared/gobang/types";
```

- [ ] Run shared rule tests.

Run:

```bash
pnpm test -- shared/gobang/game-logic.test.ts
```

Expected: all moved rule tests pass.

## Task 3: Define Online Protocol And Room Reducer

**Files:**
- Create: `worker/protocol.ts`
- Create: `worker/room-state.ts`
- Test: `worker/room-state.test.ts`

- [ ] Create protocol types in `worker/protocol.ts`.

Define:

```ts
export type OnlineGamePhase = "waiting" | "stabilizing" | "playing" | "ended" | "resetting";
export type OnlinePlayerColor = "black" | "white";
export type OnlineRequestType = "undo" | "surrender";
export type OnlineNotificationEvent =
  | "opponent-joined"
  | "opponent-disconnected"
  | "opponent-reconnected"
  | "undo-requested"
  | "undo-accepted"
  | "undo-rejected"
  | "undo-expired"
  | "surrender-requested"
  | "surrender-accepted"
  | "surrender-rejected"
  | "surrender-expired"
  | "game-started"
  | "room-full"
  | "invite-copied"
  | "new-game-started";
```

Also define `OnlinePlayer`, `PendingRoomRequest`, `OnlineRoomState`,
`OnlineRoomClientState`, `ClientMessage`, `ServerMessage`, and `OnlineErrorCode`
with the fields listed in the Room State and WebSocket Protocol sections of the
design document.

- [ ] Write reducer tests first.

Create `worker/room-state.test.ts` with concrete tests covering these
assertions:

- after black joins and white joins, `phase` is `stabilizing`
- official placement, undo, surrender, and new-game mutation attempts are
  rejected while `phase` is `stabilizing`
- rejected pre-playing official mutations return a non-mutating error result and
  leave `game`, `pendingRequest`, timer anchors, and `gameNumber` unchanged
- after black has 3 valid heartbeats and white has 2 valid heartbeats, `phase`
  remains `stabilizing`
- after both black and white have 3 valid heartbeats for the current
  `gameNumber`, `phase` becomes `playing`
- when the game starts, `startedAt` and `turnStartedAt` are set to the server
  timestamp
- after an accepted move, `turnStartedAt` is reset to the move timestamp and
  move pause accounting resets
- after a post-start disconnect, move time pause fields freeze move time while
  game time remains based on `startedAt`
- after all players reconnect, move time pause duration is accumulated and
  `turnPausedAt` is cleared
- a third join returns a `room-full` error while both player slots are occupied
- a disconnected player can reclaim the same color at `disconnectedAt + 299999`
  milliseconds
- a disconnected player is no longer guaranteed the same slot at
  `disconnectedAt + 300001` milliseconds
- undo acceptance fails when `targetMoveTurn` no longer equals the latest move
  turn
- accepted surrender increments `gameNumber`, clears the board, and returns to
  `stabilizing`

- [ ] Implement room reducer helpers in `worker/room-state.ts`.

Export these pure functions:

```ts
export function createInitialRoomState(roomCode: string, now: number): OnlineRoomState;
export function joinRoom(state: OnlineRoomState, input: JoinRoomInput, now: number): JoinRoomResult;
export function disconnectPlayer(state: OnlineRoomState, playerId: string, now: number): OnlineRoomState;
export function expireDisconnectedSlots(state: OnlineRoomState, now: number): OnlineRoomState;
export function placeOnlineStone(state: OnlineRoomState, playerId: string, position: Position, now: number): OnlineRoomMutationResult;
export function requestUndo(state: OnlineRoomState, playerId: string, now: number): OnlineRoomMutationResult;
export function respondUndo(state: OnlineRoomState, playerId: string, requestId: string, accept: boolean, now: number): OnlineRoomMutationResult;
export function requestSurrender(state: OnlineRoomState, playerId: string, now: number): OnlineRoomMutationResult;
export function respondSurrender(state: OnlineRoomState, playerId: string, requestId: string, accept: boolean, now: number): OnlineRoomMutationResult;
export function receiveHeartbeat(state: OnlineRoomState, playerId: string, gameNumber: number, now: number): OnlineRoomMutationResult;
export function startNewGame(state: OnlineRoomState, playerId: string, now: number): OnlineRoomMutationResult;
export function toClientState(state: OnlineRoomState, viewerPlayerId: string): OnlineRoomClientState;
```

Use `createInitialState`, `placeStone`, and `undoMove` from
`@shared/gobang/game-logic`.

- [ ] Run reducer tests.

Run:

```bash
pnpm test -- worker/room-state.test.ts
```

Expected: all room reducer tests pass.

## Task 4: Add Worker Routes And Durable Object

**Files:**
- Create: `worker/types.ts`
- Create: `worker/room-code.ts`
- Create: `worker/room-object.ts`
- Create: `worker/index.ts`
- Test: `worker/room-code.test.ts`

- [ ] Add room code helpers.

`worker/room-code.ts` exports:

```ts
export function createRoomCode(): string;
export function normalizeRoomCode(value: string): string | null;
export function parseRoomCodeInput(value: string): string | null;
```

Use six uppercase characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Generate
with `crypto.getRandomValues`. `normalizeRoomCode` handles raw codes and
lowercase input. `parseRoomCodeInput` accepts either raw codes or full invite
links by extracting the `room` query parameter.

- [ ] Add room code tests.

`worker/room-code.test.ts` covers:

- generated codes are six uppercase characters from
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
- lowercase raw input normalizes to uppercase
- full invite links parse the `room` query parameter
- invalid formats return `null`

- [ ] Add Worker binding types.

`worker/types.ts` exports:

```ts
import type { GobangRoom } from "./room-object";

export type Env = {
  ASSETS: Fetcher;
  ROOMS: DurableObjectNamespace<GobangRoom>;
};
```

- [ ] Implement Durable Object WebSocket handling.

`worker/room-object.ts` exports `class GobangRoom`. It should:

- keep an in-memory `OnlineRoomState`
- initialize from `createInitialRoomState`
- accept WebSocket upgrades for valid joins
- serialize the player identity in WebSocket attachment when using hibernation
- call room reducer helpers for every client message
- broadcast `snapshot` after every accepted mutation
- broadcast `notification` for first-version notification events
- close invalid or room-full joins with an error message

- [ ] Implement Worker fetch routing.

`worker/index.ts` should route:

- `POST /api/rooms` creates a room code and returns `{ roomCode, inviteUrl }`
- `GET /api/rooms/:roomCode` validates whether a normalized room code exists
  and is joinable, returning a JSON result used by the join-dialog check button
- `GET /api/rooms/:roomCode/ws?...` upgrades to the room Durable Object
- all other requests fall back to `env.ASSETS.fetch(request)`

Reject non-API unsupported methods with JSON error responses.

The room validation response should distinguish invalid/missing room, room full,
and joinable room so the join dialog can show the right inline result before
opening the WebSocket.

- [ ] Run Worker typecheck.

Run:

```bash
pnpm typecheck
```

Expected: no TypeScript errors from `worker/`.

## Task 5: Add Online Client Storage And WebSocket Hook

**Files:**
- Create: `app/modules/gobang/online-types.ts`
- Create: `app/modules/gobang/online-storage.ts`
- Create: `app/modules/gobang/online-room-client.ts`
- Create: `app/modules/gobang/hooks/use-online-gobang-room.ts`
- Test: `app/modules/gobang/online-storage.test.ts`

- [ ] Define client types.

`online-types.ts` mirrors the protocol types needed by React:

```ts
export type OnlineModeStatus =
  | "idle"
  | "creating"
  | "joining"
  | "connected"
  | "room-full"
  | "disconnected"
  | "error";
```

Also export typed client action functions and snapshot types.

- [ ] Implement local online storage.

`online-storage.ts` uses separate keys:

- `web-gobang-online-profile-v1`
- `web-gobang-online-session-v1`

It exports:

```ts
export function loadOnlineProfile(): OnlineProfile | null;
export function saveOnlineProfile(profile: OnlineProfile): void;
export function loadOnlineSession(roomCode: string): OnlineSession | null;
export function saveOnlineSession(session: OnlineSession): void;
export function clearOnlineSession(roomCode: string): void;
```

Validate JSON with type guards and count nickname length by visible characters
using `Array.from(nickname).length`.

- [ ] Implement WebSocket hook.

`use-online-gobang-room.ts` should:

- create rooms through `POST /api/rooms`
- join by code or invite URL parameter
- build `ws:`/`wss:` URL from `window.location`
- persist nickname and room session locally
- reconnect with existing `playerId` + `sessionToken`
- send heartbeats immediately after WebSocket open, every 1 second while the
  room is `stabilizing`, and every 5 seconds while the room is `playing` or
  `ended`
- expose server timer anchors from snapshots: `startedAt`, `turnStartedAt`, and
  `serverNow`, plus move pause fields `turnPausedAt` and `turnPausedDurationMs`
- expose `placeAt`, `requestUndo`, `respondUndo`, `requestSurrender`,
  `respondSurrender`, and `startNewGame`
- guard outbound action helpers so they do not serialize official gameplay
  messages while the server phase is `stabilizing`; warm-up actions are handled
  before this hook by the local controller
- maintain a notification queue from server events plus local invite-copied
  events

- [ ] Run hook/storage tests.

Run:

```bash
pnpm test -- app/modules/gobang/online-storage.test.ts
pnpm typecheck
```

Expected: storage tests pass and hook types compile.

## Task 6: Add Online Entry And Room Dialog

**Files:**
- Modify: `app/modules/gobang/components/gobang-game.tsx`
- Create: `app/modules/gobang/components/online-room-dialog.tsx`
- Modify: `app/app.css`

- [ ] Make the header logo/title area clickable.

Wrap the current top-left header text in a button with accessible label
`切换联机模式`. It should preserve the existing visual style.

- [ ] Add the online room dialog.

The dialog flow:

- first-time nickname dialog with max 8 visible characters
- after nickname confirmation, close the nickname dialog and open the
  mode-selection dialog
- returning users with a saved nickname open the mode-selection dialog directly
- mode-selection dialog title: `请选择联机方式`
- create-room button text: `创建房间`
- create-room button subtext: `自动复制邀请链接`
- join-room button text: `加入房间`
- join-room button subtext: `需要输入邀请码/链接`
- create room through `POST /api/rooms` after clicking `创建房间`
- attempt to copy returned `inviteUrl` to the clipboard from the create-room
  click flow
- keep invite code and copy-link action visible even when automatic copy fails
- clicking `加入房间` expands the same dialog downward
- join input accepts either room code or invite link
- join input has a single-icon validation button on the right
- valid existing room shows a green check to the right of the icon, waits 1
  second, then enters the room
- invalid format or missing room shows small error text under the input in an
  eye-catching but theme-compatible red
- invite code and copy-link action after room creation
- room-full state for third visitor
- prefill join code from `?room=<code>`
- online player identity rows with avatar, nickname, color, connection state,
  a top-right green/red heartbeat dot, move time, and game time on the right
  side once the server starts the game

Do not add unrequested explanatory desc, separate warm-up/stabilizing labels,
phase banners, helper panels, or duplicate connection-status text. The red/green
dot belongs inside the player information component's top-right corner.

Create a reusable common modal component/style for this work rather than
online-only modal styling. It should provide a unified base size,
glass/frosted panel, blurred backdrop, and smooth iOS-like
enter/exit/expansion motion. Online dialog bodies can vary their internal
button/input layout inside the shared modal frame.

- [ ] Keep local mode default.

On app load without `?room=`, render the current local board unchanged. On app
load with `?room=`, open the nickname/join flow automatically.

- [ ] Run UI typecheck.

Run:

```bash
pnpm typecheck
```

Expected: no TypeScript errors.

- [ ] User review gate: room dialog and player information layout.

Run the dev server, show the user the browser result, and wait for visual
approval or requested adjustments before continuing to later visible UI work.

## Task 7: Integrate Online Board State And Actions

**Files:**
- Modify: `app/modules/gobang/components/gobang-game.tsx`
- Modify: `app/modules/gobang/components/gobang-board.tsx`
- Modify: `app/modules/gobang/hooks/use-gobang-game.ts`

- [ ] Derive a common board controller interface.

`GobangGame` should choose between three controller surfaces but pass the same
`state`, `effects`, and `onPlace` shape into `GobangBoard`:

- local mode: existing persisted local controller
- online `stabilizing`: local in-memory warm-up controller with local move,
  undo, and new-game behavior that never uploads gameplay messages
- online `playing`/`ended`: server-authoritative online controller

- [ ] Route online board input by server phase.

Add an `isInputDisabled` prop to `GobangBoard`. In online `stabilizing`, route
placement, undo, and new game to the local warm-up controller and do not send
gameplay WebSocket messages. Do not treat warm-up as a disabled board; it is a
fully local board with local-only state. In online `playing`, allow official
placement only when:

- online status is connected
- phase is `playing`
- no reset animation is pending
- local player color equals `state.currentPlayer`

- [ ] Wire online undo and surrender/new-game actions.

Online mode:

- during `stabilizing`, undo and new game act only on the local warm-up board
- undo button opens/sends undo request only when server says it is available
- reset button means `新局` before server start and after end
- reset button means `认输` after the server starts the game during unfinished
  play
- move time and game time are hidden/idle until the snapshot includes
  `startedAt` and `turnStartedAt`
- connection dots show green when heartbeat health is good and red when
  heartbeat health fails or the player is disconnected
- do not show visible text such as "warm-up", "stabilizing", "当前正在热身阶段",
  or "热身棋盘"

- [ ] Preserve local behavior.

Local mode keeps current direct undo/new-game behavior and localStorage
persistence.

- [ ] Run tests.

Run:

```bash
pnpm test
pnpm typecheck
```

Expected: existing local game tests still pass.

## Task 8: Add Rolling Label And Notification UI

**Files:**
- Create: `app/modules/gobang/components/rolling-action-label.tsx`
- Create: `app/modules/gobang/components/online-notification-overlay.tsx`
- Modify: `app/modules/gobang/components/gobang-game.tsx`
- Modify: `app/app.css`

- [ ] Implement rolling label component.

`RollingActionLabel` props:

```ts
type RollingActionLabelProps = {
  label: "新局" | "认输";
};
```

Render a fixed-height text viewport with `overflow: hidden`. Animate old text up
and incoming text into place. Keep button dimensions stable.

- [ ] Implement notification overlay.

`OnlineNotificationOverlay` props:

```ts
type OnlineNotificationOverlayProps = {
  notifications: readonly OnlineNotification[];
  onDismiss: (id: string) => void;
};
```

Render newest notification at the fixed base position and older visible
notifications above it. Use `pointer-events: none`.

- [ ] Style notification strips.

CSS requirements:

- black-gray translucent background
- left/right background edge fade
- short left-to-right entry motion around 8 Chinese characters wide
- fade in during entry
- upward float and fade out on exit
- do not render the reserved gold underline style in the current notification
  UI; keep any future-use divider styling inactive/commented

- [ ] Verify responsive clipping.

Use browser inspection or screenshots at mobile and desktop widths. The rolling
button text and notification text must not overflow their UI bounds.

- [ ] User review gate: rolling action label and notification overlay.

Run the dev server, show the user the visible behavior, and wait for approval or
requested adjustments before treating these UI components as final.

## Task 9: Coordinate Reset Animation With Online State

**Files:**
- Modify: `app/modules/gobang/components/gobang-game.tsx`
- Modify: `app/modules/gobang/hooks/use-online-gobang-room.ts`
- Modify: `worker/room-state.ts`
- Test: `worker/room-state.test.ts`

- [ ] Add client reset lock.

When online `新局`, accepted surrender, or ended-game reset
occurs, call `boardRef.current?.playResetAnimation(...)`, lock local input, and
show the empty next board only after the animation delay completes.

- [ ] Make reset idempotent.

Track `gameNumber` from server snapshots. Ignore stale reset completions whose
`gameNumber` does not match the current expected transition.

- [ ] Confirm heartbeat start behavior.

Before the server declares `playing`, official gameplay messages are not sent
from the warm-up board and the backend rejects them if received. Timers remain
hidden/idle and `新局` does not become `认输`. After both players provide 3 valid
heartbeats, the server starts the game; the client forces the local new-game
clear animation over warm-up stones, discards the warm-up state, shows timer
anchors, enables official placement, and rolls the action label to `认输`.

- [ ] Run reset tests.

Run:

```bash
pnpm test -- worker/room-state.test.ts
pnpm test -- app/modules/gobang/components/gobang-board-render.test.ts
```

Expected: room reset tests and existing board render tests pass.

## Task 10: End-To-End Manual Verification

**Files:**
- No README changes. The user's existing README edits are unrelated and should
  be left untouched.

- [ ] Run full quality gate.

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands pass.

- [ ] Run Worker locally.

Run:

```bash
pnpm worker:dev
```

Expected: Wrangler serves the app and Worker API without startup errors.

- [ ] Manual browser checks with two windows.

Verify:

- default local mode still plays
- click title opens online nickname flow for first-time users
- first-time nickname confirmation closes the nickname dialog and opens the
  mode-selection dialog
- returning users with a saved nickname open the mode-selection dialog directly
- mode-selection dialog says `请选择联机方式`
- `创建房间` shows subtext `自动复制邀请链接`
- `加入房间` shows subtext `需要输入邀请码/链接`
- create-host flow obtains a room code through `POST /api/rooms`
- create room displays code and copyable link
- created room attempts to copy the invite link from the user-triggered
  create-room click path
- failed automatic clipboard copy leaves an explicit copy action available
- clicking `加入房间` expands the same dialog downward
- join input accepts both raw room code and full invite link
- valid room check shows a green check beside the icon and joins after 1 second
- invalid format and missing room errors show under the input in theme-matched
  red
- online dialogs use the reusable common modal system with unified base size,
  theme-matched glass/frosted panel, blurred backdrop, and smooth iOS-style
  open/close/expansion motion
- second window joins by code
- second window joins by `?room=CODE`
- third window sees room full
- black/white assignments are clear
- 3 valid heartbeats from each player start the game
- pre-start warm-up moves/undo/new-game are local-only and never affect the
  other window
- pre-start warm-up moves/undo/new-game do not create gameplay WebSocket
  messages in browser network inspection
- forced pre-start gameplay messages, if simulated, are rejected by the Worker
  room reducer without mutating the room
- game start force-clears warm-up stones before showing the official empty board
- game start shows move time and game time next to online player information
- connection status dot flips red on heartbeat failure/disconnect and green on
  recovery
- no extra warm-up/stabilizing explanatory label, banner, or panel appears
- disconnect pauses move time while game time continues
- server start switches button to `认输`
- started `认输` sends request and accepted surrender clears board
- undo request accept/reject/timeout works
- win disables undo and switches button to `新局`
- disconnect/reconnect within 5 minutes reclaims slot
- notification strip events match PRD event list
- rolling button and notification text do not overflow on mobile

- [ ] Commit on `online`.

Run:

```bash
git status --short
git add .
git commit -m "feat: add invite room online gobang"
```

Expected: commit succeeds on branch `online`.

## Rollback Points

- After Task 2, local mode should still pass all tests. If not, revert shared
  extraction before adding Worker code.
- After Task 4, Worker routes should compile independently of frontend online
  UI. If Worker setup blocks local builds, remove `main`/DO bindings and restore
  static assets config.
- After Task 7, local mode is the rollback safety line. If online integration
  destabilizes local play, hide online entry and keep local controller path.

## Validation Summary

Minimum required before requesting final review:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Manual verification with two browser windows is required because WebSocket room
behavior, reset animation timing, and reconnect flows cannot be fully covered by
current unit tests.
