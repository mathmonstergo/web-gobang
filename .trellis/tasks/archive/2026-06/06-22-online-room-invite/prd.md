# Online room invite multiplayer

## Goal

Add an online multiplayer mode to Web Gobang while keeping the existing local
single-player experience as the default entry point. Online mode should let a
player switch from the existing game screen, enter a short nickname, create or
join an invite-code room, and play the same Gobang game against another player
in real time.

## Confirmed Facts

- The current app is a Vite + React single-page Gobang game.
- The default experience is local play with a 15x15 board, alternating black and
  white turns, undo, reset, win detection, effects, PWA assets, and localStorage
  persistence.
- `wrangler.jsonc` currently deploys built static assets and does not define a
  Worker script or Durable Object binding.
- Existing Gobang rules are implemented as pure TypeScript functions in
  `app/modules/gobang/game-logic.ts`, which makes the rules suitable for reuse
  in a server-authoritative online flow.
- Existing saved local games are stored in localStorage and should remain scoped
  to local mode.
- The user wants the online mode entry to be the existing logo/title area in the
  top-left header.
- The user wants online mode to keep the same core play screen instead of
  introducing a separate landing page.
- The user does not want the UI implementation to add extra explanatory desc,
  helper copy, banners, or panels beyond explicitly agreed components and text.
- The user wants players to provide a display name of no more than 8 visible
  characters.
- The user wants player avatars to use a classic circular badge with the first
  nickname character or letter.
- The user wants nicknames to be remembered so returning users do not need to
  type the same nickname every time.
- The first version should not persist nicknames server-side. Nicknames are
  remembered on the current device and synchronized inside the active room.
- The first online version should use invite-code rooms rather than random
  matchmaking.
- Room codes should be six-character uppercase codes generated from
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, excluding visually confusing characters
  such as `I`, `O`, `0`, and `1`.
- The first online version should support copying a shareable room link in
  addition to manually entering the invite code.
- Invite links should include the invite code so users can join from either the
  full link or the raw code.
- First-time online entry should show a nickname dialog first. After nickname
  confirmation, the nickname dialog closes and a separate mode-selection dialog
  opens.
- Returning online entry with a saved nickname should skip the nickname dialog
  and show the mode-selection dialog directly.
- The mode-selection dialog should say "请选择联机方式" and show two actions:
  "创建房间" with smaller subtext "自动复制邀请链接", and "加入房间" with smaller
  subtext "需要输入邀请码/链接".
- Clicking "创建房间" creates a room, receives a room code/invite link, and
  attempts to copy the invite link.
- Clicking "加入房间" expands the same dialog downward to reveal an input that
  accepts either an invite code or a full invite link.
- The join input should have a single-icon check button on its right. If the
  room is valid, a green check appears to the right of the icon and the client
  enters the room after 1 second. If the format is invalid or the room does not
  exist, small error text appears below the input in an attention-grabbing red
  that still matches the theme.
- Browser clipboard writes should be tied to user-triggered actions such as
  clicking "创建房间". Passive clipboard writes on page load or other
  non-user-triggered state changes are not reliable and should not be required.
- Dialog styling and motion should be implemented as a reusable common modal
  system, not as one-off online-only CSS. The common modal should have a unified
  base size, while allowing different internal button/input layouts.
- Common dialogs should match the existing theme and use iOS-style smooth
  open/close motion, a glass/frosted panel treatment, and a blurred background
  behind the modal.
- Online rooms should preserve disconnected player slots and board state for 5
  minutes to support short reconnects.
- The first online version should not include spectator mode or seat switching.
- If both player slots are occupied, additional visitors cannot join the room.
- The first online version should fit a Cloudflare Free account whenever traffic
  remains casual and small-scale.
- An online game should be started by the server after both players have stable
  WebSocket connectivity, rather than by the second legal move.
- The first-version stable connectivity rule is at least 3 valid application
  heartbeats from each player in the current room/game generation.
