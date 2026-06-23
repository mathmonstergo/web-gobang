# Online gameplay polish and timers design

## Scope

This task changes the online room state machine, online protocol, timer model,
and the Gobang front-end orchestration around existing board animations. It
does not add spectators, persistent match history, ranking, chat, or extra
front-end explanatory copy.

## Backend State Machine

Current state uses `stabilizing` as an automatic pre-play phase: after both
players send three valid heartbeats, `receiveHeartbeat` transitions the room to
`playing`. Replace that behavior with an explicit start flow:

- `waiting`: fewer than two occupied player slots.
- `stabilizing`: two player slots exist; heartbeats are collected.
- `playing`: an official game is active.
- `ended`: an official game ended by win or timeout and still shows the final
  board until someone starts the next game.
- `resetting`: remains available in the type system but is not required for the
  first implementation.

Heartbeats only update per-player heartbeat state and connection health. A
snapshot exposes a derived `canStart` boolean when:

- the phase is `stabilizing` or `ended`;
- both players are connected;
- both players have at least three valid heartbeats for the current
  `gameNumber`.

The primary online action sends a new official start message only when
`canStart` is true. Starting from `stabilizing` begins the first official game.
Starting from `ended` increments `gameNumber`, resets the board, and begins the
next official game. Accepted surrender remains a reset-to-`stabilizing` flow so
the board clears immediately and the next official game still requires pressing
`开始`.

## Random Seat Assignment

Official black/white assignment happens only on the server as part of the start
mutation. The Durable Object passes a random value into the room-state reducer;
the reducer uses it to choose which connected player becomes black for that
game and rewrites `state.players.black` / `state.players.white`, including each
`OnlinePlayer.color` value.

This makes reconnection and viewer-color checks continue to work because
`findPlayerColor` always looks up the current keyed player slot. Tests should
pass deterministic random values to the reducer instead of depending on
runtime randomness.

After a successful start, the Durable Object sends each connected socket a
targeted `notification` using the viewer's new color:

- black viewer: `你本局随机为黑棋`
- white viewer: `你本局随机为白棋`

Do not add a second visible "warm-up" or "stabilizing" message.

## Countdown Clocks

Use server-authoritative chess-clock style countdowns:

- move limit: 45 seconds per turn;
- game limit: 10 minutes total per player;
- only the current player's move clock and total game clock tick;
- disconnects do not pause any active clock.

Add an `OnlinePlayerClock` contract to shared protocol data, for example:

```ts
type OnlinePlayerClock = {
  stepRemainingMs: number;
  gameRemainingMs: number;
};
```

Store clocks keyed by player color in `OnlineRoomState`. `turnStartedAt` remains
the active turn anchor for compatibility and snapshot derivation, but
`turnPausedAt` / `turnPausedDurationMs` stop participating in online timing.
They can remain in the persisted state with neutral values to avoid a wider
migration.

On official game start:

- both players receive `stepRemainingMs = 45_000`;
- both players receive `gameRemainingMs = 600_000`;
- black is the first current player because Gobang rules start black;
- `turnStartedAt = now`.

Before accepting any playing-phase mutation, run timeout normalization with the
current server time:

1. Compute elapsed time for `state.game.currentPlayer` from `turnStartedAt`.
2. If elapsed reaches the current player's step remaining time, end the game
   with timeout loss.
3. If elapsed reaches the current player's total remaining time, end the game
   with timeout loss.
4. Otherwise continue with the requested mutation.

On a legal move:

- subtract elapsed time from the moving player's total clock;
- reset the moving player's step clock to 45 seconds for their next turn;
- if the move wins, enter `ended`;
- otherwise set `turnStartedAt = now` for the next player.

On undo acceptance, remove the latest move with existing game logic and reset
the active player's turn anchor at `now`. Keep the clock model simple for this
iteration: undo does not refund consumed time. This avoids a move-by-move clock
history and keeps the request feature bounded.

Timeout end reasons should extend `OnlineEndReason`, for example:

```ts
type OnlineEndReason =
  | { type: "win"; winner: OnlinePlayerColor }
  | { type: "surrender"; winner: OnlinePlayerColor; surrenderedBy: OnlinePlayerColor }
  | { type: "timeout"; winner: OnlinePlayerColor; timedOutBy: OnlinePlayerColor; clock: "step" | "game" };
```

