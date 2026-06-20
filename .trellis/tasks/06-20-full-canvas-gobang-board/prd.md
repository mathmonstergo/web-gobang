# Migrate Gobang board to full canvas renderer

## Goal

Replace the current mixed SVG-stone plus Canvas-effect Gobang board with a single full-canvas board renderer, while keeping the existing application shell, game rules, local persistence, PWA behavior, and Cloudflare Worker deployment structure.

The user value is a smoother mobile-first game feel: all stone drawing, placement bloom, line-shape waves, victory replay waves, and reset shockwave/scatter effects should run in one animation loop so effects are not interrupted by React re-renders or later moves.

## Requirements

- Preserve the current outer app layout direction: centered mobile-first board, compact header/status, and only necessary controls.
- Use the provided Figma-exported React/Vite prototype at `Mobile Web Go Game Design.zip` as the visual and motion reference, not as a direct project replacement.
- Render the board, stones, hover/cursor preview, placement bloom, shape waves, victory waves, and reset scatter effects on canvas.
- Keep current game state and rules from `app/modules/gobang/game-logic.ts`, `useGobangGame`, storage, and derived effect detection.
- Use the design prototype's warm dark/gold mood and physical board feel where it improves the current UI, without replacing the current surrounding layout with the prototype's whole page.
- Placement effects must be independent events. Fast subsequent moves must not cancel, restart, or visibly stutter previous placement blooms.
- Shape wave effects must be independent events. Fast subsequent moves must not cancel, restart, or overwrite previous wave effects.
- Shape waves for 3/4/5 runs must originate from the latest placed stone and propagate by grid distance along all qualifying lines.
- Victory replay waves must repeat about every 2 seconds and use the final winning move as the replay origin. If the final move is an endpoint, replay starts from that endpoint; if it is in the middle, replay expands from the middle.
- Victory state must not draw connecting lines, outlines, borders, or extra winning strokes around stones. The visible victory cue is only repeated stone wave motion on the five winning stones.
- New-game reset should emit a shockwave from the New Game control and push existing stones outside the board before they fall vertically downward as if into a deep void.
- New-game reset should feel like physical simulation, not a decorative scatter:
  - the shockwave applies an outward impulse to stones;
  - stones can collide with nearby stones while still on or near the board;
  - after losing board support / leaving the board area, stones should visibly fall under gravity;
  - stones should travel far enough to leave the board, then drop downward out of view.
- Undo should also use a physical removal effect:
  - the removed stone should be visually lifted vertically from the board first;
  - after the lift, it should be thrown out of the board area;
  - the thrown stone should continue with gravity / falling motion instead of simply fading.
- The user approved adding `matter-js` for physical reset/undo effects.
- Maintain mobile browser performance. Canvas loops should only perform necessary work, cap DPR appropriately, and prune completed animation events.
- Keep keyboard placement support where practical, or provide a reasonable canvas equivalent for focused board controls.
- Keep Cloudflare deployment and README requirements unchanged unless implementation requires a small build/config fix.

## Acceptance Criteria

- [ ] The board no longer renders stones as SVG circles; the primary board and stones are drawn on canvas.
- [ ] Existing local game rules still work: legal placement, alternating turns, occupied-cell rejection, undo, reset, and win detection.
- [ ] Local persistence still loads and saves games.
- [ ] Placement bloom plays for each move and keeps playing even if another move is made quickly.
- [ ] 3/4/5 shape wave effects originate from the latest placed stone and are not interrupted by later moves.
- [ ] Victory replay wave repeats around every 2 seconds and originates from the actual final winning stone.
- [ ] Victory state has no line, stroke, outline, or border effect around winning stones.
- [ ] New-game reset shockwave pushes stones beyond the board edge before they drop downward and disappear.
- [ ] New-game reset includes plausible physical motion: outward impulse, stone-to-stone collision response, gravity, and falling out of view after leaving board support.
- [ ] Undo captures the removed stone before state rollback and plays a lift-then-throw physical removal animation.
- [ ] Mobile layout remains centered and usable at narrow widths.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- [ ] Local dev server is available at `http://localhost:5173/` for Windows-side testing.

## Notes

- Source design prototype extracted to `/tmp/web-gobang-design` during planning.
- Key prototype constants and behaviors observed:
  - `BLOOM_DUR = 580`
  - `WAVE_STONE_DUR = 360`
  - `WAVE_STAGGER = 125`
  - `VICTORY_LOOP_MS = 2200`
  - reset shockwave and scatter animation exist, but need stronger "outside board then fall" behavior than the prototype.
