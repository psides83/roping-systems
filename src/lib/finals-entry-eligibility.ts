export type EarnedPositionPolicy = "none" | "rank" | "rank_and_attendance";

export function meetsFinalsEntryRequirements(row: { rank: number; ropingsEntered: number; finalsPositions?: number } | undefined,
  requirements: { topPlaces: number | null; minimumRopings: number; earnedPositionPolicy: EarnedPositionPolicy }) {
  if (!row) return false;
  const attendance = row.ropingsEntered >= requirements.minimumRopings;
  const earned = (row.finalsPositions ?? 0) > 0;
  if (earned && requirements.earnedPositionPolicy === "rank_and_attendance") return true;
  if (earned && requirements.earnedPositionPolicy === "rank") return attendance;
  return attendance && (requirements.topPlaces === null || row.rank <= requirements.topPlaces);
}

export function includeFinalsPositions(
  rows: { roperId: string; classId: string; rank: number; ropingsEntered: number; winningsCents: number }[], totals: { memberId: string; classId: string; positions: number }[],
  profiles: { memberId: string; roperId: string }[], classKey: string,
) {
  const roperIds = new Map(profiles.map((profile) => [profile.memberId, profile.roperId]));
  const positions = new Map<string, number>();
  for (const total of totals.filter((total) => total.classId === classKey)) {
    const id = roperIds.get(total.memberId);
    if (id) positions.set(id, (positions.get(id) ?? 0) + total.positions);
  }
  const result = rows.map((row) => ({ ...row, finalsPositions: positions.get(row.roperId) ?? 0 }));
  for (const [roperId, finalsPositions] of positions) if (!result.some((row) => row.roperId === roperId)) {
    result.push({ roperId, classId: classKey, rank: Number.MAX_SAFE_INTEGER, ropingsEntered: 0, winningsCents: 0, finalsPositions });
  }
  return result;
}
