# Online gameplay polish and timers

## Goal

Polish online Gobang so it matches the intended multiplayer experience: online
undo/reset effects should preserve the single-player animation quality, games
should start only after a player explicitly starts them, player seats should be
randomized per official game, and online timers should be authoritative
per-player countdown clocks.

## Requirements

- Online undo must play the same cat swat removal animation used by
  single-player undo after the opponent accepts an undo request.
- Each official online game must randomly assign the two connected users to
  black/white before play begins.
- When a user receives their color assignment for the game, the notification
  stack must show `你本局随机为黑棋` or `你本局随机为白棋` for that user.
- The online player information component must not disappear during online
  clear-board/reset transitions, because that causes visible layout jump.
- Online clear-board/reset animation must not show stale stones from a previous
  local cache or duplicate stones that reappear at their original board
  positions after the first reset wave.
- Online timers must be independent per player:
  - each player has their own step countdown for their current move;
  - each player has their own total game countdown initialized to ten minutes at
    official game start;
  - only the current player's step countdown and total game countdown tick
    while it is that player's turn;
  - if the current player's step countdown reaches zero before they complete a
    legal move, that player loses;
  - if the current player's total game countdown reaches zero before they
    complete their next legal move, that player loses;
  - disconnection does not pause either countdown.
- The default online countdown limits are 45 seconds per move and 10 minutes of
  total game time per player.
- Two-player heartbeat stability remains an internal prerequisite, but it must
  no longer auto-start the game.
- In online mode, the primary action label must be `开始` before official play
  and `认输` during official play. Online mode should no longer expose `新局` as
  that button label.
- The online `开始` button is enabled only after both players are present and the
  existing stability requirement is satisfied.
- Before official start, the board remains local warm-up state only: moves,
  undo, and reset are local and must not be uploaded or accepted as official
  gameplay mutations.
- The online player information component should be placed below the
  `开始`/`认输` and `耍赖皮` controls instead of the top header area.
- UI changes must avoid extra explanatory copy such as warm-up/stabilizing
  descriptions unless explicitly requested.

## Acceptance Criteria

- [ ] With two clients in one room, heartbeat stability does not start the game
      automatically; the board stays in local warm-up mode until a player clicks
      the enabled `开始` button.
- [ ] Before stability is reached, the online `开始` button is visibly disabled
      and clicking it does not send an official start mutation.
- [ ] Clicking enabled `开始` resets the official game, randomly assigns
      black/white, starts the per-player countdowns, and shows each client their
      own color assignment notification.
- [ ] During official play, only the current player can place a stone, and the
      viewer preview remains that viewer's assigned color only on their own
      turn.
- [ ] Accepted online undo removes the latest stone with the cat swat animation
      on both clients.
- [ ] Accepted surrender and post-end restart/next start clear the board with no
      stale or duplicated stones flashing on either client.
- [ ] The online player information component remains mounted/occupied through
      clear-board/reset transitions and is displayed below the controls.
- [ ] Each player card displays that player's own step/game countdown rather
      than one shared elapsed timer.
- [ ] A step-time timeout or game-time timeout ends the game server-side with the
      timed-out player losing.
- [ ] Closing or disconnecting a client does not pause that player's or the
      opponent's active countdowns.
- [ ] Existing local single-player placement, reset, and cat undo effects remain
      unchanged.
- [ ] Automated checks cover backend state transitions, timeout winners,
      frontend online helper behavior, timer display derivation, and online
      reset/undo snapshot effects.

## Notes

- Confirmed from current code:
  - `receiveHeartbeat` currently auto-transitions `stabilizing` to `playing`
    after three valid heartbeats per player.
  - `disconnectPlayer` currently pauses move-time accounting through
    `turnPausedAt`; this conflicts with the new requirement.
  - `OnlinePlayerStatusPanel` currently shows one shared elapsed timer text for
    both players.
  - `GobangBoard` already exposes `playUndoAnimation(move)` and
    `playResetAnimation(moves, origin)`.
- `GobangGame` currently renders the online player status in the header only
    when `snapshot.startedAt !== null`.
  - Current tests cover the old auto-start and disconnect-pause semantics and
    must be updated first.
- Countdown defaults confirmed by user: 45 seconds per move and 10 minutes per
  player.

## Open Questions

- None.
