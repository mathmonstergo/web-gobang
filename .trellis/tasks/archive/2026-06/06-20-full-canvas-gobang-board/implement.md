# Implementation Plan

## Scope

Migrate only the Gobang board rendering and effects to a full-canvas renderer. Keep the existing route, hook, game logic, storage, and deployment setup.

## Ordered Steps

1. Read frontend/shared specs before coding.
   - `.trellis/spec/frontend/index.md`
   - required frontend docs listed by the index
   - `.trellis/spec/shared/index.md`

2. Extract reusable animation helpers from the design prototype.
   - Board layout calculation.
   - Stone drawing gradients.
   - Placement bloom drawing.
   - Wave scale calculation.
   - Reset shockwave/scatter math.
   - Avoid copying prototype game state or whole app layout.

3. Add/reset physics dependency decision.
   - Add `matter-js` and its TypeScript types if needed.
   - User approved the dependency.
   - Use it only for New Game reset physics and Undo removal physics, not for Gobang rules.

4. Refactor `GobangBoard`.
   - Replace SVG board/stones with one main canvas.
   - Keep pointer/touch/keyboard placement support where practical.
   - Maintain ARIA board label and focus behavior.
   - Convert pointer coordinates through canvas layout to `Position`.

5. Implement internal animation queues.
   - Placement bloom queue keyed by placement id.
   - Shape wave queue keyed by placement id and hint id.
   - Victory replay scheduler around every 2 seconds.
   - Reset scatter/ring queue.
   - Queues store snapshots so future moves do not mutate active animations.

6. Integrate reset physics scatter.
   - Capture current moves before clearing state.
   - Trigger reset animation on New Game.
   - Build circular stone bodies.
   - Apply shockwave impulse as the ring reaches each body.
   - Let bodies collide while active.
   - Push stones beyond board bounds and then drop vertically downward under gravity.
   - Clear game state immediately or after event snapshot is captured.

7. Integrate undo physics removal.
   - Capture the latest move before calling `undo()`.
   - Clear the logical board state via existing undo.
   - Add the removed stone to a transient removal queue.
   - Animate vertical lift first.
   - Then apply throw impulse and gravity so it exits the board and falls downward.
   - Ensure active placement blooms/shape waves continue independently.

8. Adjust CSS/layout.
   - Preserve current centered mobile-first layout.
   - Adopt dark/gold/warm board mood from prototype where appropriate.
   - Avoid right sidebar or marketing sections.

9. Update tests.
   - Keep game logic tests.
   - Replace SVG markup wave tests with pure helper tests where possible.
   - Add tests for victory origin selection:
     - final stone endpoint -> endpoint-origin replay
     - final stone middle -> middle-origin replay
   - Add tests for wave delay dedupe when one stone belongs to multiple hints.

10. Validate locally.
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
   - Start/keep dev server and provide `http://localhost:5173/` for Windows-side testing.

11. Post-validation.
   - Ask user to visually test fast moves, placement bloom independence, shape waves, victory replay, and reset scatter.
   - Commit and push only after user confirms or explicitly asks to push after implementation.

## Risky Areas

- Canvas coordinate scaling across WSL/Windows browser and mobile DPR.
- Touch input accuracy on small screens.
- Performance if all effects render every frame after queues are empty.
- Reset scatter needs departing stones copied before state reset.
- Physics reset needs dependency approval if using Matter.js. If dependency install is blocked, use custom fallback or pause for user approval.
- Victory replay origin must remain tied to final winning stone, not the line endpoint or center unless that was the actual final move.

## Rollback Points

- Before replacing SVG board.
- After canvas board draws static stones but before effects.
- After placement/shape/victory effects.
- After reset scatter.

## Validation Notes

The final implementation should not leave canvas artifacts after New Game, undo, or a fresh empty board. Animation loops should stop or idle when queues are empty.
