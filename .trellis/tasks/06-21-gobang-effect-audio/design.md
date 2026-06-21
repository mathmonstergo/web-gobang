# Design

## Approach

Use a small Web Audio synth module under `app/modules/gobang/audio-effects.ts`.
The module exposes explicit event functions for the board component and lazily creates a singleton `AudioContext`.

This avoids adding static audio files while still allowing each effect type to have a distinct identity:

- Placement: short ceramic/wood tap with black/white tonal differences.
- Stone wave: airy rising pulse.
- New Game shockwave: low whoosh.
- Collision: short damped clack, throttled.
- Cat footstep: small muted taps, throttled.
- Cat swat: whoosh plus impact.

## Mobile Unlock

Browsers often block audio until a user gesture. Input handlers and game buttons call `primeGobangAudio()` before game actions. Later animation callbacks can call event-specific sounds because the context has been resumed.

## Integration Points

- Placement: existing non-replay placement effect hook.
- Shape/replay/victory wave: where `wavesRef.current.push(...)` queues a wave.
- Reset shockwave: `ResetWaveCrest` stores `soundPlayed`; drawing the crest triggers sound once when the crest becomes active.
- Collision: `resolveResetCollisions` plays a throttled collision sound when a real collision impulse is applied.
- Cat steps: `CatSwatRemoval` stores `nextFootstepAt`; run-in and run-out play steps at intervals.
- Cat swat: the existing launch handoff plays one swat sound.

## Constraints

- Do not add a second canvas.
- Do not mutate game rules from the audio layer.
- Audio calls should fail silently if Web Audio is unavailable.
- Keep audio generated locally so the app stays offline-capable.
