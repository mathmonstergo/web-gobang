# Online room invite multiplayer design

## Overview

The online mode adds a Cloudflare Worker backend and one Durable Object per room
while keeping the current local Gobang screen as the default experience. The
front end remains a single-screen Vite React app. Online play reuses the current
board rendering, reset animation, and pure Gobang rules, but replaces local
state mutation with server-authoritative room messages.

The first implementation should be developed and committed on a branch named
`online`.

## Architecture

```
Browser React app
  - local mode: current useGobangGame hook + localStorage
  - online mode: useOnlineGobangRoom hook + WebSocket client
        |
        | HTTP /api/rooms, WebSocket /api/rooms/:roomCode/ws
        v
Cloudflare Worker
  - serves Vite assets
  - validates API routes
  - resolves room code to Durable Object id
        |
        v
Room Durable Object
  - authoritative room state
  - black/white player assignment
  - WebSocket fan-out
  - move, undo, surrender, reset validation
```

## Runtime Boundaries

- Move pure Gobang rules and rule types into `shared/gobang/` so the React app,
  Worker, and room reducer use one rule source for placement, undo, and win
  detection. Keep app module compatibility re-exports for existing front-end
  imports.
- The Worker owns API/WebSocket routing but not durable room state.
- The Durable Object owns all mutable online room state.
- The browser owns UI animation timing. The server state changes immediately,
  but the client locks input during clear-board animation and sends
  `reset_animation_complete` after the current `gameNumber` animation finishes.
  The server ignores stale reset completions.
- Local mode storage and online session storage use separate localStorage keys.

## Room Identity

Room codes are six-character uppercase invite codes generated from
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The alphabet intentionally excludes visually
confusing characters such as `I`, `O`, `0`, and `1`. The Worker should generate
codes with `crypto.getRandomValues`, retry on collisions, and mark a room as
created inside the Durable Object before returning it to the client.

The Worker maps the room code to a Durable Object using `idFromName(roomCode)`
so the same code always resolves to the same room object.

Created rooms expose:

- `roomCode`
- copyable `inviteUrl`, for example `https://example.com/?room=ABCD12`

Opening a URL with `?room=<code>` uses a direct-join flow. If the current
device already has a saved nickname, the client validates the room and enters it
without showing the mode-selection dialog. If no nickname is saved, the client
shows only the nickname dialog, then validates and enters the invite room
directly. Invalid, missing, or full rooms fall back to the join form with the
room code prefilled and the inline error visible.

Room-code parsing accepts:

- raw codes such as `ABCD12`
- lowercase codes by normalizing to uppercase
- invite links by extracting the `room` query parameter

Invalid format is detected client-side before network validation. Existence and
capacity are checked through a Worker validation route, for example
`GET /api/rooms/:roomCode`, which asks the room Durable Object whether the room
was created and whether it is joinable.

## Room Creation And Invite Copy Flow

Entering online mode has three UI states:

- nickname dialog, shown only when no nickname is saved
- mode-selection dialog, shown after nickname confirmation or immediately for a
  returning device with a saved nickname
- joined room view

Nickname flow:

1. Show the nickname dialog when no nickname is saved.
2. The user enters a nickname with the 8-visible-character limit.
3. Confirmation stores the nickname locally, closes the nickname dialog, and
   opens the mode-selection dialog.

Mode-selection dialog:

- title: `请选择联机方式`
- primary action: `创建房间`, with smaller subtext `自动复制邀请链接`
- secondary action: `加入房间`, with smaller subtext `需要输入邀请码/链接`

Create-room flow:

1. Clicking `创建房间` calls `POST /api/rooms`.
2. The Worker returns `{ roomCode, inviteUrl }`.
3. The client attempts `navigator.clipboard.writeText(inviteUrl)` immediately
   from that user-triggered click.
4. The client opens the created room as the host regardless of copy success.

The browser Clipboard API is not reliable for passive writes that happen without
recent user activation, especially on page load, automatic reconnect, or
permission-restricted contexts. The implementation should therefore treat
automatic copy as best-effort and user-gesture-bound. If copy fails, the invite
link remains visible and the explicit copy button can retry from a direct click.

