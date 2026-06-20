# Full Canvas Gobang Board Design

## Architecture

Keep the existing application and domain layers:

- `GobangGame` owns the page shell, status, and controls.
- `useGobangGame` owns game state, local persistence, placement, undo, and reset.
- `game-logic.ts` owns board rules, win detection, and shape hint detection.
- `effects.ts` derives placement, shape hints, and victory state.

Replace only the board rendering layer:

- Current: SVG board/stones plus `InkEffectCanvas` overlay.
- Target: a canvas-first board component that draws board, stones, placement blooms, shape waves, victory replay waves, and reset scatter effects in one RAF loop.

The Figma-exported prototype is a reference implementation for drawing style and animation math. It should not be copied wholesale because it includes separate game state, standalone layout, and unrelated UI files.

## Component Boundary

Create or refactor `GobangBoard` into a canvas renderer with the existing props:

```ts
type GobangBoardProps = {
  state: GameState;
  effects: DerivedEffects;
  onPlace: (position: Position) => void;
  onResetAnimation?: () => void; // optional only if reset animation needs parent coordination
};
```

If reset scatter needs the previous board before `reset()` clears state, move reset orchestration into `GobangGame`:

- User clicks New Game.
- Board receives a reset animation request with the current moves.
- Board starts scatter/ring animation.
- Game state can reset immediately if scatter stores the departing stones internally.

This matches the prototype's approach: state is cleared immediately while scatter animation draws copied departing stones.

## Canvas Layers

Prefer two canvas layers inside the board surface:

- Main board canvas: board background, grid, star points, stones, hover preview, last-move marker, placement bloom, shape/victory wave scaling.
- Optional viewport overlay canvas: reset shockwave and stones flying out/falling beyond board bounds.

If the reset scatter can be clipped to the board container, one canvas is enough. Because the user wants stones pushed outside the board and falling into a void, a full-viewport overlay canvas is safer.

## Data Flow

Inputs from current app:

- `state.board`, `state.moves`, `state.status`, `state.winner`.
- `effects.placement` for latest placement bloom.
- `effects.shapeHints` for 3/4/5 shape waves.
- `effects.victory` for victory replay sequence.

Internal animation queues:

- `placementBloomsRef`: placement bloom events with copied point/stone/player/timestamp/seeded particles.
- `shapeWavesRef`: one-shot wave events with sequence, origin index, timestamp.
- `victoryLoopRef`: interval or elapsed-time scheduler that enqueues victory wave events every ~2 seconds.
- `resetRingRef`: reset shockwave events.
- `resetScattersRef`: copied stones with start point, velocity, launch delay, gravity, and fall state.

All animation events should be independent snapshots. Later props must append new events, not mutate or restart existing events.

## Coordinate System

Use canvas CSS pixels as the logical coordinate space, then scale by DPR:

- Compute `size` from container dimensions.
- Use a fixed grid of `BOARD_SIZE`.
- Use padding similar to the prototype (`size * 0.052`) so stones sit on grid intersections.
- Convert pointer/touch coordinates to board row/col through the current canvas rect.
- Cap DPR at 2 for mobile performance.

## Visual Direction

Adopt from prototype:

- Warm board gradient and subtle wood grain.
- Dark ambient page background and gold accent mood, adapted to the current centered layout.
- Black stone: lacquered/obsidian radial gradient.
- White stone: pale jade radial gradient.
- Black placement: ink ring plus seeded particle splatter.
- White placement: soft mist/glow rings.
- Wave scale: sinusoidal per-frame scale, not discrete CSS keyframes.

Avoid:

- Winning line drawing.
- Stone outlines/borders for victory.
- Full page replacement from prototype.
- Importing prototype shadcn component tree.

## Wave Semantics

Shape waves:

- For every `ShapeHint`, use `hint.anchor` as origin.
- Delay by grid steps from anchor.
- If a stone is in multiple lines, use the earliest arrival.
- Render by computing scale each frame:

```ts
scale = 1 + amplitude * sin(localProgress * PI)
```

Victory replay waves:

- Use the final winning move as origin when it is available via matching `shapeHints`.
- Fallback to the first winning position only when the final anchor cannot be inferred from current effects.
- Replay about every 2 seconds.
- No line, stroke, outline, or glow border.

## Reset Physics Design

New Game animation should be a physically plausible simulation, not a simple linear scatter.

- Use a small 2D rigid-body physics layer for reset scatter. Prefer a proven library such as Matter.js for collision detection and integration instead of hand-rolled collision math.
- Origin is the New Game button center or board center if the control point is unavailable.
- A shockwave ring expands across the viewport.
- Each stone is represented as a circular body.
- When the ring reaches a stone, apply an outward impulse away from the shockwave origin.
- Stone bodies should collide with each other while the reset animation is active.
- The board can be represented as temporary support/friction while the shockwave begins; once stones cross the board bounds or the support window ends, they continue under gravity and fall downward.
- Bodies are removed after they leave the viewport bottom or a timeout expires.
- Game state may reset immediately if departing stones are copied into the physics world before clearing the board.

If dependency cost is rejected, the fallback is a simplified custom physics model:

- circles with pairwise collision resolution;
- velocity integration with gravity;
- damping/friction;
- no exact rigid-body solver.

The fallback is acceptable for visual approximation but less likely to achieve the requested "real physical" feel.

## Undo Physics Design

Undo should not simply remove the latest stone from the rendered board.

Flow:

- Before calling the existing `undo()` state rollback, capture the latest move and its screen/canvas position.
- Immediately roll back game state so the board position is logically empty.
- Add the removed stone to a transient physics/removal queue.
- Phase 1: lift the stone vertically upward from the board, with a slight scale/height illusion.
- Phase 2: apply a throw impulse toward the nearest or ergonomically chosen board edge.
- Phase 3: after leaving the board support area, gravity dominates and the stone falls downward out of view.

This can use Matter.js bodies as well, but the lift phase may be scripted for control before handing the body to the physics world. The visual should communicate "picked up and thrown away", not "faded out".

Undo physics must be independent from active placement blooms and shape waves. Undoing during active effects should not interrupt them; it should only add a new transient removed-stone animation.

## Compatibility

- Preserve storage shape. No migration should be needed.
- Preserve `GameState`, `Move`, `Position`, `ShapeHint`, `WinLine`.
- Existing tests for game logic should continue to pass.
- Board render tests should be rewritten to assert canvas presence and wave-origin calculations through exported helpers or testable pure functions.

## Rollback

Keep the old SVG board implementation recoverable through git history. Avoid broad refactors outside:

- `app/modules/gobang/components/gobang-board.tsx`
- possible new canvas helper file(s)
- `app/modules/gobang/components/gobang-game.tsx`
- `app/app.css`
- focused tests
