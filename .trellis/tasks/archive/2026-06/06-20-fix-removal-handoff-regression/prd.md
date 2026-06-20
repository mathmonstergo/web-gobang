# Fix reset and undo animation handoff regression

## Goal

Fix the reset and undo removal effects by matching the reference implementation in `Mobile Web Go Game Design (2).zip`, instead of continuing the current custom Matter.js version that does not match the target feel.

## Confirmed Facts

- The last pushed commit is `325646e`; do not push again until the user verifies this local fix.
- New Game currently snapshots Matter bodies but `drawPhysicsStones` skips bodies before `impactedAt`.
- `GobangGame` delays `reset()` until after the last impact window, which makes the animation depend on the logical board staying visible instead of the overlay snapshot owning the whole effect.
- When `reset()` finally runs, many active bodies may already have left the board, so the user perceives a late full-board disappearance instead of a visible handoff.
- Undo removes logical state immediately and relies on the cat-paw overlay copy to preserve continuity.
- The reference implementation uses a custom water-ripple impulse simulation, not Matter.js, for New Game.
- The reference implementation keeps on-board departing stones in board-local coordinates for a pixel-perfect handoff, then switches off-board stones to the viewport overlay.
- The reference implementation originally sent two water ripples, but the user now wants a single visible water shock and a single primary physics impulse.
- After stones leave the board, they should preserve the off-board momentum direction while also falling away from the board plane.
- Collision can cancel some stones' outward velocity; the reset animation needs an escape fallback so no stone spins forever on the board.
- The board surroundings are now pure black, so non-board text and controls must use high-contrast dark-theme colors.
- Reset stones should use smooth frictionless planar motion with equal-mass elastic collisions and no spin/rotation.

## Requirements

- New Game must draw copied snapshot stones on the overlay from the first post-click frame, even before the shockwave reaches them.
- New Game must follow the reference water-ripple behavior:
  - one ripple appears immediately from the New Game button;
  - the visual wave origin and physics origin must match;
  - one primary wave schedules real impulses on copied stones;
  - the single impulse should be strong enough to push all copied stones off the board;
  - stones stay on the board surface, collide, slide, then fall/shrink/fade after leaving the board.
- Reset physics must guarantee eventual departure even if collisions absorb a stone's initial impulse.
- Reset physics should conserve planar momentum during normal stone collisions; only a near-zero-momentum edge case may receive a tiny outward nudge.
- New Game may reset logical game state immediately after snapshotting, but copied stones must remain visible at their original board coordinates with no visual jump.
- Reset controls and placement should remain locked only while the reset animation is active.
- Undo should match the reference cat-paw motion and drawing style as closely as possible inside the current board layout.
- Undo must keep a copied stone visible at the exact original coordinate before the cat paw reaches it, then have the paw grab and carry it toward the corresponding quadrant corner.
- The undo cat paw should be roughly 3x larger than the earlier paw, should keep the carried stone opaque, and should not fade out while leaving the board.
- Do not push after this fix. The user will test locally first; push only after explicit verification.
- The local dev server must remain available at `http://localhost:5173/`.

## Acceptance Criteria

- [ ] Clicking New Game with multiple stones keeps copied stones visible immediately after click.
- [ ] A single water ripple starts from the New Game button immediately.
- [ ] No second shockwave or delayed second physical impulse is scheduled.
- [ ] Before the ripple impulses reach a stone, that copied stone remains stationary at its board intersection.
- [ ] At ripple impact, copied stones slide/collide on the board, all leave the board, then preserve exit momentum while falling away from the board plane.
- [ ] Stones that are slowed by collisions receive a fallback outward assist and do not remain spinning on the board.
- [ ] Reset stones do not rotate, do not friction-slow on the board, and collide as smooth equal-mass stones.
- [ ] Text, status labels, and controls outside the board remain readable on a pure black page background.
- [ ] Reset no longer has a visible full-board disappearance before the departure animation can be inspected.
- [ ] Clicking Undo keeps the removed stone visible at the same coordinate until the cat paw grabs it.
- [ ] Undo keeps the cat paw and carried stone opaque during retreat until the animation exits.
- [ ] Cat paw style and timing are based on the reference implementation, not the previous custom fur-paw version.
- [ ] No Git push is performed before user verification.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- [ ] `http://localhost:5173/` responds for Windows-side testing.

## Out of Scope

- Reworking Gobang rules, storage, PWA behavior, Cloudflare deployment, or online/API features.
- Changing the page shell beyond what is required to preserve animation visibility.
