export interface StandingContribution {
  roperId: string;
  classId: string;
  ropingId: string;
  date: string;
  official: boolean;
  winningsCents: number;
}

export interface StandingMove {
  id: string;
  roperId: string;
  fromClassId: string;
  toClassId: string;
  date: string;
  capAtLeader: boolean;
  // The producer's ordered class ladder, from higher number to lower number.
  classLadder: string[];
}

export interface StandingRow {
  roperId: string;
  classId: string;
  winningsCents: number;
  ropingsEntered: number;
  rank: number;
}

export interface CarryoverRecord {
  moveId: string;
  fromClassId: string;
  toClassId: string;
  earnedCents: number;
  carriedCents: number;
}

export interface QualificationRule {
  topPlaces: number | null;
  minimumRopings: number;
}

export function qualifiesForStandings(row: StandingRow, rule: QualificationRule): boolean {
  return (rule.topPlaces === null || row.rank <= rule.topPlaces)
    && row.ropingsEntered >= rule.minimumRopings;
}

/** Rebuild from official awards so corrections never accumulate duplicate credits. */
export function calculateSeasonStandings(
  contributions: StandingContribution[],
  moves: StandingMove[],
  season: { startsOn: string; endsOn: string },
  cutoffDate = season.endsOn,
): { rows: StandingRow[]; carryovers: CarryoverRecord[] } {
  const balances = new Map<string, Map<string, number>>();
  const attendance = new Map<string, Map<string, Set<string>>>();
  const carryovers: CarryoverRecord[] = [];
  const end = cutoffDate < season.endsOn ? cutoffDate : season.endsOn;
  const inPeriod = (date: string) => date >= season.startsOn && date <= end;
  const account = (roper: string) => {
    if (!balances.has(roper)) balances.set(roper, new Map());
    return balances.get(roper)!;
  };
  const events = [
    ...contributions.filter((item) => item.official && inPeriod(item.date))
      .map((item) => ({ date: item.date, type: "earning" as const, item })),
    ...moves.filter((item) => inPeriod(item.date))
      .map((item) => ({ date: item.date, type: "move" as const, item })),
  ].sort((a, b) => a.date.localeCompare(b.date)
    // Date-effective moves apply before that day's competition.
    || (a.type === b.type ? 0 : a.type === "move" ? -1 : 1));

  for (const event of events) {
    if (event.type === "earning") {
      const item = event.item;
      if (!Number.isSafeInteger(item.winningsCents) || item.winningsCents < 0) {
        throw new Error("Standings winnings must be nonnegative whole cents.");
      }
      const money = account(item.roperId);
      money.set(item.classId, (money.get(item.classId) ?? 0) + item.winningsCents);
      if (!attendance.has(item.roperId)) attendance.set(item.roperId, new Map());
      const classes = attendance.get(item.roperId)!;
      if (!classes.has(item.classId)) classes.set(item.classId, new Set());
      classes.get(item.classId)!.add(item.ropingId);
      continue;
    }

    const move = event.item;
    if (move.fromClassId === move.toClassId) continue;
    const money = account(move.roperId);
    const before = new Map(money);
    const transfers: { from: string; to: string; cents: number }[] = [];
    const targetIndex = move.classLadder.indexOf(move.toClassId);
    // Shift existing lower-number earnings first, without combining balances.
    if (targetIndex >= 0) {
      for (let index = move.classLadder.length - 2; index >= targetIndex; index--) {
        const from = move.classLadder[index];
        const cents = before.get(from) ?? 0;
        if (from !== move.fromClassId && cents > 0) {
          transfers.push({ from, to: move.classLadder[index + 1], cents });
        }
      }
    }
    const sourceCents = before.get(move.fromClassId) ?? 0;
    if (sourceCents > 0) transfers.push({ from: move.fromClassId, to: move.toClassId, cents: sourceCents });
    const leader = (classId: string) => Math.max(0, ...Array.from(balances.entries())
      .filter(([roper]) => roper !== move.roperId)
      .map(([, classes]) => classes.get(classId) ?? 0));
    const adjusted = transfers.map((transfer) => ({ ...transfer,
      carried: move.capAtLeader ? Math.min(transfer.cents, leader(transfer.to)) : transfer.cents,
    }));
    for (const transfer of adjusted) money.set(transfer.from, 0);
    for (const transfer of adjusted) {
      money.set(transfer.to, (money.get(transfer.to) ?? 0) + transfer.carried);
      carryovers.push({ moveId: move.id, fromClassId: transfer.from, toClassId: transfer.to,
        earnedCents: transfer.cents, carriedCents: transfer.carried });
    }
  }

  const rows: StandingRow[] = [];
  for (const [roperId, classes] of balances) {
    for (const [classId, winningsCents] of classes) {
      const ropingsEntered = attendance.get(roperId)?.get(classId)?.size ?? 0;
      if (winningsCents > 0 || ropingsEntered > 0) {
        rows.push({ roperId, classId, winningsCents, ropingsEntered, rank: 0 });
      }
    }
  }
  rows.sort((a, b) => a.classId.localeCompare(b.classId)
    || b.winningsCents - a.winningsCents || a.roperId.localeCompare(b.roperId));
  let classId = "";
  let position = 0;
  let previousCents = -1;
  let rank = 0;
  for (const row of rows) {
    if (row.classId !== classId) {
      classId = row.classId;
      position = 0;
      previousCents = -1;
    }
    position++;
    if (row.winningsCents !== previousCents) rank = position;
    row.rank = rank;
    previousCents = row.winningsCents;
  }
  return { rows, carryovers };
}
