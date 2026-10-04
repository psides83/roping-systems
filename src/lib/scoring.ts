export function formatFinalTimeAdjustment(
  storedCreditSeconds: number,
  precision = 3,
) {
  const finalTimeChange = -storedCreditSeconds;
  return `${finalTimeChange >= 0 ? "+" : "-"}${Math.abs(finalTimeChange).toFixed(precision)}`;
}
export function resolveTimerReadings(readings: string[], method: "average" | "best" | "longest") {
  if (!readings.length || readings.some((value) => !value.trim())) return null;
  const values = readings.map(Number);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  if (method === "best") return Math.min(...values);
  if (method === "longest") return Math.max(...values);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateFinalRunTime(rawTime: number, penalty: number, credit: number) {
  return Math.max(rawTime + penalty - credit, 0);
}
