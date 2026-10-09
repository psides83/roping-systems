import { formatEntryLabel, type EntryLabelStyle } from '../entry-labels';

export const documentNames = {
  draw: 'Draw sheet', timer: 'Timer sheet', entries: 'Contestant entry summaries', payouts: 'Payout acknowledgment list',
} as const;
export type EventDocumentKind = keyof typeof documentNames;
export interface PrintRoping {
  id: string; name: string; scheduled_date: string; arena_name: string | null;
  main_round_count: number; short_round_enabled: boolean; timer_count: number;
  timer_resolution: string; payouts_finalized_at: string | null;
}
export interface PrintRun {
  round: number;
  id: string; position: number | null; name: string; entryNumber: number; cattle: string | null;
  readings: { timer: number; seconds: number }[]; raw: number | null; penalty: number;
  adjustment: number; status: string; attempts: number;
}
export function printRoundSheets(roping: PrintRoping, runs: PrintRun[]) {
  const count = roping.main_round_count + (roping.short_round_enabled ? 1 : 0);
  return Array.from({ length: count }, (_, index) => {
    const round = index + 1;
    const rows = sortPrintRuns(runs.filter(run => run.round === round));
    return { round, runs: rows, ready: rows.length > 0 && rows.every(run => run.position !== null) };
  });
}
export interface PrintEntrySummary {
  id: string; name: string;
  entries: { id: string; roping: string; label: string; status: string; payment: string }[];
  charges: { id: string; title: string; entryLabel: string; amount: number; waived: boolean }[];
  due: number; paid: number; balance: number; credit: number;
}
export interface PrintAcknowledgment {
  id: string; roperId: string; recipient: string; confirmed: boolean; staff: string; date: string;
}

export function printKinds(access: { manage: boolean; time: boolean; collect: boolean; finance: boolean }): EventDocumentKind[] {
  return [
    ...(access.manage || access.time || access.collect ? ['draw', 'timer'] as const : []),
    ...(access.collect ? ['entries'] as const : []),
    ...(access.finance ? ['payouts'] as const : []),
  ];
}
export function sortPrintRuns(runs: PrintRun[]) {
  return [...runs].sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.name.localeCompare(b.name) || a.entryNumber - b.entryNumber || a.id.localeCompare(b.id));
}
export function printEntry(number: number, style: EntryLabelStyle) {
  return `${style === 'number' ? '#' : ''}${formatEntryLabel(number, style)}`;
}
export function printTime(run: PrintRun) {
  return run.status === 'complete' && run.raw !== null
    ? Math.max(0, run.raw + run.penalty - run.adjustment).toFixed(2) : null;
}
export function printRound(value: string | undefined, roping?: PrintRoping) {
  const count = (roping?.main_round_count ?? 1) + (roping?.short_round_enabled ? 1 : 0);
  const number = Number(value ?? 1);
  return Number.isInteger(number) && number >= 1 && number <= count ? number : 1;
}