- The user wants move time and game time displayed beside the online player
  information after the server starts the game.
- The user wants a green/red connection status dot in the top-right of the
  online player information component. The dot turns red when heartbeat health
  fails and green again after heartbeat health recovers.
- The user does not want extra visible explanatory UI beyond the agreed online
  components and explicitly requested text. In particular, the UI must not add
  labels such as "currently warming up" or "warm-up board".
- Before the server starts the online game, the user wants a local warm-up board
  that behaves like the single-player board: local black/white moves, local
  undo, and local new game are allowed, but none of those actions upload to the
  server.
- The user wants a fixed transient notification component for online status
  events, visually inspired by Douyin live gift messages.
- The user wants notification strips to use a black-gray translucent background
  with left/right background blur/fade. The previously discussed gold underline
  should not be active in the notification UI for now, but the style may be
  kept commented/reserved for future use elsewhere.
- The implementation should be committed from a branch named `online`.

## Requirements

- Local play remains the default first screen.
- Clicking the top-left logo/title area switches into online mode.
- Entering online mode without a saved nickname opens the nickname dialog.
- After nickname confirmation, the nickname dialog closes and the
  mode-selection dialog opens.
- Entering online mode with a saved nickname opens the mode-selection dialog
  directly.
- The mode-selection dialog provides "创建房间" and "加入房间" actions.
- Clicking "创建房间" calls the Worker to create a room, receives `roomCode` and
  `inviteUrl`, and attempts to copy `inviteUrl` to the clipboard from that
  user-triggered click.
- If clipboard copy fails because of browser permissions, insecure context, or a
  missing user activation, the room still opens and the invite link remains
  available through an explicit copy action.
- Clicking "加入房间" expands the mode-selection dialog with an input that accepts
  either a raw invite code or a full invite link.
- The join input's right-side check icon validates the entered room before
  joining.
- If the entered code/link is valid and the room exists, a green check appears
  beside the check icon and the app enters the room after 1 second.
- If the entered code/link has invalid format or the room does not exist, small
  error text appears under the input in a theme-matched red and the user stays
  in the dialog.
- Opening an existing invite URL should direct-join the room when the device
  already has a saved nickname. If no nickname is saved, the user enters a
  nickname first and then direct-joins the invite room without showing the
  mode-selection dialog. Invalid, missing, or full rooms fall back to the join
  form with inline error text.
- Nicknames accept Chinese, English letters, numbers, and common visible text
  input, with an 8-visible-character maximum.
- Online mode provides invite-code room creation and room joining.
- Created rooms expose both the raw invite code and a copyable invite link.
- Opening an invite link should join the target room directly when possible.
  If the player has no saved nickname, they enter a nickname first and then join
  directly. This flow does not show the mode-selection dialog and never creates
  a replacement host room.
- Invite code parsing accepts lowercase input by normalizing to uppercase and
  accepts full invite links by extracting the `room` query parameter.
- Each online room supports exactly two active players, assigned to black and
  white.
- If both black and white player slots are occupied, joining the room fails with
  a clear room-full state.
- The online board uses the same visual board, stone placement, win display, and
  core interaction feel as local mode.
- The server is authoritative for room state, turn order, move legality, and win
  detection.
- Clients update board state from server messages rather than trusting local
  optimistic state as final.
- Local mode storage and online room state do not overwrite each other.
- Online mode shows enough player identity to make it clear who is black, who is
  white, whose turn it is, and whether the opponent is connected.
- Online player identity should include time information on the right side:
  current move time and current game time.
- The online player connection indicator must be a red/green circular dot placed
  at the top-right of the player information component, not a separate status
  banner or standalone control.
- Move time and game time should appear and start ticking only after the server
  declares the game started.
- If any player disconnects after the game starts, move time pauses while game
  time continues to count real elapsed time.
- Each online player information component should show a top-right connection
  dot: green for healthy heartbeat/connected and red for missed heartbeat or
  disconnected.
