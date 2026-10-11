"use client";

import { PersistentForm } from "@/components/ui/persistent-form";
import Link from "next/link";
import { useActionState, useState } from "react";
import { ChevronDown, LoaderCircle } from "lucide-react";
import { assignFinalsPosition } from "@/app/(app)/settings/finals/assignment-actions";
import type { FinalsPositionSlot } from "@/lib/finals-position-assignments";

export interface FinalsTarget { id: string; classId: string; name: string; date: string; eventId: string; ready: boolean; locked: boolean }
const labels = { pending: "Pending assignment", assigned: "Assigned", expired: "Expired", needs_review: "Class changed · review assignment" };

function PositionForm({ slot, seasonId, targets }: { slot: FinalsPositionSlot; seasonId: string; targets: FinalsTarget[] }) {
  const [state, action, pending] = useActionState(assignFinalsPosition, {});
  const matching = targets.filter((item) => item.classId === slot.classId && !item.locked);
  return <PersistentForm action={action} className="mt-3 space-y-3">
    <input type="hidden" name="seasonId" value={seasonId} /><input type="hidden" name="awardId" value={slot.awardId} /><input type="hidden" name="number" value={slot.number} />
    <fieldset disabled={pending} className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1 text-xs font-semibold">Target roping<select name="targetId" defaultValue={slot.targetId ?? ""} className="h-10 w-72 max-w-full rounded-md border bg-white px-3 text-sm" required={!slot.targetId}>
        <option value="">{slot.targetId ? "Return to pending" : "Select a scheduled roping"}</option>
        {matching.map((item) => <option key={item.id} value={item.id} disabled={!item.ready}>{item.name} · {item.date}{!item.ready ? " · Setup required" : ""}</option>)}
      </select></label>
      <label className="grid gap-1 text-xs font-semibold">Reason<input name="reason" required minLength={5} maxLength={2000} placeholder="Finals entry assignment" className="h-10 w-64 max-w-full rounded-md border bg-white px-3 text-sm" /></label>
      <button className="inline-flex h-10 items-center gap-2 rounded-md brand-accent-fill px-3 text-sm font-semibold text-white">{pending && <LoaderCircle size={15} className="animate-spin" />}{pending ? "Saving..." : "Save assignment"}</button>
    </fieldset>
    {!matching.some((item) => item.ready) && <p className="text-xs text-amber-800">No ready target roping. <Link href="/events" className="font-semibold underline">Schedule a matching roping</Link> and enable bonus entries in its qualification setup.</p>}
    {state.error && <p role="alert" className="text-xs text-rose-700">{state.error}</p>}{state.success && <p role="status" className="text-xs text-emerald-700">Assignment saved.</p>}
  </PersistentForm>;
}

export function FinalsPositionAssignments({ slots, targets, members, classes, seasonId, endsOn, canEdit }: {
  slots: FinalsPositionSlot[]; targets: FinalsTarget[]; members: Record<string, string>; classes: Record<string, string>;
  seasonId: string; endsOn: string; canEdit: boolean;
}) {
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const visible = slots.filter((slot) => (filter === "all" || slot.status === filter) && `${members[slot.memberId] ?? ""} ${classes[slot.classId] ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="border-t border-[#dfe4e1] pt-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold">Position assignments</h2><p className="mt-1 text-xs text-[#66716b]">Unassigned positions expire after {endsOn}.</p></div>
      <div className="flex flex-wrap items-center gap-2"><input aria-label="Find a position holder" placeholder="Find a member or class" value={search} onChange={(event) => setSearch(event.target.value)} className="h-10 w-56 max-w-full rounded-md border bg-white px-3 text-sm" />
        <select aria-label="Position assignment status" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm"><option value="pending">Pending assignment</option><option value="assigned">Assigned</option><option value="needs_review">Needs review</option><option value="expired">Expired</option><option value="all">All positions</option></select></div>
    </div>
    <div className="mt-4 flex flex-wrap gap-5 text-sm">{Object.entries(labels).map(([status, label]) => <span key={status}><strong>{slots.filter((slot) => slot.status === status).length}</strong> {label}</span>)}</div>
    <div className="mt-4 divide-y divide-[#dfe4e1]">{visible.map((slot) => {
      const target = targets.find((item) => item.id === slot.targetId);
      const editable = canEdit && slot.status !== "expired" && !target?.locked;
      return <details key={`${slot.awardId}:${slot.number}:${slot.targetId}`} className="group py-3">
        <summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><div><span className="font-semibold">{members[slot.memberId] ?? "Member"}</span><span className="ml-2 text-[#66716b]">{classes[slot.classId] ?? "Class"} · Position {slot.number}</span></div><div className="flex items-center gap-2"><span className={`rounded px-2 py-1 text-xs font-semibold ${slot.status === "assigned" ? "bg-emerald-50 text-emerald-800" : slot.status === "expired" ? "bg-[#eef1ef] text-[#66716b]" : "bg-amber-50 text-amber-800"}`}>{labels[slot.status]}</span><ChevronDown size={16} className="shrink-0 transition-transform group-open:rotate-180" /></div></div>
          {target && <p className="mt-1 text-xs text-[#66716b]">{target.name} · {target.date}</p>}</summary>
        {target && <Link href={`/events/${target.eventId}/qualification/${target.id}`} className="mt-2 inline-block text-xs font-semibold underline">Target entry review</Link>}
        {slot.assignment?.reason && <p className="mt-2 text-xs text-[#66716b]">Last change: {slot.assignment.reason}</p>}
        {editable && <PositionForm slot={slot} seasonId={seasonId} targets={targets} />}
        {target?.locked && <p className="mt-2 text-xs text-[#66716b]">Assignment locked because the target roping has started or closed.</p>}
      </details>;
    })}{!visible.length && <p className="py-6 text-sm text-[#66716b]">No positions match this view.</p>}</div>
  </section>;
}
