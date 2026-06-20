# Design: Prototype-matching removal physics

## Boundary

Keep the change scoped to the full-canvas board renderer and parent button orchestration:

- `app/modules/gobang/components/gobang-board.tsx`
- `app/modules/gobang/components/gobang-game.tsx` only if callback timing needs adjustment
- focused tests around reset/undo animation state helpers
- placement bloom drawing in the same board component/helper

No game-rule or persistence changes are needed.

## Current Failure

The current reset path copies stones into Matter bodies, immediately hides all board stones through `hiddenKeysRef`, and the parent immediately calls `reset()`. This is logically valid but visually wrong: the user sees a discontinuity because the original board stone disappears before the shockwave reaches it.

Undo has a similar risk: the logical stone is hidden before the animated copy has clearly taken over.

The board also leaves a visible fixed ring of small dots around the latest placed stone after placement animation ends. This is not the transient bloom. It must be removed so the final board state contains only the stone, grid, star points, and accepted move marker behavior.

## Target Behavior

### Reset

Use a two-phase copied-stone lifecycle:

1. **Waiting phase**
   - On New Game click, snapshot all current moves into `PhysicsStone` entries.
   - The main logical board may reset immediately.
   - Overlay draws every snapshot stone at the exact original screen position while `timestamp < impactAt`.
   - The waiting stone is static and visually identical to a board stone.

2. **Impact and Matter phase**
   - When the ring reaches a stone, make its body dynamic.
   - Apply outward velocity/force from the New Game button origin.
   - Apply a brief prototype-style impact pulse.
   - Let Matter.js handle body integration and collisions.
   - After crossing the board boundary, damp horizontal velocity so gravity reads as a downward fall.

The key visual contract: reset must not rely on the old main-board stone staying visible. The animation snapshot itself must draw from the first post-click frame.

### Undo

Replace the current undo lift/throw as the primary visual with a cat-paw carry animation:

1. **Approach phase**
   - Snapshot the removed move before calling `undo()`.
   - Hide only that logical board stone after the removal copy can be drawn.
   - Compute the removed stone quadrant relative to the board center:
     - top-left, top-right, bottom-left, bottom-right.
   - Spawn a cat paw outside the board/viewport on the matching quadrant path.
   - Rotate the paw to match the approach vector.
   - Move the paw smoothly to the stone.

2. **Grab/carry phase**
   - Draw the removed stone exactly at the board point until the paw reaches it.
   - Once grabbed, draw the stone attached under the paw.
   - Carry both paw and stone back out along the quadrant path or a close matching exit vector.
   - No fade-only or coordinate jump removal.

This cat-paw path supersedes the previous vertical-lift-first undo visual. Reset remains the Matter.js-heavy removal effect.

## Matter.js Details

- Reset bodies can be created as static bodies and held at their original position until `impactAt`.
- Waiting bodies must still be drawn before impact.
- Once impacted, call `Body.setStatic(body, false)`, set velocity and angular velocity, then let `Engine.update` run.
- Use the same visual `drawStone` function for normal stones and removal copies to avoid layer mismatch.

## Static Dot Cleanup

- Identify the fixed dot ring source, not just transient bloom particles.
- Remove any persistent latest-move ornament that reads as a ring of dots.
- Keep the prototype-style transient impact ring and soft mist/ink diffusion.
- This cleanup must not affect shape-wave or victory-wave scaling.

## Compatibility

- Keep `reset()` and `undo()` immediate from the game state perspective if the animation snapshot draws the copied stones without gaps.
- Keep existing full-canvas placement bloom, shape wave, victory wave, keyboard, pointer, and tests.
- Preserve placement bloom timing, but remove persistent decorative dots.
- Keep DPR cap and current overlay canvas approach.

## Validation

- Unit tests should cover reset snapshot visibility semantics where practical.
- Build checks remain mandatory.
- Manual visual validation is required at `http://localhost:5173/` because the bug is perceptual and cannot be fully proven by SSR/unit tests.