The Durable Object should apply timeout normalization on heartbeat and gameplay
messages. In active games, keep heartbeat frequency near one second so the
opponent's client can drive timeout detection without Durable Object cron or
alarms. If both clients disconnect, no user is watching the timeout; the next
room activity can still normalize the state.

## Protocol And Client Helpers

Protocol additions:

- `OnlineRoomClientState.canStart: boolean`
- `OnlineRoomClientState.clocks: Partial<Record<OnlinePlayerColor, OnlinePlayerClock>>`
- `ClientMessage` start action, preferably `start_game`
- timeout `OnlineEndReason`

Client hook changes:

- expose `startGame()` instead of relying on `startNewGame()` language;
- serialize start only when `snapshot.canStart` is true;
- keep placement/undo/surrender serialization restricted to `playing`;
- send `reset_animation_complete` as best-effort only.

Existing `start_new_game` can be replaced or kept as a compatibility alias, but
the UI should use start semantics and the button label `开始`.

## Front-End Board Orchestration

The board already has imperative animation handles:

- `playUndoAnimation(move)`
- `playResetAnimation(moves, origin)`

Add snapshot-diff helpers around authoritative online state:

- accepted undo: same `gameNumber`, move count decreases by one, and the new
  move list equals the old list without the last move. Play cat swat for the
  removed move.
- official reset/new start: `gameNumber` increases and the current official
  board is empty while the previous authoritative board had moves. Play reset
  animation from previous official moves and keep a short visual lock.
- official start from local warm-up: previous snapshot was not `playing`, new
  snapshot is `playing`, and the local warm-up board has moves. Play reset
  animation from warm-up moves before showing the official empty board.

The current reset flash is caused by drawing the old `state.moves` while
non-activated reset physics copies are also being drawn, and then hiding /
activating copies after the base board has already rendered for that frame. Keep
the existing project rule that reset stones remain visible at their board
intersections until the shockwave reaches them:

- reset physics copies carry their source move key;
- non-activated reset physics copies are not drawn;
- the physics update runs before the base move drawing step;
- when a reset copy becomes activated, its source move key is added to
  `hiddenKeysRef` before base stones are drawn in that frame;
- activated physics copies then draw the departing stones.

This preserves the shockwave handoff while preventing duplicate old stones from
flashing at their original intersections.

Keep local single-player reset behavior unchanged from the user's point of
view: local state still resets immediately after snapshotting, and the copied
stones animate away.

## Online UI Layout

Move `OnlinePlayerStatusPanel` out of the header status area and render it in a
stable block below the primary controls:

```tsx
<div className="online-controls-stack">
  <div className="controls">...</div>
  {onlineSnapshot !== null ? <OnlinePlayerStatusPanel snapshot={onlineSnapshot} /> : null}
</div>
```

The header keeps only the logo and online room chip in online mode. Local mode
keeps the existing black/white turn pill.

The online status panel should remain mounted whenever an online snapshot
exists, not only when `startedAt !== null`. Before official start, cards may
show player identity and connection dot without timer copy. After official
start, each card shows that player's own step/game countdown. The active
player card receives the existing current-turn visual treatment.

Button labels:

- local mode: `新局`
- online `playing`: `认输`
- online non-playing phases: `开始`

The rolling label component should support `开始`, `认输`, and `新局`, with the
same overflow-hidden slot-machine animation.

## Compatibility And Migration

Persisted Durable Object states may not contain `clocks` or `canStart`.
`normalizeRoomState` should fill missing clock fields with neutral defaults and
derive `hasEnteredPlaying` as it already does. Older rooms that are pre-play
still expire through the existing ten-minute lazy cleanup path.

Do not introduce D1, KV, R2, cron, or a global room index for this task. The
room remains a single Durable Object per room code.

## Testing

Backend tests should cover:

- heartbeats no longer auto-start;
- `canStart` becomes true after three heartbeats per player;
- start rejects before `canStart`;
- start randomizes player colors deterministically in reducer tests;
- targeted start notifications include the assigned color text;
- disconnect does not pause clocks;
- step timeout and game timeout produce the expected winner and end reason;
- accepted surrender still clears to the next stabilizing game.

Frontend tests should cover:

- start message serialization only when `canStart` is true;
- online status models show per-player countdowns;
- undo snapshot diff identifies the removed move for cat animation;
- reset snapshot diff does not use stale previous-game moves;
- rolling label accepts `开始`.

Full verification remains `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
`pnpm build`, followed by a two-client browser smoke test when local Worker dev
is available.
