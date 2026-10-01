"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, LoaderCircle, Minus, Plus } from "lucide-react";
import {
  submitOnlineEntry,
  type OnlineEntryFormState,
} from "@/app/public/[organizationSlug]/[ropingSlug]/enter/actions";
import { formatCurrency } from "@/lib/utils";

const inputClass =
  "mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]";

interface EntryDivision {
  id: string;
  name: string;
  description: string | null;
  maximumEntries: number | null;
  allowGuests: boolean;
  estimatedFirstEntryCents: number;
  startsAt: string | null;
  scheduledDate: string;
  scheduleType: "fixed" | "tentative" | "follows_previous";
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
  organizationSlug,
  ropingSlug,
  allowGuests,
  divisions,
}: {
  organizationSlug: string;
  ropingSlug: string;
  allowGuests: boolean;
  divisions: EntryDivision[];
}) {
  const action = submitOnlineEntry.bind(null, organizationSlug, ropingSlug);
  const [state, formAction, pending] = useActionState<
    OnlineEntryFormState,
    FormData
  >(action, {});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const requiresBirthDate = divisions.some(
    (division) => selected[division.id] && division.eligibilityType === "age",
  );

  if (state.success) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-6 text-emerald-900">
        <CheckCircle2 size={24} />
        <h2 className="mt-3 text-lg font-bold">Entry request received</h2>
        <p className="mt-2 text-sm leading-6">{state.message}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-7">
      <section>
        <h2 className="text-lg font-bold">Contestant information</h2>
        <p className="mt-1 text-sm text-[#66716b]">
          Use the email address associated with your membership when applicable.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="First name"
            name="firstName"
            required
            error={state.errors?.firstName?.[0]}
          />
          <Field
            label="Last name"
            name="lastName"
            required
            error={state.errors?.lastName?.[0]}
          />
          <Field
            label="Email"
            name="email"
            type="email"
            required
            error={state.errors?.email?.[0]}
          />
          <Field
            label="Phone"
            name="phone"
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
            type="date"
            required={requiresBirthDate}
            error={state.errors?.birthDate?.[0]}
          />
          <Field
            label={
              allowGuests ? "Member number (if applicable)" : "Member number"
            }
            name="memberNumber"
            required={!allowGuests}
            error={state.errors?.memberNumber?.[0]}
          />
        </div>
        <label className="absolute left-[-10000px]" aria-hidden="true">
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </section>

      <fieldset>
        <legend className="text-lg font-bold">Classes</legend>
        <p className="mt-1 text-sm text-[#66716b]">
          Select each division and classification you want to enter, then choose
          the number of entries.
        </p>
        <div className="mt-4 divide-y divide-[#e7ebe8] overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
          {divisions.map((division) => {
            const isSelected = selected[division.id] ?? false;
            const quantity = quantities[division.id] ?? 1;
            const maximum = division.maximumEntries ?? 20;
            return (
              <div key={division.id} className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <input
                    id={`division-${division.id}`}
                    name="divisionIds"
                    value={division.id}
                    type="checkbox"
                    checked={isSelected}
                    onChange={(event) =>
                      setSelected((current) => ({
                        ...current,
                        [division.id]: event.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 accent-[var(--brand-accent)]"
                  />
                  <label
                    htmlFor={`division-${division.id}`}
                    className="min-w-0 flex-1"
                  >
                    <span className="font-bold">{division.name}</span>
                    {division.description ? (
                      <span className="mt-1 block text-sm leading-5 text-[#66716b]">
                        {division.description}
                      </span>
                    ) : null}
                    <span className="mt-2 block text-xs font-semibold text-[#758078]">
                      Required fees from{" "}
                      {formatCurrency(division.estimatedFirstEntryCents)}
                      {division.allowGuests
                        ? " · Guest entries allowed"
                        : " · Active members only"}
                    </span>
                    <span className="mt-1 block text-xs font-semibold text-[var(--brand-accent-strong)]">
                      {division.eligibilityType === "open"
                        ? "Open to any contestant"
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
                        ? `${division.scheduledDate} · Follows previous roping`
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
                  </label>
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

      <label className="block text-sm font-semibold">
        Note for the event office
        <textarea
          name="note"
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
          Submit entry request
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
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        className={inputClass}
      />
      {error ? (
        <span className="mt-1 block text-xs text-rose-700">{error}</span>
      ) : null}
    </label>
  );
}
