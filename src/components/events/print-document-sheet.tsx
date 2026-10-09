import { formatCurrencyExact } from '@/lib/utils';
import { runStatusLabels, type RunStatus } from '@/lib/run-status';
import type { EntryLabelStyle } from '@/lib/entry-labels';
import { printEntry, printTime, type PrintAcknowledgment, type PrintEntrySummary, type PrintRoping, type PrintRun } from '@/lib/events/print-documents';
import { registerRopers, payoutStage, payoutStatus, type RegisterAward } from '@/lib/events/payout-register';

export function RunSheet({ runs, roping, round, timer, style }: { runs: PrintRun[]; roping: PrintRoping; round: number; timer: boolean; style: EntryLabelStyle }) {
  const missing = runs.some(r => r.position === null);
  return <>
    <h2>{roping.name} · {round > roping.main_round_count ? 'Short round' : `Round ${round}`}</h2>
    <p>{roping.scheduled_date} · {roping.arena_name || 'First Available'} · {runs.length} runs</p>
    {timer && <p>{roping.timer_count} {roping.timer_count === 1 ? 'timer' : 'timers'} · {roping.timer_resolution === 'best' ? 'Fastest' : roping.timer_resolution === 'longest' ? 'Longest' : 'Average'} time · Timer staff: ____________________</p>}
    {missing && <p className="print-warning">Provisional round: order not fully built. Unassigned runs are shown last; do not use this as a final draw.</p>}
    {!runs.length ? <p className="print-warning">Provisional round: no runs available. Entries or the short-round field may not be built yet.</p> : <table>
      <thead><tr><th>Draw</th><th>Contestant</th><th>Entry</th><th>Cattle</th>
        {timer ? <>{Array.from({ length: roping.timer_count }, (_, i) => <th key={i}>Timer {i + 1}</th>)}<th>Penalty</th><th>Handicap</th><th>Final time / status</th></> : <th>Status</th>}
      </tr></thead><tbody>{runs.map(r => <tr key={r.id}>
        <td>{r.position ?? '—'}</td><td>{r.name}{r.attempts > 0 && <small>Rerun attempt {r.attempts + 1}</small>}</td><td>{printEntry(r.entryNumber, style)}</td><td>{r.cattle ?? ''}</td>
        {timer ? <>{Array.from({ length: roping.timer_count }, (_, i) => <td key={i} className="writing-cell">{r.readings.find(t => t.timer === i + 1)?.seconds.toFixed(2) ?? ''}</td>)}
          <td className="writing-cell">{r.status === 'pending' ? '' : r.penalty.toFixed(2)}</td><td>{r.adjustment ? `${r.adjustment > 0 ? '-' : '+'}${Math.abs(r.adjustment).toFixed(2)}` : ''}</td>
          <td className="writing-cell">{printTime(r) ?? (r.status === 'pending' ? '' : runStatusLabels[r.status as RunStatus] ?? r.status)}</td></>
          : <td>{runStatusLabels[r.status as RunStatus] ?? r.status}</td>}
      </tr>)}</tbody>
    </table>}
    {timer && <p className="sheet-note">Saved readings are prefilled. Paper changes must be entered in the app. No time / turn out / disqualification / rerun: note the status instead of a time.</p>}
  </>;
}

export function EntrySummarySheets({ summaries, eventTitle }: { summaries: PrintEntrySummary[]; eventTitle?: string }) {
  return summaries.length ? summaries.map(person => <section key={person.id} className="contestant-sheet">
    <h2>{person.name}</h2>
    {eventTitle && <p>{eventTitle}</p>}
    <table><thead><tr><th>Roping / date</th><th>Entry</th><th>Status</th><th>Payment</th></tr></thead><tbody>{person.entries.map(e => <tr key={e.id}><td>{e.roping}</td><td>{e.label}</td><td>{e.status.replaceAll('_', ' ')}</td><td>{e.payment.replaceAll('_', ' ')}</td></tr>)}</tbody></table>
    <h3>Fees & entry options</h3>
    <table><thead><tr><th>Fee</th><th>Applies to</th><th>Charge</th></tr></thead><tbody>{person.charges.map(c => <tr key={c.id}><td>{c.title}</td><td>{c.entryLabel}</td><td>{c.waived ? 'Not charged' : formatCurrencyExact(c.amount)}</td></tr>)}</tbody></table>
    <p className="totals">Charges: {formatCurrencyExact(person.due)} · Paid: {formatCurrencyExact(person.paid)} · Balance: {formatCurrencyExact(person.balance)}{person.credit > 0 ? ` · Credit: ${formatCurrencyExact(person.credit)}` : ''}</p>
  </section>) : <p>No contestant entries match this selection.</p>;
}

export function PayoutAcknowledgmentSheet({ awards, acknowledgments = [] }: { awards: RegisterAward[]; acknowledgments?: PrintAcknowledgment[] }) {
  const people = registerRopers(awards);
  return <>
    <p>Finalized awards only · Amount due: {formatCurrencyExact(people.reduce((sum, p) => sum + p.dueCents, 0))}</p>
    {!people.length ? <p>No finalized payouts available for this selection.</p> : <table>
      <thead><tr><th>Contestant / winnings</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Receipt acknowledgment</th></tr></thead>
      <tbody>{people.map(p => <tr key={p.id}>
        <td><strong>{p.name}</strong>{p.memberNumber && <small>Member {p.memberNumber}</small>}
          {p.awards.map(a => <small key={`${a.planId}-${a.awardKey}`}>{a.ropingName} · {a.poolName} · {payoutStage(a)}, place {a.place}: {formatCurrencyExact(a.amountCents)}</small>)}
          <small>{payoutStatus(p)}</small>
          {acknowledgments.filter(a => a.roperId === p.id).map(a => <small key={a.id}>Received by {a.recipient} · {a.confirmed ? 'Receipt confirmed' : 'Confirmation pending'} · {a.staff} · {a.date}</small>)}
          </td><td>{formatCurrencyExact(p.totalCents)}</td><td>{formatCurrencyExact(p.paidCents)}</td><td>{formatCurrencyExact(p.dueCents)}</td>
        <td className="ack-cell">{p.needsReview ? 'Review changed awards before payment' : p.dueCents ? <><span>Received by: __________________</span><span>Roper confirmed receipt: □</span><span>Staff: __________ Date: __________</span></> : 'Already marked paid'}</td>
      </tr>)}</tbody>
    </table>}
    <p className="sheet-note">Confirm receipt verbally and record the recipient and staff member in the app. This sheet does not mark payouts paid.</p>
  </>;
}
