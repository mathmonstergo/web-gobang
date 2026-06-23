# Online gameplay polish and timers implementation plan

## Order

1. Backend protocol and reducer tests first
   - Extend protocol types for `canStart`, per-player clocks, `start_game`, and
     timeout end reasons.
   - Update `room-state.test.ts` so stable heartbeats keep the room in
     `stabilizing` and expose start readiness instead of auto-playing.
   - Add tests for rejecting start before readiness and accepting start after
     readiness.
   - Add deterministic randomization tests that prove either user can become
     black/white when the server starts the official game.
   - Replace the disconnect-pause test with a test that clocks continue after
     disconnect.
   - Add step-timeout and game-timeout tests.

2. Backend reducer implementation
   - Add countdown constants: 45 seconds per move, 10 minutes total per player.
   - Add room-state clock normalization for persisted states missing new clock
     fields.
   - Change `receiveHeartbeat` so it never transitions to `playing`; it only
     updates heartbeat health and timeout-normalizes active games.
   - Add `canStartGame(state)` / `toClientState(...).canStart`.
   - Add `startGame(state, playerId, now, randomValue)` for
     `stabilizing`/`ended`.
   - Add server-side timeout normalization before playing mutations and on
     heartbeat.
   - Remove active timing use of `turnPausedAt` / `turnPausedDurationMs`.

3. Durable Object messages and notifications
   - Update `ClientMessage` parsing for `start_game`.
   - Have `GobangRoom` provide deterministic random input to `startGame`.
   - Emit targeted start notifications with `你本局随机为黑棋` /
     `你本局随机为白棋`.
   - Emit timeout/game-ended notifications when timeout normalization changes
     phase to `ended`.
   - Keep existing join/disconnect/request notifications.
   - Update `room-object.test.ts` for explicit start and targeted assignment
     text.

4. Frontend protocol mirrors and hook helpers
   - Update `OnlineRoomSnapshot` with `canStart` and clock fields.
   - Rename/add hook action `startGame()` while keeping internals simple.
   - Update `createOfficialClientMessage` tests: start serializes only when
     `snapshot.canStart` is true; placement/undo/surrender stay playing-only.
   - Keep heartbeat interval fast enough in `playing` to drive timeout
     normalization without Durable Object alarms.

5. Online timer display model
   - Update `online-player-status.ts` tests for per-player countdowns.
   - Derive each player's effective remaining step/game time from
     `snapshot.clocks`, `snapshot.game.currentPlayer`, `snapshot.turnStartedAt`,
     and effective server time.
   - Show timer copy only when official clocks exist and the game has started.
   - Preserve current connection dot and turn-card styling.

6. Snapshot animation helpers
   - Add tests for accepted online undo diff returning the removed move.
   - Add tests that reset diff is keyed by current `gameNumber` and does not
     replay stale previous-game moves.
   - Add helper for official start from local warm-up if needed by
     `GobangGame`.

7. Board animation handoff fix
   - Give reset physics copies their source move key.
   - Do not draw non-activated reset physics copies.
   - Run reset physics activation before base move drawing and hide activated
     source move keys before drawing base stones for that frame.
   - Verify single-player reset still keeps stones visible until the wave
     reaches each copy.

8. `GobangGame` integration
   - Use server board only for official `playing`/`ended` or active online reset
     visuals; keep local warm-up board before official start.
   - On accepted online undo diff, call `boardRef.current.playUndoAnimation`.
   - On online reset/new-start diff, call `playResetAnimation` and keep visual
     state only for the lock duration.
   - On official start from warm-up with local stones, play a local reset
     animation before visually adopting the official empty board.
   - Change online primary action to `开始` outside playing and `认输` during
     playing.
   - Disable online `开始` until `snapshot.canStart`.
   - Keep warm-up reset/undo local-only and prevent server from accepting
     official place/undo/surrender before `playing`.

9. UI layout and styling
   - Move `OnlinePlayerStatusPanel` below controls.
   - Render the online player panel whenever an online snapshot exists, not
     only after `startedAt`.
   - Keep the header logo and online room chip on one row where possible.
   - Extend `RollingActionLabelValue` to include `开始`.
   - Avoid adding visible warm-up/stabilizing explanatory text.

10. Verification
   - `pnpm test`
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm build`
   - Start the local dev/Worker harness using the existing documented method.
   - Browser smoke test two online clients:
     - join same room;
     - confirm start button disabled before readiness and enabled after
       heartbeats;
     - click start and verify random-color notification;
     - place a move and verify effect/preview;
     - accept undo and verify cat animation;
     - end/reset and verify player cards do not jump or disappear.

## Risk Notes

- Clock semantics touch both protocol and persisted state. Keep migration
  tolerant and avoid deleting old timing fields in the same change.
- Randomizing player slots can break reconnect if any code caches the old color.
  Recompute viewer color from player id on every snapshot.
- Reset flash is a canvas handoff bug, not just React state. Fix it in the board
  animation ownership model so local and online resets share the same behavior.
- Timeout enforcement is lazy through active room messages. This is acceptable
  because at least one connected client keeps heartbeating in a watched game.
  Avoid cron, D1, KV indexes, or Durable Object alarms unless verification shows
  a correctness gap.
- UI copy should stay minimal; no visible warm-up/stability labels.

## Rollback Points

- Protocol additions and reducer changes should land with tests before UI
  wiring; if UI work stalls, backend tests can still confirm the state machine.
- Board reset hiding can be reverted independently if it changes local reset
  feel, but then online reset visuals need another anti-duplicate approach.
- Player status relocation can be isolated to `GobangGame` markup and CSS if
  the first layout pass needs visual iteration.

## Review Gate

Do not run `task.py start` or edit implementation files until the user reviews
the PRD/design/implementation plan or explicitly says to begin implementation.