Join flow:

1. Clicking `加入房间` expands the same mode-selection dialog downward.
2. The expanded area shows an input for either invite code or invite link.
3. A single-icon validation button sits on the right side of the input.
4. If the input format is invalid, show small error text under the input.
5. If format is valid, the icon button calls the room validation route.
6. If the room exists and is joinable, show a green check to the right of the
   icon and join after 1 second.
7. If the room does not exist or is full, show small error text under the input
   in a red that is visually clear but still belongs to the app theme.

Join flow never creates a replacement host room and never auto-copies a new host
invite link. It only uses the provided room code/link. Successful invite-link
direct joins should not emit a local "room created" notification.

Invite-link direct join:

1. Saved nickname exists: validate the invite room immediately and connect if
   it is joinable.
2. No saved nickname: show the nickname dialog; after confirmation, validate
   the invite room and connect if it is joinable.
3. Validation failure: open the mode-selection dialog with the join panel
   expanded, the invite code prefilled, and the inline error shown.

## Player Identity

The client generates and stores:

- `playerId`: random stable id for this browser
- `sessionToken`: random secret for reclaiming that player's room slot
- `nickname`: last nickname on this device, max 8 visible characters

The room stores player records for the active room lifetime:

```ts
type OnlinePlayer = {
  playerId: string;
  sessionTokenHash: string;
  nickname: string;
  avatarInitial: string;
  avatarColor: string;
  color: "black" | "white";
  isConnected: boolean;
  isHeartbeatHealthy: boolean;
  disconnectedAt: number | null;
};
```

No server-side long-term nickname/profile persistence is included in the first
version. D1, KV, and R2 are not needed for nickname storage.

## Room State

```ts
type OnlineGamePhase =
  | "waiting"
  | "stabilizing"
  | "playing"
  | "ended"
  | "resetting";

type OnlineEndReason =
  | { type: "win"; winner: "black" | "white" }
  | { type: "surrender"; winner: "black" | "white"; surrenderedBy: "black" | "white" };

type PendingRoomRequest =
  | {
      type: "undo";
      requestId: string;
      requestedBy: "black" | "white";
      targetMoveTurn: number;
      expiresAt: number;
    }
  | {
      type: "surrender";
      requestId: string;
      requestedBy: "black" | "white";
      expiresAt: number;
    };

type OnlineRoomState = {
  roomCode: string;
  isCreated: boolean;
  players: Partial<Record<"black" | "white", OnlinePlayer>>;
  heartbeats: Partial<Record<"black" | "white", PlayerHeartbeatState>>;
  game: GameState;
  phase: OnlineGamePhase;
  endReason: OnlineEndReason | null;
  pendingRequest: PendingRoomRequest | null;
  gameNumber: number;
  startedAt: number | null;
  turnStartedAt: number | null;
  turnPausedAt: number | null;
  turnPausedDurationMs: number;
  lastActivityAt: number;
};

type PlayerHeartbeatState = {
  generation: number;
  validCount: number;
  lastHeartbeatAt: number | null;
};
```

## Phase Rules

- `waiting`: fewer than two connected/reconnectable player slots exist.
- `stabilizing`: two player slots exist, but the room is waiting for stable
  heartbeats from both players before starting the game. The official room board
  remains empty and all gameplay mutations are rejected by the backend.
- `playing`: the Durable Object has declared the game started after both
  players sent at least 3 valid heartbeats for the current `gameNumber`.
- `ended`: the game ended by win or accepted surrender. Undo is disabled.
- `resetting`: the board is being visually cleared on clients. The server can
  already prepare the next empty `GameState`, but clients must reject local
  board input until the reset animation finishes.

The online game is considered started only when the room transitions from
`stabilizing` to `playing`. On that transition, the server sets `startedAt` and
`turnStartedAt` to the same server timestamp and emits a game-started
notification.

## Stabilizing Warm-Up Board

