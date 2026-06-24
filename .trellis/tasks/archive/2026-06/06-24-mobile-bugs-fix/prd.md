# Fix mobile layout and touch offset bugs

## Goal

Fix critical mobile bugs on iPhone where control buttons are mispositioned and touch input on the board is offset from the actual stone placement.

## Requirements

### Bug 1: Layout Corruption on Mobile
- Control buttons (认输/悔棋) should remain in their intended position
- Canvas layer should not interfere with button positioning or clickability
- Layout should be stable across iOS Safari, Chrome, and other mobile browsers

### Bug 2: Touch Input Offset
- Clicking/tapping the bottom row of the board should place stones at the correct position
- Touch coordinates should accurately map to board grid positions across all areas
- Coordinate calculation should account for:
  - Canvas `position: fixed` vs board surface positioning
  - iOS Safari dynamic address bar height changes
  - Page scroll offset if applicable

## Root Causes Identified

1. **Canvas positioning**: `.board-canvas` uses `position: fixed; inset: 0; z-index: 20` which covers the entire viewport and may interfere with layout on iOS
2. **Coordinate mismatch**: `getBoundingClientRect()` returns viewport-relative coordinates, but calculation doesn't account for the fixed Canvas coordinate system
3. **Missing scroll compensation**: `boardOffsetX/Y` uses `rect.left/top` without adding `window.scrollX/Y`

## Acceptance Criteria

- [ ] On iPhone (Safari and Chrome), control buttons remain in correct position above/below the board
- [ ] Touch input on all board positions (especially bottom row) places stones at the tapped grid intersection
- [ ] No visual layout corruption or overlapping elements on mobile devices
- [ ] Responsive behavior works correctly with iOS Safari address bar show/hide transitions
- [ ] Existing desktop functionality remains unchanged

## Notes

- Canvas intentionally uses `pointer-events: none` so it doesn't block clicks
- ResizeObserver is already in place (line 813 of gobang-board.tsx)
- Viewport meta tag is correctly configured
- Issue does not occur on desktop browsers
- Root cause analysis completed in research/dialog-modal-audit.md from parent task
