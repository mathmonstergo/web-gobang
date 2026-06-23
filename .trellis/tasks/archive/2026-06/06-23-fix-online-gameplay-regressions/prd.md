# Fix online gameplay regressions

## Goal

Make deployed online Gobang feel like the planned multiplayer version: players
should understand when the server starts the game, see online notifications,
keep board effects during authoritative state updates, get usable undo/surrender
request interactions, and see the agreed player identity/timer UI during online
play.

## Confirmed Facts

- Local play is working through `useGobangGame`, which stores a
  `latestPlacement` effect whenever local `placeAt` succeeds.
- Online play currently derives effects from the server snapshot with
  `deriveEffects(onlineSnapshot.game, null)`, so authoritative online moves do
  not produce placement effects.
- The online board currently renders hover preview with `state.currentPlayer`.
  After a black online player moves, server state changes to white's turn, so
  the black player's browser previews a white ghost stone.
- The Worker Durable Object currently broadcasts snapshots, but it does not emit
  notification messages for game start, win/end, undo request/response,
  surrender request/response, opponent join, or opponent disconnect/reconnect.
- Undo and surrender can create `pendingRequest` server state, but the main
  React screen has no accept/reject UI and no visible request state.
- Accepted surrender and new-game actions currently create the next empty room
  state immediately, so the non-clicking client receives an empty board before
  it can play the clear-board animation.
- `OnlinePlayer` already contains nickname, avatar metadata, color,
  `isConnected`, and `isHeartbeatHealthy`.
- The snapshot already contains `startedAt`, `turnStartedAt`, `turnPausedAt`,
  `turnPausedDurationMs`, `serverNow`, current game, players, phase,
  end reason, and pending request.
- The original online design requires a player information component with
  avatar, nickname/id/color, heartbeat dot, move time, and game time after server
  start.
- Disconnected slot expiry already exists with a five-minute reconnect window,
  but `/status` currently checks `getRoomJoinability` without first expiring
  stale disconnected slots, so a previously full room can still validate as
  full after both browsers close.
- Room state does not currently persist a created timestamp or a "has ever
  reached playing" flag, so there is no reliable rule for clearing rooms that
  never started.

## Requirements

- Online users receive a visible transient notification when the server declares
  the game started after stable heartbeats.
- Online users receive visible notifications for game end, opponent join,
  opponent disconnect/reconnect, undo request/accept/reject/expire, surrender
  request/accept/reject/expire, and new game start where those events occur.
- Online placement should trigger the same placement bloom/wave/audio effects as
  local placement on both clients after the accepted server snapshot arrives.
- Online clear-board transitions should use the existing board reset animation
  for both the actor and the opponent whenever a game reset is caused by new
  game or accepted surrender.
- Online hover/touch preview must not show the opponent's color on the current
  player's browser. A player should see their own color as the ghost stone only
  when they can reasonably place, and no misleading opponent-color ghost during
  the opponent's turn.
- During online play, the old single `黑棋回合` / `白棋回合` status pill should
  transition to online player information rather than remain the primary status.
- Online player information should show both players with circular avatar,
  nickname, color/turn visual state, and a top-right red/green connection dot.
- Move time and game time should appear after the server starts the game.
- Move time pauses while a player is disconnected; game time continues from
  `startedAt`.
- Undo and surrender request states should be actionable: the target player can
  accept or reject inside the game UI, and the requester can see request feedback
  through notifications.
- The UI must avoid adding explanatory warm-up/stabilizing labels or extra
  helper copy that was not requested.
- Pre-playing rooms that never reach `playing` should stop blocking joins after
  ten minutes. The cleanup should happen on natural room access paths rather
  than through a global cron scan.
- Existing disconnected player slots should be expired before status checks and
  join attempts report `room-full`.
- Local mode behavior must remain unchanged.

## Acceptance Criteria

- [ ] Two deployed clients in the same room see a game-start notification after
      the server transitions from `stabilizing` to `playing`.
- [ ] Online legal moves produce visible placement effects and sound on both
      clients after the server accepts the move.
- [ ] A black player never sees a white hover/touch preview on their own browser
      just because it is white's turn; preview is own-color or hidden.
- [ ] During started online play, the header/status area displays online player
      cards with avatar, nickname, color/turn indication, heartbeat dot, move
      time, and game time.
- [ ] Game end emits a visible notification and disables undo as expected.
- [ ] Clicking new game after game end plays clear-board animation on both
      clients before the board becomes the next game.
- [ ] Accepted surrender plays clear-board animation on both clients before the
      next game.
- [ ] Undo and surrender request buttons produce visible request state and the
      opponent can accept or reject within the UI.
- [ ] A room that never entered `playing` no longer reports `room-full` after
      the ten-minute pre-play expiry window on the next status/join check.
- [ ] A room with disconnected slots older than the five-minute reconnect window
      no longer reports `room-full` on `/status`.
- [ ] Existing local placement, undo, reset, and visual effects still pass their
      current tests and manual smoke checks.

## Out Of Scope

- Spectator mode and seat switching.
- Server-side long-term profile persistence.
- Match history, ratings, accounts, chat, or rematch negotiation.
- Redesigning the whole page outside the online status/request/player UI needed
  for this task.
