# Fix online gameplay regressions design

## Root Cause Summary

| Symptom | Evidence | Root cause |
| --- | --- | --- |
| No official start/end/request notifications | `GobangRoom` only calls `broadcastSnapshot`; `notification` messages are parsed on the client but never emitted by the server for gameplay events. | Server mutations lack event derivation and fan-out. |
| Online placement effects missing | `GobangGame` calls `deriveEffects(onlineSnapshot.game, null)`. | Authoritative snapshots replace the board without generating a placement effect for the newly added move. |
| Opponent-color hover preview | `GobangBoard.drawHoverStone` draws `state.currentPlayer`; online state current player changes to opponent after local move. | Board preview is tied to game-rule turn state instead of viewer color / placement eligibility. |
| No player identity/timer UI | `GobangGame` still renders one local-mode `status-pill`; player data exists in `snapshot.players`. | Planned online player component was not implemented. |
| New-game/reset animation missing on opponent | `startNewGame` / accepted surrender immediately create next empty game state and broadcast snapshot. | Reset animation is local-only and not coordinated through an online reset transition. |
| Undo/surrender buttons appear inert | `pendingRequest` exists in snapshots, but `GobangGame` has no accept/reject modal or visible request controls. | Request-response UI is missing. |
| Closed pre-play rooms stay full | `expireDisconnectedSlots` exists, but `/status` returns `getRoomJoinability(this.roomState)` directly and room state has no "ever reached playing" marker. | Cleanup is not run on validation paths, and never-started rooms have no expiry contract. |

## Room Expiry And Cleanup

Do not use a global cron to clean room Durable Objects. A cron would need a
separate index of room codes in KV/D1 before it could find rooms, which adds
write paths and periodic scans for a problem that only matters when someone
tries to validate or join a room.

Use request-driven cleanup instead:

- Add `createdAt` and `hasEnteredPlaying` to `OnlineRoomState`.
- Normalize older stored states when loading from Durable Object storage:
  `createdAt` falls back to `lastActivityAt`, and `hasEnteredPlaying` is true if
  the stored phase is `playing` / `ended` or `startedAt` is non-null.
- Mark `hasEnteredPlaying: true` when stable heartbeats first transition a game
  to `playing`. Do not reset it when a later new game returns to `stabilizing`.
- Add `cleanupRoomStateForAccess(state, now)` in `room-state.ts`. It should run
  `expireDisconnectedSlots` first, then expire created rooms that are still
  pre-playing and have never reached `playing` after ten minutes.
- Run that cleanup before `/status`, before WebSocket join, and before applying
  client messages.

When a never-started room expires, reset the stored state to a fresh
not-created room for the same room code and persist it. `/status` should return
`not-found`, and `/ws` should reject with `room-not-created`. This clears stale
full rooms without waking idle rooms.

If proactive storage cleanup ever becomes necessary, prefer a one-shot Durable
Object alarm scheduled for `createdAt + 10 minutes` over a global cron. The
alarm would check the same `hasEnteredPlaying` rule and delete/reset only that
room. That should be treated as an operational optimization, not required for
join correctness.

## Backend Event Contract

Add an internal mutation event layer in `worker/room-object.ts` around
`applyClientMessage`:

```ts
type RoomMutationEvent =
  | { type: "game-started" }
  | { type: "game-ended"; reason: OnlineEndReason }
  | { type: "new-game-started" }
  | { type: "undo-requested"; requestedBy: OnlinePlayerColor }
  | { type: "undo-accepted" }
  | { type: "undo-rejected" }
  | { type: "surrender-requested"; requestedBy: OnlinePlayerColor }
  | { type: "surrender-accepted" }
  | { type: "surrender-rejected" }
  | { type: "opponent-joined"; color: OnlinePlayerColor }
  | { type: "opponent-disconnected"; color: OnlinePlayerColor }
  | { type: "opponent-reconnected"; color: OnlinePlayerColor };
```

The Durable Object should derive events by comparing the previous room state and
next room state after each join/message/close. It then sends targeted
`notification` messages before or after snapshot broadcast. Error messages stay
as `error`.

Request timeouts can remain timestamp-based for this task. If no message is
processed after expiry, the request will not auto-disappear until the next room
activity. The UI can display remaining time from `expiresAt`.

## Online Snapshot Effects

Add a small front-end helper/hook that compares the previous authoritative
snapshot with the next one:

- If same `gameNumber` and move count increased by exactly one, create a
  `PlacementEffect` for the new latest move.
- If move count decreases by one after accepted undo, play the existing undo
  animation for the removed move and create a replay-only placement effect for
  the restored latest move if needed.
- If game status changed to won, preserve the placement effect for the winning
  move so victory waves can originate correctly.
- If game number increased or move count dropped to zero because of reset, play
  reset animation against the previous moves before swapping visually to the
  empty authoritative board.

This should live outside `GobangBoard` so the canvas remains a rendering surface
with imperative animation handles.

## Reset Transition

Keep the backend authoritative, but make the front end delay visual adoption of
an empty next-game snapshot while reset animation is playing:

1. Detect server snapshot transition from moves present to empty board with a
   higher `gameNumber`, or a phase/new-game signal that implies reset.
2. Call `boardRef.current.playResetAnimation(previousMoves, origin)`.
3. Keep rendering the previous visual game during the short interaction lock.
4. After the animation delay, render the new snapshot and clear pending lock.
5. Send `reset_animation_complete(gameNumber)` best-effort after the local
   animation starts or completes. The current server ignores stale completions,
   so this is safe.

The actor who clicked new game can still use the same path; remove special local
reset behavior that only animates one client.

## Board Preview

Extend `GobangBoard` props:

```ts
previewPlayer?: Player | null;
isPlacementEnabled?: boolean;
```

Use `previewPlayer` for hover/touch preview drawing. Hide preview when
`isPlacementEnabled` is false. Local mode passes `state.currentPlayer`.
Online mode passes `viewerColor` only when the authoritative phase is `playing`
and `viewerColor === state.currentPlayer`; otherwise null.

This prevents opponent-color ghost stones while preserving local behavior.

## Online Player Status UI

Replace the single local status pill only when online room data is available.

Component responsibilities:

- Render black and white player cards from `snapshot.players`.
- Show circular avatar initial and nickname.
- Show a visual turn state with black/white themed background instead of text
  like "black turn".
- Show a top-right green/red dot from `isConnected` and
  `isHeartbeatHealthy`.
- After `startedAt` exists, show move time and game time in a smaller second
  line.
- Use the snapshot `serverNow` plus local ticking to keep times moving without
  waiting for every snapshot.

No warm-up/stabilizing explanatory label should be added.

## Request UI

Use the existing `CommonModal` for undo/surrender target prompts:

- If `snapshot.pendingRequest` is for the opponent, show a modal with accept and
  reject actions.
- If the current player requested it, rely on notification feedback and disable
  duplicate request buttons while pending.
- The modal should close when the pending request disappears or the game phase
  changes.

Button behavior:

- Undo button sends `request_undo` only when the latest move belongs to viewer.
- Surrender button sends `request_surrender` during `playing`.
- Accept/reject buttons send the matching `respond_*` message.

## Testing Strategy

- Backend reducer tests for event derivation and reset transition markers.
- Front-end helper tests for snapshot diff -> placement effect/reset animation
  decisions.
- Hook tests for `createOfficialClientMessage` pending request behavior and
  preview eligibility helpers.
- Component-independent tests for timer formatting/player card derivation.
- Full `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.