During `stabilizing`, the front end shows a local warm-up board so players can
tap around while waiting for the server start signal. This board behaves like the
single-player board for local moves, undo, and new game, but it is not persisted
to local mode storage and it never sends gameplay actions to the server.

This is implemented as explicit front-end routing, not as a visually disabled
board. While `phase === "stabilizing"`, board placement, undo, and `新局` go only
to the warm-up controller. The online WebSocket client may still send
join/reconnect and heartbeat traffic, but it must not serialize `place`,
`request_undo`, `request_surrender`, or `start_new_game` for warm-up actions.

The Durable Object must reject official gameplay mutations while the room is not
`playing`:

- `place`
- `request_undo`
- `request_surrender`
- `start_new_game`

Those rejects are a backend safety net. They must return a non-mutating error
path and must not advance turns, change pending requests, start timers, or alter
`gameNumber`.

When the server transitions to `playing`, the client treats the game-started
snapshot as a forced local `新局`: it plays the existing clear-board animation
using any warm-up moves, discards the warm-up state, switches to the empty
server-authoritative board, shows timers, and rolls the action label to `认输`.

## Heartbeats And Timers

The client sends an application heartbeat over the room WebSocket. The Durable
Object tracks heartbeat counts per player and game generation.

Recommended first-version timing:

- while `phase === "stabilizing"`, send a heartbeat immediately after the socket
  opens and then every 1 second
- after `phase === "playing"`, send heartbeats every 5 seconds for liveness
- a heartbeat is valid for start detection when it belongs to the current
  `gameNumber` and the player is connected to their assigned color slot
- the game starts when both black and white have `validCount >= 3`

The server owns timer anchors:

- `startedAt`: set when the game starts
- `turnStartedAt`: set when the game starts and reset after every accepted move

The client renders:

- game time as `clientNow - startedAt`
- move time as `clientNow - turnStartedAt - turnPausedDurationMs` for the
  current turn

When any player disconnects after the game has started:

- game time continues to count real elapsed time
- move time pauses
- the Durable Object sets `turnPausedAt` if it was not already set

When all required players are connected again:

- the Durable Object adds `now - turnPausedAt` to `turnPausedDurationMs`
- `turnPausedAt` returns to `null`
- move time resumes from the paused value

Timer rendering should use server timestamps from snapshots.

Each online player information component shows a top-right connection dot:

- green when that player is connected and heartbeat-healthy
- red when that player is disconnected or heartbeat health has failed

Heartbeat health is separate from WebSocket open/close so the UI can turn red
after missed application heartbeats even before the socket formally closes.

## UI Scope And Review Gates

Online UI additions are limited to the already agreed surfaces:

- online room dialog
- player information rows with avatar, nickname, color, timers, and the
  top-right red/green connection dot
- rolling `新局`/`认输` action label
- transient notification overlay

Do not add unrequested explanatory desc, standalone phase banners, helper
panels, implementation-state labels, or duplicate connection-status text.
During `stabilizing`, the user should only experience the existing board as
locally playable, with timers hidden and the action button still showing `新局`.
Allowed visible text is limited to labels and values required by agreed
components: nickname input, mode-selection title and actions, create/join button
subtext, room code/link controls, player names/colors, timers, button labels,
transient notifications, and browser/API error states that block progress.

Dialogs should use a reusable common modal system rather than online-only
one-off styling. The common modal provides the fixed/base dialog size,
frosted/glass panel, blurred backdrop, theme-matched color and typography, and
smooth iOS-like enter/exit motion for every dialog open, close, and expansion.
Individual dialog bodies can vary button/input layout inside that shared frame.
The join form expansion should animate as part of the same panel rather than
appearing as a separate card. Error text inside the modal uses a saturated
theme-compatible red so validation failures are easy to notice without breaking
the visual system.

UI work should be reviewable in small pieces. After a visible component is
implemented and can be inspected in the browser, pause for user review before
moving to the next substantial visible component. Expect iterative adjustment
instead of assuming the first visual pass is final.

## Move Rules

The client sends only the requested board position. The Durable Object validates:

