import { notFound } from 'next/navigation';
import { EventWorkflowNav } from '@/components/events/event-workflow-nav';
import { EventDocumentControls } from '@/components/events/event-document-controls';
import { EntrySummarySheets, PayoutAcknowledgmentSheet, RunSheet } from '@/components/events/print-document-sheet';
import { PageHeader } from '@/components/ui/page-header';
import { getActiveProducer } from '@/lib/producers';
import { createClient } from '@/lib/supabase/server';
import { allPrintRows, loadPrintAwards, loadPrintEntries, loadPrintRuns } from '@/lib/events/print-document-data';
import { documentNames, printKinds, printRound, type EventDocumentKind, type PrintRoping } from '@/lib/events/print-documents';
import { selectDeskRound } from '@/lib/events/round-selection';

export default async function EventDocumentsPage({ params, searchParams }: {
  params: Promise<{ eventId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventId } = await params;
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === 'string' ? query[key] as string : undefined;
  const producer = await getActiveProducer();
  if (!producer) notFound();
  const db = await createClient();
  const { data: event, error } = await db.from('events').select('id, title').eq('id', eventId).eq('producer_id', producer.id).maybeSingle();
  if (error) throw new Error('Unable to load event documents.');
  if (!event) notFound();
  const access = { manage: false, time: false, collect: false, finance: false };
  for (const [key, fn] of Object.entries({ manage: 'can_manage_event', time: 'can_time_event', collect: 'can_collect_event', finance: 'can_finance_event' })) {
    const permission = await db.rpc(fn, { target_event: eventId });
    if (permission.error) throw new Error('Unable to check document access.');
    access[key as keyof typeof access] = Boolean(permission.data);
  }
  const kinds = printKinds(access);
  if (!kinds.length) notFound();
  const requested = value('type');
  if (requested && !kinds.includes(requested as EventDocumentKind)) notFound();
  const kind = (requested ?? kinds[0]) as EventDocumentKind;
  let ropings = await allPrintRows((from, to) => db.from('event_ropings')
    .select('id, name, scheduled_date, arena_name, main_round_count, short_round_enabled, timer_count, timer_resolution, payouts_finalized_at')
    .eq('event_id', eventId).eq('producer_id', producer.id).order('scheduled_date').order('sort_order').order('id').range(from, to)) as PrintRoping[];
  if (producer.timingStaff && !access.manage) {
    const { data: auth } = await db.auth.getUser();
    const assignment = await db.from('staff_event_assignments').select('arena_number').eq('event_id', eventId).eq('user_id', auth.user?.id ?? '').maybeSingle();
    if (assignment.error) throw new Error('Unable to load arena assignment.');
    const arena = assignment.data?.arena_number;
    ropings = ropings.filter(r => !arena || r.arena_name === `Arena ${arena}` || !r.arena_name || r.arena_name === 'First Available');
  }
  const selectedId = value('roping');
  if (selectedId && selectedId !== 'all' && !ropings.some(r => r.id === selectedId)) notFound();
  const selected = ropings.find(r => r.id === selectedId) ?? ropings[0];
  const runKind = kind === 'draw' || kind === 'timer';
  const locked = runKind && selected ? await db.from('event_roping_rounds').select('round_number').eq('event_roping_id', selected.id).eq('status', 'locked') : { data: [], error: null };
  if (locked.error) throw new Error('Unable to determine the current round.');
  const round = value('round') ? printRound(value('round'), selected) : selectDeskRound(undefined,
    (selected?.main_round_count ?? 1) + (selected?.short_round_enabled ? 1 : 0), (locked.data ?? []).map(r => r.round_number));
  const runs = runKind && selected ? await loadPrintRuns(db, producer.id, selected.id, round) : [];
  const entries = kind === 'entries' ? await loadPrintEntries(db, producer.id, eventId, producer.entryLabelStyle) : [];
  const roper = value('roper');
  if (kind === 'entries' && roper && roper !== 'all' && !entries.some(p => p.id === roper)) notFound();
  const awards = kind === 'payouts' ? await loadPrintAwards(db, eventId, new Set(ropings.filter(r => r.payouts_finalized_at && (!selectedId || selectedId === 'all' || r.id === selectedId)).map(r => r.id))) : [];
  const receipts = kind === 'payouts' ? await allPrintRows((from, to) => db.from('payout_receipts')
    .select('id, roper_id, received_by, receipt_confirmed, paid_by_label, paid_at, payout_receipt_awards(event_roping_id)')
    .eq('event_id', eventId).eq('producer_id', producer.id).is('reversed_at', null).order('id').range(from, to)) : [];
  const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: producer.timezone });
  const acknowledgments = receipts.filter(r => (r.payout_receipt_awards as { event_roping_id: string }[]).some(a => awards.some(w => w.ropingId === a.event_roping_id && w.roperId === r.roper_id)))
    .map(r => ({ id: String(r.id), roperId: String(r.roper_id), recipient: String(r.received_by), confirmed: Boolean(r.receipt_confirmed), staff: String(r.paid_by_label), date: dateFormat.format(new Date(r.paid_at)) }));
  const summaries = entries.filter(p => !roper || roper === 'all' || p.id === roper);
  const generated = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: producer.timezone }).format(new Date());
  const printable = runKind ? runs.length > 0 && runs.every(r => r.position !== null) : kind === 'entries' ? summaries.length > 0 : awards.length > 0;
  return <div className="space-y-6">
    <div className="no-print space-y-6"><EventWorkflowNav eventId={eventId} active="documents" />
      <PageHeader title="Print documents" eyebrow={event.title} description="" actions={<EventDocumentControls printable={printable} />} />
      <form className="flex flex-wrap items-end gap-3" key={`${kind}-${selectedId}-${round}-${roper}`}>
        <label className="text-sm font-semibold">Document<select name="type" defaultValue={kind} className="mt-1 block h-10 max-w-full rounded-md border bg-white pl-3 pr-9">{kinds.map(k => <option key={k} value={k}>{documentNames[k]}</option>)}</select></label>
        {kind !== 'entries' && <label className="text-sm font-semibold">Roping<select name="roping" defaultValue={kind === 'payouts' ? selectedId ?? 'all' : selected?.id} className="mt-1 block h-10 max-w-[min(26rem,85vw)] rounded-md border bg-white pl-3 pr-9">
          {kind === 'payouts' && <option value="all">All finalized ropings</option>}{ropings.map(r => <option key={r.id} value={r.id}>{r.name} · {r.scheduled_date} · {r.arena_name || 'First Available'}</option>)}
        </select></label>}
        {runKind && <label className="text-sm font-semibold">Round<select name="round" defaultValue={round} className="mt-1 block h-10 rounded-md border bg-white pl-3 pr-9">{Array.from({ length: (selected?.main_round_count ?? 1) + (selected?.short_round_enabled ? 1 : 0) }, (_, i) => <option key={i} value={i + 1}>{i < (selected?.main_round_count ?? 1) ? `Round ${i + 1}` : 'Short round'}</option>)}</select></label>}
        {kind === 'entries' && <label className="text-sm font-semibold">Contestant<select name="roper" defaultValue={roper ?? 'all'} className="mt-1 block h-10 max-w-[85vw] rounded-md border bg-white pl-3 pr-9"><option value="all">All contestants</option>{entries.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <button className="h-10 rounded-md border bg-white px-4 text-sm font-semibold">View document</button>
      </form>
      {runKind && !printable && <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm font-semibold">Build the round order in the live desk before printing a competition sheet.</p>}
    </div>
    <article className={`print-active-document event-print-document ${kind === 'timer' ? 'timer-document' : ''} overflow-x-auto rounded-md border bg-white p-5 sm:p-8`}>
      <header><p>{producer.name}</p><h1>{event.title}</h1><h2>{documentNames[kind]}</h2><p className="sheet-note">Generated {generated} ({producer.timezone}) · Snapshot of recorded data</p></header>
      {runKind ? selected ? <RunSheet runs={runs} roping={selected} round={round} timer={kind === 'timer'} style={producer.entryLabelStyle} /> : <p>No ropings scheduled.</p>
        : kind === 'entries' ? <EntrySummarySheets summaries={summaries} eventTitle={event.title} /> : <PayoutAcknowledgmentSheet awards={awards} acknowledgments={acknowledgments} />}
    </article>
  </div>;
}
