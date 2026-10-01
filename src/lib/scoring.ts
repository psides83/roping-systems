export function formatFinalTimeAdjustment(
  storedCreditSeconds: number,
  precision = 3,
) {
  const finalTimeChange = -storedCreditSeconds;
  return `${finalTimeChange >= 0 ? "+" : "-"}${Math.abs(finalTimeChange).toFixed(precision)}`;
}