- Online mode should surface important room/game state changes through transient
  notifications instead of relying only on static text.
- Aside from explicitly requested labels, controls, nicknames, timers, invite
  code/link content, and transient notifications, do not add descriptive UI text
  that explains implementation states or repeats what controls already imply.
- Online modal labels are limited to the agreed nickname, mode-selection,
  create-room, join-room, validation, and blocking error text.
- Online dialogs should consume a reusable common modal component so future
  non-online dialogs can share the same size, glass/frosted treatment, backdrop
  blur, and enter/exit motion.
- The transient notification component should slide messages a short distance
  from left to right into the board center area, fade in during entry, float
  upward as they dismiss, and remove them after the exit motion.
- Notification entry should travel roughly the visual width of 8 Chinese
  characters instead of starting from the screen edge.
- Notification strips should use a black-gray translucent background whose left
  and right edges are softened/faded.
- Notification strips should not show the previously discussed gold underline
  in the current UI. If that decorative divider style exists in CSS, keep it
  commented/reserved rather than applied to notifications.
- If a new notification arrives before an older one disappears, the older
  notification is pushed upward and the new notification appears at the fixed
  latest-message position.
- The first-version notification events are: opponent joined, opponent
  disconnected, opponent reconnected, undo requested, undo accepted, undo
  rejected, undo expired, surrender requested, surrender accepted, surrender
  rejected, surrender expired, game started, room full, invite link copied, and
  new game started.
- Online mode keeps undo, but undo is a request-based action: only the player
  who made the latest move can request to undo that move before the opponent
  places another stone.
- The opponent must accept the undo request within 10 seconds; rejection,
  timeout, disconnection, or any board-changing action cancels the request.
- Only one undo request can be pending in a room at a time.
- The client should send lightweight application heartbeats over the room
  WebSocket so the room Durable Object can determine player connectivity.
- The room Durable Object should declare the game started when both player slots
  are connected and each player has sent at least 3 valid heartbeats for the
  current room/game generation.
- Before the server declares the game started, the displayed board is a local
  warm-up board. Warm-up moves, undo, and new game stay entirely on the current
  device and are not sent to the server.
- The warm-up/stabilizing state should be communicated through behavior only:
  the existing board remains playable locally, timers stay hidden, and the
  action button remains "新局". Do not add static warm-up labels, helper text,
  separate warm-up panels, or extra phase badges.
- Warm-up behavior is a double boundary, not only a disabled-control state: the
  front end must keep warm-up gameplay inside a local controller and must not
  serialize official gameplay messages, while the backend must reject those
  messages if a stale or buggy client sends them anyway.
- The room Durable Object must reject official gameplay mutations before
  `playing`, including place, undo request, surrender request, and new-game
  requests. Heartbeats, join, reconnect, and room-state snapshots remain valid.
- When the server declares the game started, the client should force the same
  clear-board animation as the local "新局" action to clear the warm-up board,
  discard warm-up moves, switch to the authoritative empty server board, and
  then show move/game timers.
- The reset control changes by game state: after the server starts the game,
  during an active unfinished game it is an "认输" action; before the game starts
  and after win/surrender/game end it is a "新局" action.
- The reset control label transition should use a slot-machine style vertical
  rolling animation: the outgoing label rolls upward out of view and the
  incoming label rises into place, clipped inside the button bounds.
- After a game has ended, either player can click "新局" to start the next game
  without opponent confirmation, matching the local mode reset behavior.
- Online "新局" should still let the existing clear-board animation finish
  before the next online board becomes playable.
- During a started unfinished online game, clicking "认输" sends a surrender request
  instead of immediately resetting the board.
- The opponent must accept the surrender request within 10 seconds; rejection,
  timeout, disconnection, or any board-changing action cancels the request and
  leaves the board unchanged.
- Accepting a surrender request immediately triggers the same clear-board
  animation as "新局"; the board resets to the next game after the animation
  completes.
