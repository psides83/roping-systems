import { notFound } from 'next/navigation';
import { EventWorkflowNav } from '@/components/events/event-workflow-nav';
import { PageHeader } from '@/components/ui/page-header';
import { ArenaCommandCenter } from '@/components/events/arena-command-center';
import { getActiveProducer } from '@/lib/producers';
import { createClient } from '@/lib/supabase/server';
import { overviewDate, type OverviewRoping, type OverviewRun } from '@/lib/events/arena-overview';
import { ropingDisplayName } from '@/lib/events/roping-display-name';

export default async function ArenaOverviewPage({ params, searchParams }: {
  params: Promise<{ eventId: string }>; searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { eventId } = await params;
  const query = await searchParams;
  const producer = await getActiveProducer();
  if (!producer) notFound();
  const db = await createClient();
  const eventResult = await db.from('events').select('id, title, status, arena_count').eq('id', eventId).eq('producer_id', producer.id).maybeSingle();
  if (eventResult.error) throw new Error('Unable to load arena overview.');
  const event = eventResult.data;
  if (!event) notFound();
  let assignedArena: string | null = null;
  if (producer.timingStaff) {
    const permission = await db.rpc('can_time_event', { target_event: eventId });
    if (permission.error) throw new Error('Unable to check arena access.');
    if (!permission.data) notFound();
    const { data: auth } = await db.auth.getUser();
    const assignment = await db.from('staff_event_assignments').select('arena_number').eq('event_id', eventId).eq('user_id', auth.user?.id ?? '').maybeSingle();
    if (assignment.error) throw new Error('Unable to load arena assignment.');
    if (assignment.data?.arena_number) assignedArena = `Arena ${assignment.data.arena_number}`;
  }
  type Row = { id: string; name: string; scheduled_date: string; arena_name: string | null; sort_order: number; event_day_status: string;
    main_round_count: number; short_round_enabled: boolean; short_round_seeded_at: string | null; short_round_locked_at: string | null;
    event_day_note: string | null; schedule_type: string; starts_at: string | null; divisions: { name: string }; event_roping_rounds: { round_number: number; status: string }[] };
  const ropings: OverviewRoping[] = [];
  for (let from = 0; ; from += 500) {
    const result = await db.from('event_ropings').select('id, name, divisions!roping_division_discipline_same_organization(name), scheduled_date, arena_name, sort_order, event_day_status, main_round_count, short_round_enabled, short_round_seeded_at, short_round_locked_at, event_day_note, schedule_type, starts_at, event_roping_rounds(round_number, status)')
      .eq('event_id', eventId).eq('producer_id', producer.id).order('scheduled_date').order('sort_order').order('id').range(from, from + 499);
    if (result.error) throw new Error('Unable to load scheduled arenas.');
    for (const row of result.data as unknown as Row[]) {
      if (assignedArena && row.arena_name && row.arena_name !== 'First Available' && row.arena_name !== assignedArena) continue;
      const previous = ropings.findLast(r => r.date === row.scheduled_date && (r.arena || 'First Available') === (row.arena_name || 'First Available'));
      const start = row.starts_at ? new Intl.DateTimeFormat('en-US', { timeZone: producer.timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(row.starts_at)) : null;
      ropings.push({ id: row.id, name: ropingDisplayName(row.name, row.divisions.name), date: row.scheduled_date, arena: row.arena_name, order: row.sort_order,
        schedule: row.schedule_type === 'follows_previous' ? previous ? `Follows ${previous.name}` : 'Follows previous · Check lineup' : start ? `${start}${row.schedule_type === 'tentative' ? ' · Tentative' : ''}` : 'Start time not set',
        status: row.event_day_status, rounds: row.main_round_count, shortRound: row.short_round_enabled, shortRoundSeeded: Boolean(row.short_round_seeded_at),
        shortRoundLocked: Boolean(row.short_round_locked_at), lockedRounds: row.event_roping_rounds.filter(r => r.status === 'locked').map(r => r.round_number), note: row.event_day_note });
    }
    if ((result.data?.length ?? 0) < 500) break;
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: producer.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const date = overviewDate(ropings, typeof query.date === 'string' ? query.date : undefined, today);
  const ids = ropings.filter(r => r.date === date).map(r => r.id);
  const runs: OverviewRun[] = [];
  if (ids.length) for (let from = 0; ; from += 500) {
    const result = await db.from('competition_runs').select('id, entry_id, event_roping_id, round_number, draw_position, status, roping_entries!inner(entry_number, competition_status, ropers!inner(first_name, last_name))')
      .eq('producer_id', producer.id).in('event_roping_id', ids).eq('roping_entries.competition_status', 'active').order('id').range(from, from + 499);
    if (result.error) throw new Error('Unable to load arena progress.');
    for (const row of result.data ?? []) {
      const entry = row.roping_entries as unknown as { entry_number: number; ropers: { first_name: string; last_name: string } };
      runs.push({ id: row.id, entryId: row.entry_id, ropingId: row.event_roping_id, round: row.round_number, position: row.draw_position, status: row.status,
        name: `${entry.ropers.first_name} ${entry.ropers.last_name}`, entry: entry.entry_number });
    }
    if ((result.data?.length ?? 0) < 500) break;
  }
  for (const roping of ropings.filter(r => r.date === date && r.status === 'in_progress')) {
    const result = await db.rpc('event_member_fine_restrictions', { target_roping_id: roping.id });
    if (result.error) throw new Error('Unable to check arena fine restrictions.');
    const blocked = new Set((result.data as { entry_id: string; blocked: boolean }[] ?? []).filter(r => r.blocked).map(r => r.entry_id));
    for (const run of runs) if (run.ropingId === roping.id) run.fineBlocked = Boolean(run.entryId && blocked.has(run.entryId));
  }
  const updatedAt = new Intl.DateTimeFormat('en-US', { timeZone: producer.timezone, hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }).format(new Date());
  return <div className="space-y-6"><EventWorkflowNav eventId={eventId} active="arenas" />
    <PageHeader title="Arena overview" eyebrow={event.title} description={assignedArena ? `Assigned to ${assignedArena}` : ''} />
    {!ropings.length ? <p className="border-y py-8 text-sm text-[#66716b]">No ropings scheduled for your arenas.</p> : <ArenaCommandCenter eventId={eventId} ropings={ropings} runs={runs} date={date} arenaCount={event.arena_count} assignedArena={assignedArena} updatedAt={updatedAt} eventStatus={event.status} />}
  </div>;
}
