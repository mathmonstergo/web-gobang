# Implementation Plan

## Ordered Steps

1. Read frontend/shared specs before editing.
2. Extract or expose small pure helpers if needed for removal animation state:
   - reset waiting/impact status;
   - board-boundary falling transition;
   - optional move snapshot metadata.
3. Fix reset animation:
   - keep copied reset stones drawn while waiting for shockwave;
   - remove any first-frame hidden-state behavior that creates a visual gap;
   - make Matter bodies dynamic only at impact time;
   - preserve prototype ring speed and impact pulse.
4. Fix undo animation:
   - add a cat-paw animation state for removed stones;
   - calculate the removed stone quadrant relative to the board center;
   - spawn the paw from the corresponding outside quadrant with a matching angle;
   - move the paw to the stone, attach the stone, and carry both out;
   - ensure the removed stone starts at the exact board coordinate and never jumps.
5. Fix fixed latest-stone dot ring:
   - identify the static residual dot-ring source after placement effects end;
   - remove that persistent ornament;
   - keep transient prototype-style impact rings and soft mist/ink diffusion;
   - verify this does not change shape/victory wave timing.
6. Add/update focused tests:
   - reset snapshot stone is drawable before impact;
   - impact activation changes state only after `impactAt`;
   - undo cat-paw quadrant selection and path endpoints are stable;
   - no static latest-stone dot-ring state remains after placement animation.
7. Run:
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
8. Start/keep dev server and provide `http://localhost:5173/` for Windows-side testing.

## Risky Areas

- Overlay and board coordinate spaces must match exactly; any DPR scaling mismatch reads as teleport.
- Reset state clears immediately, so copied stones must draw every frame before impact.
- Matter static bodies do not visibly move until activated; drawing code must not skip them before impact.
- Undo should not double-draw the removed stone after logical state rollback, except during the intentional copy handoff to the cat paw.
- The fixed latest-stone dot ring may be a separate persistent marker from bloom; inspect before deleting the wrong transient effect.

## Rollback Point

The previous full-canvas implementation is commit `787ca61`. This fix should be a small commit on top of it.
