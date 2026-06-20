export function getResetWaveCrestCount(
  requiredImpulse: number,
  maxImpulsePerCrest: number
): number {
  const safeCap: number = Math.max(1, maxImpulsePerCrest);
  return Math.max(1, Math.ceil(Math.max(0, requiredImpulse) / safeCap));
}
