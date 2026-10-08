"use client";

import { useActionState, useState } from "react";
import {
  CalendarDays,
  Check,
  LoaderCircle,
  Mail,
  Phone,
  UsersRound,
  X,
} from "lucide-react";
import {
  reviewOnlineEntryRequest,
  type EntryFormState,
} from "@/app/(app)/events/[eventId]/entries/actions";
import { formatPhoneNumber } from "@/lib/utils";

interface EntryRequest {
  revision: number;
  id: string;
  name: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  competitionGender: "female" | "male" | null;
  memberNumber: string | null;
  contestantNote: string | null;
  submittedAt: string;
  membershipVerified: boolean;
  items: Array<{ division: string; quantity: number }>;
}

export function OnlineEntryRequestList({
  eventId,
  requests,
  enabled = true,
  manager = true,
}: {
  eventId: string;
  requests: EntryRequest[];
  enabled?: boolean;
  manager?: boolean;
}) {
  if (!requests.length) return null;
  return (
    <section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
      <div className="border-b border-[#e7ebe8] px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Online requests</h2>
            <p className="mt-1 text-xs text-[#758078]">
              Review before entries, charges, and runs are created
            </p>
          </div>
          <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
            {requests.length} pending
          </span>
        </div>
      </div>
      <div className="divide-y divide-[#e7ebe8]">
        {requests.map((request) => (
          <RequestRow key={request.id} eventId={eventId} request={request} enabled={enabled} manager={manager} />
        ))}
      </div>
    </section>
  );
}

function RequestRow({
  eventId,
  request,
  enabled,
  manager,
}: {
  eventId: string;
  request: EntryRequest;
  enabled: boolean;
  manager: boolean;
}) {
  const action = reviewOnlineEntryRequest.bind(null, eventId);
  const [state, formAction, pending] = useActionState<EntryFormState, FormData>(
    action,
    {},
  );
  const [eligibilityOverride, setEligibilityOverride] = useState(false);
  return (
    <form action={formAction} className="p-5">
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="requestRevision" value={request.revision} />
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{request.name}</h3>
            <span
              className={`rounded-md px-2 py-1 text-[11px] font-bold ${request.membershipVerified ? "bg-emerald-100 text-emerald-800" : "bg-[#eef1ef] text-[#59645e]"}`}
            >
              {request.membershipVerified
                ? `Member ${request.memberNumber}`
                : "Guest request"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#66716b]">
            <a
              href={`mailto:${request.email}`}
              className="flex items-center gap-1.5"
            >
              <Mail size={13} /> {request.email}
            </a>
            {request.phone ? (
              <a
                href={`tel:${request.phone}`}
                className="flex items-center gap-1.5"
              >
                <Phone size={13} /> {formatPhoneNumber(request.phone)}
              </a>
            ) : null}
            {request.birthDate ? (
              <span className="flex items-center gap-1.5">
                <CalendarDays size={13} /> Born{" "}
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeZone: "UTC",
                }).format(new Date(`${request.birthDate}T12:00:00Z`))}
              </span>
            ) : null}
            {request.competitionGender ? (
              <span className="flex items-center gap-1.5">
                <UsersRound size={13} />
                {request.competitionGender === "female" ? "Female" : "Male"}
              </span>
            ) : null}
            <span>{request.submittedAt}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {request.items.map((item) => (
              <span
                key={item.division}
                className="rounded-md bg-[#f0f2f1] px-2.5 py-1.5 text-xs font-semibold"
              >
                {item.division} · {item.quantity}{" "}
                {item.quantity === 1 ? "entry" : "entries"}
              </span>
            ))}
          </div>
          {request.contestantNote ? (
            <p className="mt-3 border-l-2 border-[var(--brand-accent)] pl-3 text-sm leading-5 text-[#59645e]">
              {request.contestantNote}
            </p>
          ) : null}
        </div>
        <div className="w-full shrink-0 lg:w-72">
          <label className="text-xs font-semibold text-[#66716b]">
            Office note
            <input
              name="reviewNote"
              disabled={!enabled || pending}
              required={eligibilityOverride}
              minLength={eligibilityOverride ? 5 : undefined}
              className="mt-1.5 h-9 w-full rounded-md border border-[#ccd4d0] px-3 text-sm outline-none focus:border-[var(--brand-accent)]"
              placeholder={
                eligibilityOverride ? "Override reason required" : "Optional"
              }
            />
          </label>
          {manager ? <label className="mt-2 flex items-start gap-2 text-xs font-semibold text-[#66716b]">
            <input
              name="eligibilityOverride"
              disabled={!enabled || pending}
              type="checkbox"
              checked={eligibilityOverride}
              onChange={(event) => setEligibilityOverride(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--brand-accent)]"
            />
            Approve eligibility exception
          </label> : null}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              name="decision"
              value="declined"
              disabled={pending || !enabled}
              className="flex h-9 items-center justify-center gap-1.5 rounded-md border border-[#ccd4d0] text-xs font-bold disabled:opacity-50"
            >
              <X size={15} /> Decline
            </button>
            <button
              name="decision"
              value="accepted"
              disabled={pending || !enabled}
              className="flex h-9 items-center justify-center gap-1.5 rounded-md brand-accent-fill text-xs font-bold text-white disabled:opacity-50"
            >
              {pending ? (
                <LoaderCircle size={15} className="animate-spin" />
              ) : (
                <Check size={15} />
              )}{" "}
              Accept
            </button>
          </div>
          {state.message && !state.success ? (
            <p className="mt-2 text-xs text-rose-700" aria-live="polite">
              {state.message}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