- sender is seated as black or white
- both player slots exist
- room phase is `playing`
- sender color equals `game.currentPlayer`
- no clear animation lock blocks input
- `placeStone` accepts the move

After a successful move:

- cancel pending undo or surrender requests
- update `game`
- reset `turnStartedAt` to the server timestamp of the accepted move
- reset `turnPausedAt` to `null` and `turnPausedDurationMs` to `0` for the new
  move timer
- set `phase` to `ended` when a win is detected
- broadcast the full room snapshot and a move event

## Undo Rules

Undo is request-based:

- only the player who made the latest move can request undo
- undo is allowed only before the opponent places another stone
- undo is not allowed after `phase === "ended"`
- one pending request per room
- request expiry is represented by `expiresAt`, not a long-running server timer

Accepting undo:

- verifies the responder is the opponent
- verifies `Date.now() <= expiresAt`
- verifies the latest move still matches `targetMoveTurn`
- applies `undoMove`
- keeps `phase` as `playing` unless undo produces a terminal edge case that
  should be rejected by validation
- resets `turnStartedAt` to the server timestamp of the undo acceptance
- clears `pendingRequest`
- broadcasts the new snapshot and an undo accepted notification

Rejecting or expiring undo clears only the pending request.

## Surrender And New Game Rules

The reset control is state-driven:

- before the server starts the game, label is `新局` but surrender is not
  available
- during a started unfinished game, label is `认输`
- after win/surrender/end, label is `新局`

Stabilizing-phase `新局`:

- is local-only on the warm-up board
- clears local warm-up stones with the existing clear-board animation
- does not upload to the server and does not change room state

Playing-phase `认输`:

- sends a surrender request to the opponent
- opponent has 10 seconds to accept or reject
- accepting immediately triggers the same clear-board animation as `新局`
- the accepted surrender records `endReason` with the requester as loser
- after animation, both clients enter the next empty `stabilizing` game and wait
  for the server's heartbeat-based start

Ended-phase `新局`:

- either player can start next game without opponent confirmation
- uses the existing clear-board animation
- after animation, both clients enter next empty `stabilizing` game and wait for
  the server's heartbeat-based start

## Room Capacity And Reconnect

Only two player slots exist. If both black and white slots are occupied by
connected or reconnectable players, new join attempts fail with `room-full`.

Disconnected player slots are preserved for 5 minutes:

- same `playerId` + valid `sessionToken` can reclaim the original color
- opponent sees a disconnected waiting state
- after 5 minutes, the room may release the slot or expire the room

Spectator mode and seat switching are out of scope.

## WebSocket Protocol

Messages are JSON discriminated unions. Unknown or invalid messages are rejected
with an error event and must not mutate room state.

Client to server:

```ts
type ClientMessage =
  | { type: "place"; row: number; col: number }
  | { type: "heartbeat"; gameNumber: number; sentAt: number }
  | { type: "request_undo" }
  | { type: "respond_undo"; requestId: string; accept: boolean }
  | { type: "request_surrender" }
  | { type: "respond_surrender"; requestId: string; accept: boolean }
  | { type: "start_new_game" }
  | { type: "reset_animation_complete"; gameNumber: number };
```

During `stabilizing`, well-behaved clients send only heartbeat/session traffic.
If a client sends an official gameplay message anyway, the Durable Object returns
an error such as `not-playing` and leaves `OnlineRoomState` unchanged.

Server to client:

```ts
type ServerMessage =
  | { type: "snapshot"; state: OnlineRoomClientState }
  | { type: "notification"; event: OnlineNotificationEvent; text: string }
  | { type: "error"; code: OnlineErrorCode; message: string };
```

The snapshot is the source of truth for board, players, phase, pending request,
and reconnect state. Event messages are for UI effects and can be dropped
without corrupting gameplay.

## Notification Events

First-version notification events:

- opponent joined
- opponent disconnected
- opponent reconnected
- undo requested
- undo accepted
- undo rejected
- undo expired
- surrender requested
- surrender accepted
- surrender rejected
- surrender expired
- game started
- room full
- invite link copied
- new game started

