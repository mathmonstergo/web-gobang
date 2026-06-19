import { BOARD_SIZE, type Position } from "@/modules/gobang/types";

export const BOARD_VIEW_PADDING = 0.85;
export const BOARD_VIEW_MIN = -BOARD_VIEW_PADDING;
export const BOARD_GRID_MAX = BOARD_SIZE - 1;
export const BOARD_VIEW_SIZE = BOARD_GRID_MAX + BOARD_VIEW_PADDING * 2;

export function getViewBox(): string {
  return `${BOARD_VIEW_MIN} ${BOARD_VIEW_MIN} ${BOARD_VIEW_SIZE} ${BOARD_VIEW_SIZE}`;
}

export function positionKey(position: Position): string {
  return `${position.row}:${position.col}`;
}

export function getPointFromClient(
  clientX: number,
  clientY: number,
  rect: DOMRect
): Position {
  const viewX: number =
    ((clientX - rect.left) / rect.width) * BOARD_VIEW_SIZE + BOARD_VIEW_MIN;
  const viewY: number =
    ((clientY - rect.top) / rect.height) * BOARD_VIEW_SIZE + BOARD_VIEW_MIN;

  return {
    row: clampBoardIndex(Math.round(viewY)),
    col: clampBoardIndex(Math.round(viewX))
  };
}

export function getCanvasPoint(
  position: Position,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  return {
    x: ((position.col - BOARD_VIEW_MIN) / BOARD_VIEW_SIZE) * canvasWidth,
    y: ((position.row - BOARD_VIEW_MIN) / BOARD_VIEW_SIZE) * canvasHeight
  };
}

function clampBoardIndex(value: number): number {
  return Math.min(BOARD_GRID_MAX, Math.max(0, value));
}
