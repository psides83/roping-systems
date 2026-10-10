"use client";

import { useActionState, useState, useRef, useTransition } from "react";
import { CheckCircle2, LoaderCircle, Minus, Plus } from "lucide-react";
import {
  submitOnlineEntry,
  updateOnlineEntryRequest,
  loadOnlineFinalsAllowance,
  loadOnlineEntryEligibility,
  type OnlineEntryFormState,
  type OnlineRoperSearchResult,
} from "@/app/public/[producerSlug]/[eventSlug]/enter/actions";
import { formatCurrency } from "@/lib/utils";
import { summarizeOnlineEntryOptions, type EntryOption } from "@/lib/online-entry-summary";
import { PhoneInput } from "@/components/ui/phone-input";
import Link from "next/link";
import type { OnlineEntryRequest } from "@/lib/online-entry-requests";
import { qualificationNoticeText, type QualificationNotice } from "@/lib/events/qualification-notice";
import type { OnlineEntryEligibility } from "@/lib/online-entry-eligibility";
import { EntryEligibilityFeedback } from "@/components/events/entry-eligibility-feedback";
import { OnlineRoperSearch } from "./online-roper-search";

const inputClass =
  "mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]";

interface EntryDivision {
  qualification?: QualificationNotice;
  id: string;
  name: string;
  description: string | null;
  maximumEntries: number | null;
  allowGuests: boolean;
  estimatedFirstEntryCents: number;
  requiredFees: EntryOption[];
  startsAt: string | null;
  scheduledDate: string;
  scheduleType: "fixed" | "tentative" | "follows_previous";
  followsRopingName: string | null;
  scheduleNote: string | null;
  incentiveEnabled: boolean;
  eligibilityType: "skill" | "open" | "age";
  minimumAge: number | null;
  maximumAge: number | null;
  options: Array<{
    id: string;
    title: string;
    amountCents: number;
    kind: string;
    scope: string;
  }>;
}