The front-end notification overlay is non-interactive (`pointer-events: none`).
Each strip:

- appears near the board center area
- enters by moving about the width of 8 Chinese characters from left to right
- fades in during entry
- has a black-gray translucent background with left/right edge fade
- does not render the reserved gold underline style in the current notification
  UI
- floats upward and fades out on dismissal

New notifications appear at a fixed latest-message position and push older
visible notifications upward.

## Reset Button Label Animation

The reset button contains a fixed-size label viewport with `overflow: hidden`.
Two labels are stacked vertically and animated with `translateY`.

- `新局 -> 认输`: outgoing `新局` rolls upward out of view, incoming `认输`
  rises into place.
- `认输 -> 新局`: outgoing `认输` rolls upward out of view, incoming `新局`
  rises into place.
- Text must remain clipped inside the button bounds for the full animation.
- The button width must be stable across both labels.

## Frontend Components And Hooks

New or changed front-end units:

- `GobangGame`: owns mode switching between local and online.
- `useOnlineGobangRoom`: owns room creation, join, WebSocket lifecycle,
  incoming snapshots, outbound actions, reconnect, and local session storage.
- `online-room-client.ts`: typed fetch/WebSocket helpers.
- `online-storage.ts`: local nickname and online session storage.
- `online-types.ts`: client-facing protocol and UI state types.
- `online-notification-overlay.tsx`: notification rendering and queue.
- `rolling-action-label.tsx`: reset/surrender button label animation.
- `online-room-dialog.tsx`: nickname, create room, join room, invite URL, and
  room-full flows.

## Worker And Durable Object Units

New backend units:

- `worker/index.ts`: Worker fetch entry, API routing, assets fallback.
- `worker/types.ts`: binding, request, response, protocol types.
- `worker/room-object.ts`: Durable Object class and WebSocket handlers.
- `worker/room-state.ts`: pure room reducer/helpers for joins, moves, undo,
  surrender, reset, reconnect expiration.
- `worker/room-code.ts`: invite code generation and validation.

The room reducer should be tested without WebSocket infrastructure.

## Cloudflare Free Account Constraints

Design choices to keep free-tier usage small:

- no D1/KV/R2 dependency for first-version gameplay or nickname persistence
- room state is owned by the Durable Object and snapshotted to Durable Object
  storage for small authoritative state that must survive object instance
  recreation, including room creation, player slots, reconnect state, board
  state, pending requests, and timer anchors
- 10-second request expiry uses timestamps checked on interaction/snapshot,
  not long-running timers
- use WebSocket Hibernation API where practical
- no chat, spectators, rankings, or match history

## Testing Strategy

Unit tests:

- game phase changes from `stabilizing` to `playing` only after both players
  have at least 3 valid heartbeats
- placement is rejected before `playing`
- playing surrender creates a pending request and accepted surrender starts the
  next stabilizing game
- undo request acceptance validates latest move turn
- room-full join rejection
- Durable Object room creation state survives object instance recreation through
  Durable Object storage snapshots
- invite-link entry chooses direct join when a nickname is already saved, and
  nickname-first direct join when no nickname is saved
- 5-minute reconnect slot preservation and expiry
- timer anchors are set on heartbeat-based game start and turn start resets
  after accepted moves
- notification queue ordering and push-up behavior

Integration/manual checks:

- two browser windows can create/join by room code and invite link
- opening an invite link enters directly after nickname confirmation and skips
  the mode-selection dialog when the room is joinable
- opening an invite link with a saved nickname enters directly without showing a
  dialog when the room is joinable
- third browser sees room full
- refresh reconnect works inside 5 minutes
- button label animation clips text
- notification strip animation stays over the board without blocking controls

## Rollout And Rollback

Rollout is additive. Local mode remains the default path. If online mode has a
deployment problem, disable the logo/title online entry and keep the existing
local game operational.

Rollback should revert Worker/Durable Object bindings and online-mode UI while
leaving local Gobang files intact.
