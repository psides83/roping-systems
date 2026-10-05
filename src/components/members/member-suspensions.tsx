"use client";

import { useState } from "react";
import { Ban, Plus } from "lucide-react";
import { suspensionStatus, type MembershipSuspension } from "@/lib/membership-suspensions";
import { SuspensionDialog } from "./suspension-dialog";

const date = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));

export function MemberSuspensions({ membershipId, suspensions, canManage, today }: {
  membershipId: string; suspensions: MembershipSuspension[]; canManage: boolean; today: string;
}) {
  const [target, setTarget] = useState<MembershipSuspension | "new" | null>(null);
  return <section className="border-y border-[#dfe4e1] py-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Ban size={19} />Membership suspensions</h2>
      {canManage ? <button onClick={() => setTarget("new")} className="flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold"><Plus size={16} />Add suspension</button> : null}
    </header>
    {!suspensions.length ? <p className="mt-3 text-sm text-[#66716b]">No suspensions.</p> : null}
    <div className="divide-y divide-[#e7ebe8]">{suspensions.map((suspension) => {
      const status = suspensionStatus(suspension, today);
      return <article key={suspension.id} className="py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="text-sm font-bold">{date(suspension.starts_on)} through {date(suspension.ends_on)}</span>
            <span className={`rounded px-2 py-1 text-xs font-semibold ${status === "Active" ? "bg-red-50 text-red-800" : status === "Scheduled" ? "bg-amber-50 text-amber-900" : "bg-[#eef1ef] text-[#66716b]"}`}>{status}</span></div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm">{suspension.reason}</p>
            <p className="mt-2 break-words text-xs text-[#758078]">Issued by {suspension.staff_label}</p>
            {suspension.lifted_at ? <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#66716b]">Lifted {new Date(suspension.lifted_at).toLocaleDateString("en-US")} by {suspension.lifted_by_label}: {suspension.lift_reason}</p> : null}
          </div>
          {canManage && (status === "Active" || status === "Scheduled") ? <button onClick={() => setTarget(suspension)} className="h-9 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold">Lift suspension</button> : null}
        </div>
      </article>;
    })}</div>
    {target ? <SuspensionDialog membershipId={membershipId} suspension={target === "new" ? null : target} today={today} onClose={() => setTarget(null)} /> : null}
  </section>;
}
