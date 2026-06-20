# Design: Overlay-owned removal handoff

## Boundary

Keep the fix inside the Gobang frontend animation layer:

- `app/modules/gobang/components/gobang-board.tsx`
- `app/modules/gobang/components/gobang-game.tsx`
- focused tests for pure helper behavior where practical

No game-rule, storage, route, Worker, or deployment changes.

## Reference Behavior

`Mobile Web Go Game Design (2).zip` implements New Game removal with:

- a custom `WaterRipple` ring renderer;
- copied stones in board-local coordinates for zero-jump handoff;
- per-stone queued impulses timed by ripple distance and ring index;
- simple rigid-body integration, on-board friction, circle-circle collision, and off-board shrink/fade.

The user first wanted the second wave delayed, then changed the contract to a
single visible wave with one primary physical impulse.

## Root Cause

The reset animation currently creates static Matter bodies but does not draw them until `impactedAt` is set. The parent also delays logical `reset()`. This leaves the perceived animation handoff split across two layers:

1. main board draws logical stones while waiting;
2. overlay draws only after impact;
3. parent clears logical state near the end of the impact schedule.

If the physics bodies have already moved quickly by the time logical state clears, the user sees the board empty out instead of seeing the copied stones remain and depart.

## Target Contract

### Reset

The reset snapshot owns the full visual lifecycle:

- one water ripple starts from the New Game button origin;
- each copied stone receives one primary impulse when the ripple reaches it;
- on-board motion is frictionless, smooth, and non-rotating;
- equal-mass stone collisions use an elastic normal-velocity exchange;
- if a collision edge case leaves a stone near zero speed after impact, apply a
  small outward nudge along its original escape direction;
- after leaving the board, the stone preserves planar exit momentum while depth
  gravity handles the falling/shrink/fade effect.

1. On click, snapshot all moves into reset stones at viewport coordinates.
2. Parent calls `reset()` immediately so the game state is clean.
3. Draw on-board copied stones in board-local coordinates on the main canvas so they are pixel-perfect with regular stones.
4. Draw water ripples on the full-viewport overlay from the New Game button.
5. Queue first-wave and second-wave impulses per stone. The second wave starts about 1.5 seconds later and also applies physical force.
6. While copied stones are on the board, update them with friction and collision.
7. Once a copied stone leaves the board bounds, render it on the viewport overlay while it shrinks and fades.
8. Parent keeps placement/undo locked for the returned animation duration only; no remote push happens before user verification.

### Undo

Undo stays overlay-owned:

1. Before calling `undo()`, create a cat-paw removal copy at the exact board coordinate.
2. The board animation layer draws the copied stone at rest until the paw reaches it.
3. The paw should use the reference pink pad style and timing: approach, press, hold, retreat.
4. The paw carries the copied stone out toward the corresponding quadrant corner; logical state can remove the move immediately.

## Compatibility

- Existing placement bloom, shape waves, victory waves, storage, and Worker deployment stay unchanged.
- On-board copied stones should use board-local coordinates, not viewport coordinates.
- Off-board copied stones and water ripples should use `getBoundingClientRect()` based viewport coordinates.
- Reduced motion media rules remain CSS-only and are not expanded in this fix.

## Validation

- Unit checks cover helper contracts that can be validated without browser pixels.
- Full animation visibility still requires user-side browser verification at `http://localhost:5173/`.
