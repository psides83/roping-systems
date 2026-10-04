export function formatFinalTimeAdjustment(
  storedCreditSeconds: number,
  precision = 2,
) {
  const finalTimeChange = -storedCreditSeconds;
  return `${finalTimeChange >= 0 ? "+" : "-"}${Math.abs(finalTimeChange).toFixed(precision)}`;
}
export function resolveTimerReadings(readings: string[], method: "average" | "best" | "longest") {
  if (!readings.length || readings.some((value) => !value.trim())) return null;
  const values = readings.map(Number);
  if (values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const resolved = method === "best" ? Math.min(...values)
    : method === "longest" ? Math.max(...values)
    : values.reduce((sum, value) => sum + value, 0) / values.length;
  return roundTime(resolved);
}

export function roundTime(seconds: number) {
  return Math.round((seconds + Number.EPSILON * Math.max(1, Math.abs(seconds))) * 100) / 100;
}

export function calculateFinalRunTime(rawTime: number, penalty: number, credit: number) {
  return roundTime(Math.max(rawTime + penalty - credit, 0));
}
