import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateEntryBalance } from '../entry-balance';
import type { EntryLabelStyle } from '../entry-labels';
import { printEntry, sortPrintRuns, type PrintEntrySummary, type PrintRun } from './print-documents';
import type { RegisterAward } from './payout-register';

// PostgREST caps responses; large events must not silently print only the first page.
export async function allPrintRows<T>(fetch: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 500) {
    const result = await fetch(from, from + 499);
    if (result.error) throw new Error(`Unable to load print documents: ${result.error.message}`);
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return rows;
  }
}

export async function loadPrintRuns(db: SupabaseClient, producer: string, roping: string, round: number): Promise<PrintRun[]> {
  const data = await allPrintRows((from, to) => db.from('competition_runs')
    .select('id, draw_position, raw_time_seconds, penalty_seconds, status, rerun_count, event_cattle(tag_number), run_timer_readings(timer_number, time_seconds), roping_entries!inner(entry_number, competition_status, handicap_time_credit_seconds, ropers!inner(first_name, last_name))')
    .eq('producer_id', producer).eq('event_roping_id', roping).eq('round_number', round).order('id').range(from, to));
  type Row = { id: string; draw_position: number | null; raw_time_seconds: number | null; penalty_seconds: number; status: string; rerun_count: number;
    event_cattle: { tag_number: string } | null; run_timer_readings: { timer_number: number; time_seconds: number }[];
    roping_entries: { entry_number: number; competition_status: string; handicap_time_credit_seconds: number; ropers: { first_name: string; last_name: string } } };
  return sortPrintRuns((data as unknown as Row[]).filter(row => row.roping_entries.competition_status === 'active').map(row => ({
    id: row.id, position: row.draw_position, name: `${row.roping_entries.ropers.first_name} ${row.roping_entries.ropers.last_name}`,
    entryNumber: row.roping_entries.entry_number, cattle: row.event_cattle?.tag_number ?? null,
    readings: row.run_timer_readings.map(r => ({ timer: r.timer_number, seconds: Number(r.time_seconds) })),
    raw: row.raw_time_seconds === null ? null : Number(row.raw_time_seconds), penalty: Number(row.penalty_seconds),
    adjustment: Number(row.roping_entries.handicap_time_credit_seconds), status: row.status, attempts: row.rerun_count,
  })));
}

export async function loadPrintEntries(db: SupabaseClient, producer: string, event: string, style: EntryLabelStyle): Promise<PrintEntrySummary[]> {
  const entries = await allPrintRows((from, to) => db.from('roping_entries')
    .select('id, roper_id, entry_number, competition_status, payment_status, event_ropings!inner(name, scheduled_date), ropers!inner(first_name, last_name)')
    .eq('producer_id', producer).eq('event_id', event).order('id').range(from, to));
  const charges = await allPrintRows((from, to) => db.from('entry_charges').select('id, roper_id, entry_id, title, amount_cents, waived_at')
    .eq('producer_id', producer).eq('event_id', event).order('id').range(from, to));
  const payments = await allPrintRows((from, to) => db.from('event_payments').select('roper_id, amount_cents, voided_at')
    .eq('producer_id', producer).eq('event_id', event).order('id').range(from, to));
  type Entry = { id: string; roper_id: string; entry_number: number; competition_status: string; payment_status: string;
    event_ropings: { name: string; scheduled_date: string }; ropers: { first_name: string; last_name: string } };
  const typed = entries as unknown as Entry[];
  const people = new Map(typed.map(e => [e.roper_id, `${e.ropers.first_name} ${e.ropers.last_name}`]));
  return [...people].map(([id, name]) => {
    const items = typed.filter(e => e.roper_id === id);
    const fees = charges.filter(c => c.roper_id === id).map(c => ({ id: c.id as string, title: c.title as string,
      entryId: c.entry_id as string | null, amountCents: Number(c.amount_cents), waived: Boolean(c.waived_at) }));
    const balance = calculateEntryBalance(items.map(e => ({ id: e.id, competitionStatus: e.competition_status, paymentStatus: e.payment_status })), fees,
      payments.filter(p => p.roper_id === id).map(p => ({ amountCents: Number(p.amount_cents), voided: Boolean(p.voided_at) })));
    return { id, name, entries: items.map(e => ({ id: e.id, roping: `${e.event_ropings.name} · ${e.event_ropings.scheduled_date}`,
      label: printEntry(e.entry_number, style), status: e.competition_status, payment: e.payment_status })),
      charges: fees.map(c => {
        const entry = items.find(e => e.id === c.entryId);
        return { id: c.id, title: c.title, entryLabel: entry ? `${entry.event_ropings.name} · ${entry.event_ropings.scheduled_date} · ${printEntry(entry.entry_number, style)}` : 'Event-wide', amount: c.amountCents, waived: c.waived || !balance.billable(c) };
      }),
      due: balance.amountDueCents, paid: balance.amountPaidCents, balance: balance.balanceDueCents, credit: balance.creditCents };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadPrintAwards(db: SupabaseClient, event: string, finalized: Set<string>): Promise<RegisterAward[]> {
  const data = await allPrintRows<Record<string, unknown>>((from, to) => db.rpc('event_payout_register_awards', { target_event_id: event })
    .order('plan_id').order('award_key').range(from, to));
  return data.filter(r => finalized.has(String(r.event_roping_id))).map(r => ({
    planId: String(r.plan_id), ropingId: String(r.event_roping_id), ropingName: String(r.roping_name), poolName: String(r.pool_name),
    poolType: String(r.pool_type), entryId: String(r.entry_id), roperId: String(r.roper_id), name: String(r.contestant_name),
    memberNumber: r.member_number as string | null, sectionType: String(r.section_type), round: r.round_number as number | null,
    dNumber: r.d_number as number | null, place: Number(r.place_number), awardKey: String(r.award_key), amountCents: Number(r.payout_cents), paidCents: Number(r.paid_cents),
  }));
}