- The latest nickname should be stored on the user's current device.
- The room Durable Object should store and broadcast each active room player's
  nickname and generated avatar metadata for the lifetime of the room.
- Room state should live in the room Durable Object and be snapshotted to
  Durable Object storage for small authoritative markers/state that must
  survive object instance recreation, such as room creation, player slots, and
  reconnect state. D1 rows or KV entries can be added later when they solve a
  concrete history or account/profile requirement.
- R2 should not be used for nickname storage because it is object storage for
  files/assets rather than small profile records.
- The 10-second undo and surrender-request timeouts should be represented as
  `expiresAt` timestamps instead of server-side always-running timers, so idle
  rooms can remain cheap.
- If a player disconnects, their player slot, color assignment, nickname,
  avatar metadata, and board state remain reconnectable for 5 minutes.
- After the 5-minute reconnect window expires, the room may reject reconnect,
  release the slot, or expire according to the room cleanup policy.

## Initial Scope Recommendation

- Use a Cloudflare Worker entry for API/WebSocket routing and a Durable Object
  instance per room for authoritative room state and fan-out.
- Implement room-code invitation before any random matchmaking or account-based
  identity.
- Keep online player identity lightweight: nickname, generated local player id,
  assigned color, and generated avatar initial/color.
- Treat the first version as two-player real-time play only. Spectators,
  ranking, chat, accounts, persistent match history, and cross-device identity
  are out of scope unless explicitly added later.
- Use Cloudflare's WebSocket Hibernation API where practical so open but idle
  rooms do not keep paying compute duration unnecessarily.
- Prefer localStorage for remembering the latest nickname on the same device.
  Do not add server-side nickname persistence in the first version.

## Acceptance Criteria

- [ ] A user can open the existing app and still play local Gobang by default.
- [ ] A user can click the title/logo area and enter online mode.
- [ ] Online mode asks for a nickname and rejects names longer than 8 visible
      characters.
- [ ] First-time title/logo online entry without an invite link closes the
      nickname dialog and then opens the mode-selection dialog.
- [ ] Returning title/logo online entry without an invite link opens the
      mode-selection dialog directly.
- [ ] Online mode remembers the latest nickname on the same device.
- [ ] Both clients can see each active room player's nickname and generated
      avatar while connected to the room.
