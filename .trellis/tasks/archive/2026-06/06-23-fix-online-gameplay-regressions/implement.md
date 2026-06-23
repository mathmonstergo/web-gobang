# Fix online gameplay regressions implementation plan

## Order

1. Backend room cleanup
   - Add room-state tests for `/status` releasing disconnected slots after the
     five-minute reconnect window.
   - Add reducer/Object tests for created rooms that never reach `playing`
     expiring after ten minutes on the next status/join access.
   - Persist `createdAt` and `hasEnteredPlaying` with backward-compatible
     normalization for stored room states.
   - Apply cleanup before status, join, and client-message handling.

2. Backend notifications
   - Add event derivation around join, close, and successful mutations.
   - Emit server `notification` messages for game start/end, request
     create/respond, opponent join/disconnect/reconnect, and new game.
   - Add focused Worker/room-state tests where practical.

3. Online snapshot animation helpers
   - Add test-first pure helpers to derive placement effects and reset animation
     decisions from previous/current snapshots.
   - Integrate helpers into `GobangGame`.
   - Preserve local-mode behavior.

4. Board preview control
   - Add board props for preview player and placement preview enablement.
   - Update hover/touch preview rendering to use the explicit preview player.
   - Add tests for pure helper decisions, not canvas pixels.

5. Request modal UI
   - Show accept/reject common modal for incoming undo/surrender requests.
   - Disable duplicate outgoing request actions while pending.
   - Wire accept/reject callbacks to existing hook methods.

6. Online player status UI
   - Add component for player cards, heartbeat dot, color/turn state, move time,
     and game time.
   - Replace the existing status pill only in online room state.
   - Keep copy minimal and avoid warm-up explanatory text.

7. Final verification
   - `pnpm typecheck`
   - `pnpm lint`
   - `pnpm test`
   - `pnpm build`
   - Browser smoke test two online clients if local Worker dev can run.

## Risk Notes

- Reset animation across two clients is the riskiest part because the server
  already changes authoritative state immediately. The first fix should be a
  client-side visual delay rather than a backend protocol redesign unless tests
  prove it cannot work.
- Request expiration currently depends on room activity. Do not introduce
  always-running Durable Object timers unless needed.
- Room cleanup should stay request-driven. Do not add cron/D1/KV room indexes
  for this fix unless lazy cleanup cannot satisfy status/join correctness.
- Keep online UI additions scoped to player status and request modals.

## Rollback Points

- Backend notifications can be reverted independently if they create duplicated
  messages.
- Snapshot animation helper integration can be reverted without touching server
  state.
- Player status UI can fall back to the existing `status-pill` if layout needs
  a second visual pass.
