# Animate line pattern effects

## Goal

Replace the current static three-in-a-row hint with a temporary animated line
effect for straight or diagonal 3, 4, and 5 stone patterns. The effect should
feel like the line connects stones one by one from the first stone to the last,
holds briefly, then disappears in the same direction.

## Requirements

- Trigger a pattern effect when a same-color connected line of exactly 3,
  exactly 4, or exactly 5 stones exists horizontally, vertically, or diagonally.
- The effect should render as one continuous line that travels through the
  stones in order: stone 1 to stone 2 to stone 3, continuing through stone 5
  when present. It should not appear as choppy delayed segments.
- After the final segment appears, keep the completed effect visible for 0.5
  seconds.
- After the hold, disappear as one continuous animation from the starting stone
  toward the last stone, not as choppy segment-by-segment steps.
- The effect should be temporary and should not remain as a persistent board
  hint.
- Preserve the existing victory line readability; the new 5-stone pattern
  animation may play alongside the victory highlight, but must not hide the
  final board.
- Keep reduced-motion users on a calmer, fast version.
- Keep the change local to Gobang game/effect logic and rendering.

## Acceptance Criteria

- [ ] Same-color straight or diagonal lines of 3, 4, and 5 stones produce
      pattern descriptors.
- [ ] Lines shorter than 3 do not produce the effect.
- [ ] The rendered effect connects stones continuously from the starting stone
      through each following stone.
- [ ] After completing the connection, the full effect holds for 0.5 seconds.
- [ ] The effect then disappears continuously from the starting stone.
- [ ] Pattern effects remount on newly triggered board states and clear after
      the animation.
- [ ] Existing move placement, undo, new game, and win detection still work.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
