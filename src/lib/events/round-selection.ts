export function selectDeskRound(
  requested: string | string[] | undefined,
  totalRounds: number,
  lockedRounds: readonly number[] = [],
) {
  const total = Math.max(1, totalRounds);
  const current = Array.from({ length: total }, (_, index) => index + 1)
    .find((round) => !lockedRounds.includes(round)) ?? total;
  const parsed = typeof requested === "string" ? Number(requested) : NaN;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= total ? parsed : current;
}
