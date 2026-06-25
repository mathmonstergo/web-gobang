type ResetPhysicsStoneVisibilityInput = {
  activeMoveKeys: ReadonlySet<string>;
  alpha: number;
  isActivated: boolean;
  moveKey: string | undefined;
};

export function shouldDrawResetPhysicsStone(
  input: ResetPhysicsStoneVisibilityInput
): boolean {
  if (input.alpha <= 0) {
    return false;
  }

  if (input.isActivated) {
    return true;
  }

  return input.moveKey === undefined || !input.activeMoveKeys.has(input.moveKey);
}