- [ ] Created room codes are six-character uppercase codes from
      `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- [ ] The mode-selection dialog displays "请选择联机方式" with "创建房间" and
      "加入房间" actions.
- [ ] The "创建房间" action includes smaller subtext "自动复制邀请链接".
- [ ] The "加入房间" action includes smaller subtext "需要输入邀请码/链接".
- [ ] A user can create an invite-code room and see the invite code.
- [ ] After room creation, the app attempts to copy the created invite link to
      the clipboard from the user-triggered create-room action.
- [ ] If automatic clipboard copy fails, the invite link remains visible and can
      be copied through an explicit copy action.
- [ ] The invite link contains the invite code, and users can join by entering
      either the raw invite code or the full invite link.
- [ ] The join dialog expands downward after clicking "加入房间".
- [ ] The join input has a single-icon validation button on the right.
- [ ] A valid existing room shows a green check to the right of the validation
      icon and joins after 1 second.
- [ ] Invalid format and non-existent room errors appear as small text below the
      join input in an eye-catching but theme-consistent red.
- [ ] Online dialogs are built on a reusable common modal system with a unified
      base size, theme-matched glass/frosted panel, blurred backdrop, and smooth
      iOS-style open/close/expansion motion.
- [ ] A second user can join the room with the invite code.
- [ ] A second user can open a room link and join directly after entering a
      nickname when no nickname is saved.
- [ ] A returning user with a saved nickname can open a room link and join
      directly without seeing the mode-selection dialog.
- [ ] The first joined player and second joined player receive clear black/white
      assignments.
- [ ] A third visitor cannot join a room while both player slots are occupied
      and sees a clear room-full state.
- [ ] A player can place a stone only on their own turn.
- [ ] The online game is marked started only after both players have sent at
      least 3 valid heartbeats for the current room/game generation.
- [ ] Before the server declares the game started, players can use a local
      warm-up board with local moves, local undo, and local new game.
- [ ] Warm-up board actions before server start are never uploaded to the
      server.
- [ ] If an official gameplay message is attempted before server start, the
      backend returns a non-mutating error and leaves room state unchanged.
- [ ] The backend rejects official place/undo/surrender/new-game mutations
      before `playing`.
- [ ] When the server declares the game started, the client clears any warm-up
      stones with the existing clear-board animation and switches to the empty
      authoritative server board.
- [ ] Move time and game time appear beside the online player information after
      the server declares the game started.
- [ ] Move time and game time tick from server-provided timestamps rather than
      from local-only start assumptions.
- [ ] If any player disconnects after game start, move time pauses and game time
      continues.
- [ ] Online player information shows a top-right connection dot that is green
      when heartbeat health is good and red when heartbeat health fails.
- [ ] Connection status is not duplicated in a separate banner, label, or
      standalone widget.
- [ ] The pre-start warm-up/stabilizing state does not display visible text such
      as "warm-up", "stabilizing", "当前正在热身阶段", or "热身棋盘".
- [ ] Illegal moves are rejected by the server and do not corrupt either board.
- [ ] Both clients see the same board after each accepted move.
- [ ] A win is detected consistently and shown to both players.
- [ ] The latest mover can request undo before the opponent's next move.
- [ ] The opponent can accept or reject a pending undo request.
- [ ] Accepted undo removes only the latest move and syncs both clients.
- [ ] Rejected or 10-second expired undo requests leave the board unchanged.
- [ ] After a win, either player can click new game and both clients start the
      next game after the clear-board animation completes.
- [ ] Before the server declares the game started, the reset control displays
      "新局" and does not allow surrender.
- [ ] During a started unfinished game, the reset control displays "认输" instead
      of "新局".
- [ ] After win/surrender/game end, the reset control displays "新局".
- [ ] The reset control label switches between "认输" and "新局" with a clipped
      slot-machine style vertical rolling animation.
- [ ] During an unfinished game, clicking "认输" sends a surrender request to
      the opponent instead of immediately clearing the board.
- [ ] The opponent can accept or reject a pending surrender request.
- [ ] Accepted surrender requests trigger the same clear-board animation as
      "新局" and start the next game after the animation.
- [ ] Rejected or 10-second expired surrender requests leave the current board
      unchanged.
- [ ] Online status events can appear as transient notification strips that
      slide a short distance from left to right into the board center area, fade
      in, float upward, and disappear.
- [ ] Notification strips use a black-gray translucent background with softened
      left/right edges.
- [ ] Notification strips do not render the reserved gold underline style in the
      current UI.
- [ ] New notifications appear at a fixed latest-message position and push
      still-visible older notifications upward.
- [ ] First-version notifications cover opponent join/disconnect/reconnect,
      undo request/accept/reject/expire, surrender request/accept/reject/expire,
      game started, room full, invite copied, and new game started events.
- [ ] Notification text and motion stay clipped within the message strip and do
      not overflow or cover essential controls.
- [ ] Refreshing the browser during an active online room can restore the same
      player session when local session data is available.
- [ ] Disconnecting an opponent is reflected in the UI with a reconnect waiting
      state.
- [ ] A disconnected player can reconnect to the same slot within 5 minutes
      using local session data.
- [ ] A disconnected player is no longer guaranteed to reclaim the same room
      slot after 5 minutes.
- [ ] Local mode saved state still works independently of online mode.

## Out of Scope for First Version

- Random matchmaking.
- User accounts or login.
- Global rankings, match history, or persistent profiles.
- Chat, voice, or reactions.
- Spectator mode or seat switching.
- Paid/private rooms or moderation tools.
- AI opponent.

## Open Questions

- None.
