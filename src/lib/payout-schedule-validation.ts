import type { FourDSettings } from "@/types/domain";

type Stage = "go_round" | "aggregate" | "short_round";
interface Range { minimumEntries: number; maximumEntries: number | null }
interface Schedule {
  goRoundsPercent: number;
  aggregatePercent: number;
  shortRoundPercent: number;
  shortRoundEnabled: boolean;
  competitionFormat: string;
  fourDSettings: FourDSettings | null;
  bracketsByStage: Record<Stage, Array<Range & { percentages: number[] }>>;
}

export function payoutScheduleIssues(schedule: Schedule): string[] {
  const issues: string[] = [];
  function coverage(ranges: Range[], label: string) {
    const sorted = [...ranges].sort((a, b) => a.minimumEntries - b.minimumEntries);
    let next = 1;
    for (const range of sorted) {
      if (range.minimumEntries !== next || (range.maximumEntries !== null && range.maximumEntries < range.minimumEntries)) {
        issues.push(`${label}: entry ranges must start at 1 with no gaps or overlaps.`);
        return;
      }
      next = range.maximumEntries === null ? Infinity : range.maximumEntries + 1;
    }
    if (next !== Infinity) issues.push(`${label}: add a final entry range with no maximum.`);
  }
  const allocations: Record<Stage, number> = {
    go_round: schedule.goRoundsPercent,
    aggregate: schedule.aggregatePercent,
    short_round: schedule.shortRoundEnabled ? schedule.shortRoundPercent : 0,
  };
  if (Math.round(Object.values(allocations).reduce((sum, n) => sum + n, 0) * 100) !== 10000)
    issues.push("Purse allocations must total 100%.");
  if (schedule.shortRoundEnabled && schedule.shortRoundPercent <= 0)
    issues.push("Short round: allocate a purse before using this schedule.");
  for (const stage of Object.keys(allocations) as Stage[]) {
    if (allocations[stage] <= 0) continue;
    const label = stage === "aggregate" ? "Average" : stage === "go_round" ? "Go-rounds" : "Short round";
    const brackets = schedule.bracketsByStage[stage];
    coverage(brackets, label);
    for (const bracket of brackets) {
      if (!bracket.percentages.length || bracket.percentages.some((n) => !Number.isFinite(n) || n <= 0) || bracket.percentages.reduce((sum, n) => sum + Math.round(n * 100), 0) !== 10000)
        issues.push(`${label}: every paid place needs a percentage, totaling 100%.`);
    }
  }
  if (schedule.competitionFormat === "four_d") {
    const settings = schedule.fourDSettings;
    if (!settings) issues.push("Complete the 4D payout settings.");
    else {
      coverage(settings.brackets, "4D");
      for (const rule of settings.brackets) {
        if (rule.purseBasisPoints.reduce((s, n) => s + n, 0) !== 10000 || rule.placesByDivision.some((n, i) => i < rule.activeDivisions ? n < 1 : n !== 0) || rule.purseBasisPoints.some((n, i) => i < rule.activeDivisions ? n <= 0 : n !== 0))
          issues.push("4D: assign a purse and paid places to each active D only.");
        const required = Math.max(...rule.placesByDivision.slice(0, rule.activeDivisions));
        for (const bracket of schedule.bracketsByStage.go_round) {
          if (bracket.minimumEntries <= (rule.maximumEntries ?? Infinity) && rule.minimumEntries <= (bracket.maximumEntries ?? Infinity) && bracket.percentages.length < required)
            issues.push(`4D: go-round range ${bracket.minimumEntries}–${bracket.maximumEntries ?? "unlimited"} needs at least ${required} paid-place percentages.`);
        }
      }
    }
  }
  return [...new Set(issues)];
}