export function OnlineEntryForm({
  producerSlug,
  eventSlug,
  divisions,
  existingRequest,
  requireMemberships = true,
}: {
  producerSlug: string;
  eventSlug: string;
  allowGuests: boolean;
  divisions: EntryDivision[];
  existingRequest?: OnlineEntryRequest;
  requireMemberships?: boolean;
}) {
  const action = existingRequest ? updateOnlineEntryRequest.bind(null, existingRequest.id, existingRequest.revision) : submitOnlineEntry.bind(null, producerSlug, eventSlug);
  const [state, formAction, pending] = useActionState<
    OnlineEntryFormState,
    FormData
  >(action, {});
  const [selected, setSelected] = useState<Record<string, boolean>>(() => Object.fromEntries(existingRequest?.items.map((item) => [item.id, true]) ?? []));
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(existingRequest?.items.map((item) => [item.id, item.quantity]) ?? []));
  const [selectedOptions, setSelectedOptions] = useState<Record<string, boolean>>(() => Object.fromEntries(existingRequest?.items.flatMap((item) => item.optionIds.map((id) => [`${item.id}:${id}`, true])) ?? []));
  const [feeContext, setFeeContext] = useState<{ coveredFeeKeys: string[]; balanceDueCents: number; creditCents: number } | null>(null);
  const summary = summarizeOnlineEntryOptions(divisions, selected, quantities, selectedOptions, feeContext?.coveredFeeKeys);
  const optionalTotal = summary.reduce((total, roping) => total + roping.options.reduce((sum, option) => sum + option.amountCents, 0), 0);
  const requiredTotal = summary.reduce((total, roping) => total + roping.requiredFees.reduce((sum, fee) => sum + fee.amountCents, 0), 0);
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedRecord, setSelectedRecord] = useState<OnlineRoperSearchResult | null>(null);
  const [checkingAllowance, startAllowanceCheck] = useTransition();
  const [allowances, setAllowances] = useState<Awaited<ReturnType<typeof loadOnlineFinalsAllowance>>["allowances"]>([]);
  const [allowanceMessage, setAllowanceMessage] = useState("");
  const [eligibility, setEligibility] = useState<OnlineEntryEligibility[]>([]);
  const [eligibilityMessage, setEligibilityMessage] = useState("");
  const [checkingEligibility, startEligibilityCheck] = useTransition();
  const requiresBirthDate = divisions.some(
    (division) => selected[division.id] && division.eligibilityType === "age",
  );

  if (state.success) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <CheckCircle2 size={24} />
        <h2 className="mt-3 text-lg font-bold">{existingRequest ? "Entry request updated" : "Entry request received"}</h2>
        <p className="mt-2 text-sm leading-6">{state.message}</p>
        <Link href="/roper/requests" className="mt-4 inline-block text-sm font-semibold underline">My entry requests</Link>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} aria-busy={pending} className="space-y-7" onChange={(event) => {
      const name = event.target instanceof HTMLInputElement ? event.target.name : null;
      if (name === "firstName" || name === "lastName") setSelectedRecord(null);
      if (name === "email" || name === "memberNumber") { setAllowances([]); setAllowanceMessage(""); setQuantities({}); setEligibility([]); setEligibilityMessage(""); setFeeContext(null); }
    }}>
      <section>
        <h2 className="text-lg font-bold">Contestant information</h2>
        <p className="mt-1 text-sm text-[#66716b]">{existingRequest ? "Contestant details stay with the original request. Contact the producer if they need correcting." : "Use an email address where the producer can contact you."}</p>
        <fieldset disabled={checkingAllowance || checkingEligibility || !!existingRequest} className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
        {!existingRequest && <OnlineRoperSearch producerSlug={producerSlug} eventSlug={eventSlug} selected={selectedRecord} onSelect={record => {
          setSelectedRecord(record);
          setAllowances([]); setAllowanceMessage(""); setEligibility([]); setEligibilityMessage(""); setFeeContext(null); setQuantities({});
          if (!formRef.current) return;
          for (const [name,value] of [["firstName",record?.first_name ?? ""],["lastName",record?.last_name ?? ""],["memberNumber",record?.member_number ?? ""]]) {
            const input = formRef.current.elements.namedItem(name);
            if (input instanceof HTMLInputElement) input.value = value;
          }
        }} />}
        <input type="hidden" name="selectedRecordId" value={selectedRecord?.record_id ?? ""} />
        <Field
            label="First name"
            name="firstName"
            defaultValue={existingRequest?.firstName}
            required
            error={state.errors?.firstName?.[0]}
          />
          <Field
            label="Last name"
            name="lastName"
            defaultValue={existingRequest?.lastName}
            required
            error={state.errors?.lastName?.[0]}
          />
          <Field
            label="Email"
            name="email"
            defaultValue={existingRequest?.email}
            type="email"
            required
            error={state.errors?.email?.[0]}
          />
          <Field
            label="Phone"
            name="phone"
            defaultValue={existingRequest?.phone ?? ""}
            type="tel"
            error={state.errors?.phone?.[0]}
          />
          <Field
            label={
              requiresBirthDate
                ? "Birth date"
                : "Birth date (required for age classes)"
            }
            name="birthDate"
            defaultValue={existingRequest?.birthDate ?? ""}
            type="date"
            required={requiresBirthDate}
            error={state.errors?.birthDate?.[0]}
          />
          <label className="block text-sm font-semibold">
            Competition gender
            <select
              name="competitionGender"
              defaultValue={existingRequest?.competitionGender ?? ""}
              className={inputClass}
              required
            >
              <option value="" disabled>
                Select gender
              </option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </select>
            {state.errors?.competitionGender ? (
              <span className="mt-1.5 block text-xs font-medium text-rose-700">
                {state.errors.competitionGender[0]}
              </span>
            ) : null}
          </label>
          <Field
            label={
              requireMemberships ? "Member number (if applicable)" : "Roper number (if known)"
            }
            name="memberNumber"
            defaultValue={existingRequest?.memberNumber ?? ""}
            required={false}
            error={state.errors?.memberNumber?.[0]}
          />
        </fieldset>
        <div className="mt-4" aria-busy={checkingEligibility}>
          <button type="button" disabled={checkingEligibility || checkingAllowance || pending} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold" onClick={() => startEligibilityCheck(async () => {
            if (!formRef.current) return;
            const details = new FormData(formRef.current);
            if (existingRequest) { details.set("email", existingRequest.email); details.set("memberNumber", existingRequest.memberNumber ?? ""); }
            try {
              const result = await loadOnlineEntryEligibility(producerSlug, eventSlug, details);
              setEligibility(result.checks ?? []);
              setFeeContext(result.coveredFeeKeys ? { coveredFeeKeys: result.coveredFeeKeys, balanceDueCents: result.balanceDueCents ?? 0, creditCents: result.creditCents ?? 0 } : null);
              setEligibilityMessage(result.error ?? result.feeError ?? "Eligibility and current charges checked against your connected membership. The producer rechecks before accepting entries.");
            } catch {
              setEligibility([]);
              setFeeContext(null);
              setEligibilityMessage("Unable to check eligibility right now. Try again or contact the producer.");
            }
          })}>{checkingEligibility ? <LoaderCircle size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}{checkingEligibility ? "Checking eligibility…" : "Check eligibility"}</button>
          {eligibilityMessage && <p role="status" className="mt-2 text-xs leading-5 text-[#66716b]">{eligibilityMessage}</p>}
        </div>
        {divisions.some((division) => division.qualification) && <div className="mt-4">
          <button type="button" disabled={checkingAllowance || pending} onClick={() => startAllowanceCheck(async () => {
            if (!formRef.current) return;
            const details = new FormData(formRef.current);
            if (existingRequest) { details.set("email", existingRequest.email); details.set("memberNumber", existingRequest.memberNumber ?? ""); }
            const result = await loadOnlineFinalsAllowance(producerSlug, eventSlug, details);
            setAllowances(result.allowances ?? []);
            setSelected((current) => Object.fromEntries(Object.entries(current).map(([id, selected]) => [id, result.allowances?.some((item) => item.event_roping_id === id && item.remaining_entries === 0) ? false : selected])));
            setAllowanceMessage(result.error ?? (result.allowances?.length ? "Finals entry allowances updated." : "No bonus entry allowance found for these membership details."));
            setQuantities({});
          })} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold">{checkingAllowance && <LoaderCircle size={15} className="animate-spin" />}Check bonus entries</button>
          {allowanceMessage && <p role="status" className="mt-2 text-xs text-[#66716b]">{allowanceMessage}</p>}
        </div>}
        <label className="absolute left-[-10000px]" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </section>

      <fieldset disabled={pending} className="min-w-0">
        <legend className="text-lg font-bold">Ropings</legend>
        <p className="mt-1 text-sm text-[#66716b]">
          Select each division and classification you want to enter, then choose
          the number of entries.
        </p>
        <div className="mt-4 divide-y divide-[#e7ebe8] overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
          {divisions.map((division) => {
            const isSelected = selected[division.id] ?? false;
            const quantity = quantities[division.id] ?? 1;
            const allowance = allowances?.find((item) => item.event_roping_id === division.id);
            const eligibilityCheck = eligibility.find((item) => item.event_roping_id === division.id);
            const maximum = eligibilityCheck ? eligibilityCheck.remaining_entries ?? 20 : allowance ? allowance.remaining_entries ?? 20 : Math.max(division.maximumEntries ?? 20, existingRequest?.items.find((item) => item.id === division.id)?.quantity ?? 0);
            return (
              <div key={division.id} className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <input
                    id={`division-${division.id}`}
                    name="divisionIds"
                    value={division.id}
                    type="checkbox"
                    disabled={maximum === 0}
                    checked={isSelected}
                    onChange={(event) =>
                      setSelected((current) => ({
                        ...current,
                        [division.id]: event.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 accent-[var(--brand-accent)]"
                  />
                  <div
                    className="min-w-0 flex-1"
                  >
                    <label htmlFor={`division-${division.id}`} className="font-bold">{division.name}</label>
                    {eligibilityCheck && <EntryEligibilityFeedback check={eligibilityCheck} />}
                    {division.qualification ? <span className="mt-2 block text-xs font-semibold leading-5 text-amber-800">{qualificationNoticeText(division.qualification)}</span> : null}
                    {allowance && <span className="mt-1 block text-xs font-semibold text-emerald-700">{allowance.normal_entries === null ? "Unlimited entries" : `${allowance.normal_entries} regular + ${allowance.bonus_entries} bonus · ${allowance.remaining_entries} available`}</span>}
                    {division.description ? (
                      <span className="mt-1 block text-sm leading-5 text-[#66716b]">
                        {division.description}
                      </span>
                    ) : null}
                    <span className="mt-2 block text-xs font-semibold text-[#758078]">
                      Required fees from{" "}
                      {formatCurrency(division.estimatedFirstEntryCents)}
                      {requireMemberships ? " · Membership approval required before competing" : " · No membership required"}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-[var(--brand-accent-strong)]">
                      {division.eligibilityType === "open"
                        ? "Open classification · Other eligibility rules still apply"
                        : division.eligibilityType === "age"
                          ? division.minimumAge !== null &&
                            division.maximumAge !== null
                            ? `Ages ${division.minimumAge}-${division.maximumAge}`
                            : division.minimumAge !== null
                              ? `${division.minimumAge} and over`
                              : `${division.maximumAge} and under`
                          : "Skill classification applies"}
                    </span>
                    <span className="mt-1 block text-xs text-[#758078]">
                      {division.scheduleType === "follows_previous"
                        ? `${division.scheduledDate} · Follows ${division.followsRopingName ?? "previous roping"}`
                        : `${division.startsAt ?? division.scheduledDate}${
                            division.scheduleType === "tentative"
                              ? " · Tentative"
                              : ""
                          }`}
                      {division.scheduleNote
                        ? ` · ${division.scheduleNote}`
                        : ""}
                    </span>
                    {division.incentiveEnabled ? (
                      <span className="mt-2 inline-flex rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                        Incentive handicaps applied automatically
                      </span>
                    ) : null}
                    {division.options.length ? (
                      <span className="mt-3 block space-y-2">
                        {division.options.map((option) => (
                          <label
                            key={option.id}
                            className="flex items-center gap-3 rounded-md border border-[#e1e6e3] bg-[#fafbfa] p-3"
                          >
                            <input
                              name={`option-${division.id}`}
                              value={option.id}
                              type="checkbox"
                              disabled={!isSelected}
                              checked={selectedOptions[`${division.id}:${option.id}`] ?? false}
                              onChange={(event) => setSelectedOptions((current) => ({ ...current, [`${division.id}:${option.id}`]: event.target.checked }))}
                              className="h-4 w-4 accent-[var(--brand-accent)]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-semibold text-[#17201c]">
                                {option.title}
                              </span>
                              <span className="block text-xs capitalize text-[#758078]">
                                {option.kind.replace("_", " ")} ·{" "}
                                {option.scope.replaceAll("_", " ")}
                              </span>
                            </span>
                            <span className="text-sm font-bold text-[#17201c]">
                              {formatCurrency(option.amountCents)}
                            </span>
                          </label>
                        ))}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex h-9 shrink-0 items-center rounded-md border border-[#ccd4d0] bg-white">
                    <button
                      type="button"
                      aria-label={`Remove one ${division.name} entry`}
                      disabled={!isSelected || quantity <= 1}
                      onClick={() =>
                        setQuantities((current) => ({
                          ...current,
                          [division.id]: Math.max(1, quantity - 1),
                        }))
                      }
                      className="grid h-9 w-9 place-items-center disabled:opacity-30"
                    >
                      <Minus size={15} />
                    </button>
                    <input
                      type="hidden"
                      name={`quantity-${division.id}`}
                      value={quantity}
                    />
                    <span className="w-8 text-center text-sm font-bold">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Add one ${division.name} entry`}
                      disabled={!isSelected || quantity >= maximum}
                      onClick={() =>
                        setQuantities((current) => ({
                          ...current,
                          [division.id]: Math.min(maximum, quantity + 1),
                        }))
                      }
                      className="grid h-9 w-9 place-items-center disabled:opacity-30"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {state.errors?.divisionIds ? (
          <p className="mt-2 text-xs font-semibold text-rose-700">
            {state.errors.divisionIds[0]}
          </p>
        ) : null}
      </fieldset>

      {summary.length > 0 && <section aria-label="Review entry request" className="border-y border-[#dfe4e1] py-5">
        <h2 className="text-lg font-bold">Review entry request</h2>
        <ul className="mt-3 divide-y divide-[#e7ebe8]">
          {summary.map((roping) => <li key={roping.id} className="py-3 text-sm">
            <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold">{roping.name}</span><span>{roping.quantity} {roping.quantity === 1 ? "entry" : "entries"}</span></div>
            <ul className="mt-2 space-y-1 text-[#66716b]">{roping.requiredFees.map((fee, index) => <li key={index} className="flex flex-wrap justify-between gap-2"><span>{fee.title}</span><span>{fee.alreadyApplied ? "Already applied" : fee.units === 0 ? "Included above" : formatCurrency(fee.amountCents)}</span></li>)}</ul>
            {roping.options.length ? <ul className="mt-2 space-y-1 text-[#66716b]">{roping.options.map((option, index) => <li key={index} className="flex flex-wrap justify-between gap-2"><span>{option.title}</span><span>{option.alreadyApplied ? "Already applied" : option.units === 0 ? "Included above" : formatCurrency(option.amountCents)}</span></li>)}</ul> : <p className="mt-1 text-[#66716b]">No optional pots selected</p>}
          </li>)}
        </ul>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><dt>Required fees</dt><dd>{formatCurrency(requiredTotal)}</dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt>Optional fees</dt><dd>{formatCurrency(optionalTotal)}</dd></div>
          {feeContext && <><div className="flex flex-wrap justify-between gap-2"><dt>Existing balance due</dt><dd>{formatCurrency(feeContext.balanceDueCents)}</dd></div>{feeContext.creditCents > 0 && <div className="flex flex-wrap justify-between gap-2"><dt>Available credit</dt><dd>{formatCurrency(feeContext.creditCents)}</dd></div>}</>}
          <div className="flex flex-wrap justify-between gap-2 border-t border-[#dfe4e1] pt-3 font-bold"><dt>Estimated {feeContext ? "amount due" : "total"}</dt><dd>{formatCurrency(Math.max(0,requiredTotal + optionalTotal + (feeContext?.balanceDueCents ?? 0) - (feeContext?.creditCents ?? 0)))}</dd></div>
        </dl>
        <p className="mt-2 text-xs leading-5 text-[#66716b]">{feeContext ? "Existing once-per-roping and event charges are not charged again. This includes your current event balance and available credit. The producer confirms the final amount." : "This estimate includes the selected entries and charges, not your existing balance. Check eligibility to include current charges from your connected membership."}</p>
      </section>}

      <label className="block text-sm font-semibold">
        Note for the event office
        <textarea
          name="note"
          defaultValue={existingRequest?.note ?? ""}
          rows={4}
          maxLength={500}
          className="mt-2 w-full rounded-md border border-[#ccd4d0] bg-white p-3 outline-none focus:border-[var(--brand-accent)]"
          placeholder="Optional details or questions"
        />
        {state.errors?.note ? (
          <span className="mt-1 block text-xs text-rose-700">
            {state.errors.note[0]}
          </span>
        ) : null}
      </label>

      {state.message ? (
        <p
          className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}
      <div className="border-t border-[#dfe4e1] pt-5">
        <button
          disabled={pending || !Object.values(selected).some(Boolean)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-md brand-accent-fill px-5 text-sm font-bold text-white disabled:opacity-50 sm:w-auto"
        >
          {pending ? <LoaderCircle size={17} className="animate-spin" /> : null}
          {pending ? "Saving request..." : existingRequest ? "Save changes" : "Submit entry request"}
        </button>
        <p className="mt-3 text-xs leading-5 text-[#758078]">
          Submitting does not guarantee entry. The event office will review
          eligibility and collect payment in person.
        </p>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required = false,
  error,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  error?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      {type === "tel" ? (
        <PhoneInput name={name} defaultValue={defaultValue} required={required} className={inputClass} />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue}
          className={inputClass}
        />
      )}
      {error ? (
        <span className="mt-1 block text-xs text-rose-700">{error}</span>
      ) : null}
    </label>
  );
}
