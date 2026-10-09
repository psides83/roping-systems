export interface OverviewRoping {
  id: string; name: string; date: string; arena: string | null; order: number;
  status: string; rounds: number; shortRound: boolean; shortRoundSeeded: boolean;
  shortRoundLocked: boolean; lockedRounds: number[]; note: string | null;
  schedule?: string;
}
export interface OverviewRun {
  id: string; ropingId: string; round: number; position: number | null;
  status: string; name: string; entry: number;
  entryId?: string; fineBlocked?: boolean;
}
export function overviewDate(ropings: OverviewRoping[], requested: string | undefined, today: string) {
  const dates = [...new Set(ropings.map(r => r.date))].sort();
  if (requested && dates.includes(requested)) return requested;
  return ropings.find(r => r.status === 'in_progress')?.date ?? (dates.includes(today) ? today : ropings.find(r => r.status !== 'completed')?.date) ?? dates.at(-1) ?? today;
}
export function arenaOverview(ropings: OverviewRoping[], runs: OverviewRun[], date: string, arenaCount: number, assignedArena?: string | null) {
  const scheduled = ropings.filter(r => r.date === date).toSorted((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const arenaNames = assignedArena ? [assignedArena] : Array.from({ length: arenaCount }, (_, i) => `Arena ${i + 1}`);
  if (scheduled.some(r => !r.arena || r.arena === 'First Available')) arenaNames.push('First Available');
  return arenaNames.map(arena => {
    const items = scheduled.filter(r => (r.arena || 'First Available') === arena);
    const active = items.filter(r => r.status === 'in_progress');
    const current = active.length === 1 ? active[0] : null;
    const next = items.find(r => r.status !== 'completed' && r.id !== current?.id && r.status !== 'in_progress') ?? null;
    const target = active.length > 1 ? null : current ?? next;
    const round = target ? Array.from({ length: target.rounds + (target.shortRound ? 1 : 0) }, (_, i) => i + 1).find(n => !target.lockedRounds.includes(n)) ?? target.rounds + (target.shortRound ? 1 : 0) : 1;
    const roundRuns = target ? runs.filter(r => r.ropingId === target.id && r.round === round).toSorted((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.id.localeCompare(b.id)) : [];
    const pending = roundRuns.filter(r => r.status === 'pending');
    const reruns = roundRuns.filter(r => r.status === 'rerun');
    const resolved = roundRuns.length - pending.length - reruns.length;
    const ordered = roundRuns.length > 0 && roundRuns.every(r => r.position !== null);
    const issues: string[] = [];
    if (active.length > 1) issues.push(`${active.length} ropings marked in progress. Confirm which is running.`);
    if (target && arena === 'First Available') issues.push('Assign an arena before timing.');
    if (target?.status === 'delayed' || target?.status === 'paused') issues.push(`Roping ${target.status}.`);
    if (target && !roundRuns.length) issues.push(round > target.rounds ? 'Short-round field not available.' : 'No active runs in this round.');
    if (roundRuns.length && !ordered) issues.push('Round order needs to be built.');
    if (reruns.length) issues.push(`${reruns.length} ${reruns.length === 1 ? 'rerun needs' : 'reruns need'} scheduling.`);
    if (pending[0]?.fineBlocked) issues.push(`${pending[0].name} has an unpaid fine restricting competition. Review it in the timing desk.`);
    if (target && round > target.rounds && target.shortRoundSeeded && !target.shortRoundLocked) issues.push('Short-round field needs review and locking.');
    if (ordered && resolved === roundRuns.length && !target?.lockedRounds.includes(round)) issues.push('All runs resolved. Complete the round.');
    if (target && target.lockedRounds.length >= target.rounds + (target.shortRound ? 1 : 0)) issues.push('All rounds completed. Complete the roping.');
    const ready = Boolean(current && ordered && arena !== 'First Available' && (round <= current.rounds || current.shortRoundLocked) && !current.lockedRounds.includes(round));
    return { arena, items, active, current, next, target, round, total: roundRuns.length, resolved, remaining: pending.length + reruns.length,
      reruns: reruns.length, issues, inBox: ready && !pending[0]?.fineBlocked ? pending[0] ?? null : null, onDeck: ready ? pending[1] ?? null : null };
  });
}
