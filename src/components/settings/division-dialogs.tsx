"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Pencil, Plus, X } from "lucide-react";
import {
  createDivision,
  createFee,
  deleteDivision,
  deleteFee,
  updateDivision,
  updateFee,
  type SettingsFormState,
} from "@/app/(app)/settings/divisions/actions";
import { DeleteRecordButton } from "@/components/settings/delete-record-button";
import { FourDSettingsFields } from "@/components/settings/four-d-settings-fields";
import type {
  CompetitionFormat,
  DivisionTemplateSummary,
  FeeTemplateSummary,
} from "@/types/domain";

const initialState: SettingsFormState = {};
const inputClass =
  "mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]";

export interface DivisionOption {
  id: string;
  name: string;
  classifications: Array<{ id: string; name: string }>;
}

interface PayoutOption {
  id: string;
  name: string;
}

function DialogFrame({
  title,
  description,
  close,
  children,
}: {
  title: string;
  description: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/45 p-4">
      <button
        aria-label="Close dialog"
        className="absolute inset-0"
        onClick={close}
      />
      <section
        role="dialog"
        aria-modal="true"
        className="relative my-8 w-full max-w-2xl rounded-md bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-[#66716b]">
              {description}
            </p>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#f0f2f1]"
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function FormMessage({ state }: { state: SettingsFormState }) {
  return state.message ? (
    <p
      className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
    >
      {state.message}
    </p>
  ) : null;
}

function EventTemplateDialog({
  configured,
  divisions,
  payoutSchedules,
  template,
}: {
  configured: boolean;
  divisions: DivisionOption[];
  payoutSchedules: PayoutOption[];
  template?: DivisionTemplateSummary;
}) {
  const [open, setOpen] = useState(false);
  const [disciplineId, setDisciplineId] = useState(
    template?.disciplineId ?? divisions[0]?.id ?? "",
  );
  const [competitionFormat, setCompetitionFormat] = useState<CompetitionFormat>(
    template?.competitionFormat ?? "standard",
  );
  const [state, action, pending] = useActionState(
    template ? updateDivision : createDivision,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const classifications = useMemo(
    () =>
      divisions.find((division) => division.id === disciplineId)
        ?.classifications ?? [],
    [disciplineId, divisions],
  );
  const isEditing = Boolean(template);
  useEffect(() => {
    if (!state.success) return;
    formRef.current?.reset();
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          isEditing
            ? "grid h-9 w-9 place-items-center rounded-md border border-[#d7ddda] hover:bg-[#f7f8f7]"
            : "flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white"
        }
        aria-label={isEditing ? `Edit ${template?.name}` : undefined}
      >
        {isEditing ? (
          <Pencil size={16} />
        ) : (
          <>
            <Plus size={17} /> New event template
          </>
        )}
      </button>
      {open ? (
        <DialogFrame
          title={isEditing ? `Edit ${template?.name}` : "Create event template"}
          description="Define the reusable division, classification, entry rules, timing, fees, and payout defaults copied into a new roping."
          close={() => setOpen(false)}
        >
          <form ref={formRef} action={action} className="space-y-4 p-5">
            {template ? (
              <input type="hidden" name="divisionId" value={template.id} />
            ) : null}
            <label className="block text-sm font-semibold">
              Template name
              <input
                name="name"
                defaultValue={template?.name}
                className={inputClass}
                placeholder="Breakaway · 11.5"
                required
              />
              {state.errors?.name ? (
                <span className="mt-1 block text-xs text-rose-700">
                  {state.errors.name[0]}
                </span>
              ) : null}
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Division
                <select
                  name="disciplineId"
                  value={disciplineId}
                  onChange={(event) => setDisciplineId(event.target.value)}
                  className={inputClass}
                  required
                >
                  <option value="">Choose a division</option>
                  {divisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Classification
                <select
                  name="classificationId"
                  defaultValue={template?.classificationId ?? ""}
                  key={disciplineId}
                  className={inputClass}
                  required
                >
                  <option value="">Choose a classification</option>
                  {classifications.map((classification) => (
                    <option key={classification.id} value={classification.id}>
                      {classification.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block text-sm font-semibold">
              Competition format
              <select
                name="competitionFormat"
                value={competitionFormat}
                onChange={(event) =>
                  setCompetitionFormat(event.target.value as CompetitionFormat)
                }
                className={inputClass}
              >
                <option value="standard">Standard aggregate</option>
                <option value="handicap">Handicap</option>
                <option value="four_d">4D time brackets</option>
              </select>
              <span className="mt-1 block text-xs font-normal leading-5 text-[#66716b]">
                {competitionFormat === "standard"
                  ? "Contestants place by round and aggregate without a class handicap."
                  : competitionFormat === "handicap"
                    ? "Classification adjustments are applied to each contestant's final time."
                    : "A single final time is placed into a D according to its distance from the fastest time."}
              </span>
            </label>
            {competitionFormat === "four_d" ? (
              <FourDSettingsFields initialSettings={template?.fourDSettings} />
            ) : null}
            <label className="block text-sm font-semibold">
              Description
              <textarea
                name="description"
                defaultValue={template?.description}
                className="mt-2 min-h-20 w-full rounded-md border border-[#ccd4d0] p-3 outline-none focus:border-[var(--brand-accent)]"
                placeholder="Eligibility or event setup notes"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Maximum entries per contestant
                <input
                  name="maximumEntries"
                  defaultValue={template?.maximumEntriesPerPerson ?? ""}
                  type="number"
                  min="1"
                  max="100"
                  className={inputClass}
                  placeholder="No limit"
                />
              </label>
              <label className="block text-sm font-semibold">
                Minimum runs between entries
                <input
                  name="minimumRunsBetweenEntries"
                  defaultValue={template?.minimumRunsBetweenEntries ?? 0}
                  type="number"
                  min="0"
                  max="100"
                  className={inputClass}
                  required
                />
              </label>
              <label className="block text-sm font-semibold">
                Payout schedule
                <select
                  name="payoutScheduleId"
                  defaultValue={template?.payoutScheduleId ?? ""}
                  className={inputClass}
                >
                  <option value="">No default schedule</option>
                  {payoutSchedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Number of timers
                <input
                  name="timerCount"
                  defaultValue={template?.timerCount ?? 1}
                  type="number"
                  min="1"
                  max="10"
                  className={inputClass}
                  required
                />
              </label>
              <label className="block text-sm font-semibold">
                Official time uses
                <select
                  name="timerResolution"
                  defaultValue={template?.timerResolution ?? "average"}
                  className={inputClass}
                >
                  <option value="average">Average of all timers</option>
                  <option value="best">Best (fastest) timer</option>
                  <option value="longest">Longest timer</option>
                </select>
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-md border border-[#e1e6e3] p-3 text-sm font-semibold">
                <input
                  name="allowGuests"
                  type="checkbox"
                  defaultChecked={template?.allowGuests}
                  className="h-4 w-4 accent-[var(--brand-accent)]"
                />{" "}
                Allow non-members to enter
              </label>
              <label className="flex items-center gap-3 rounded-md border border-[#e1e6e3] p-3 text-sm font-semibold">
                <input
                  name="isActive"
                  type="checkbox"
                  defaultChecked={template?.isActive ?? true}
                  className="h-4 w-4 accent-[var(--brand-accent)]"
                />{" "}
                Active for new ropings
              </label>
            </div>
            <FormMessage state={state} />
            {!configured ? (
              <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                Connect Supabase to save organization settings.
              </p>
            ) : null}
            <div className="flex flex-wrap justify-end gap-2 border-t border-[#e7ebe8] pt-4">
              {template ? (
                <div className="mr-auto">
                  <DeleteRecordButton
                    recordType="template"
                    recordName={template.name}
                    warning="This removes the reusable template and its template fees. Ropings already created from it keep their copied settings and results."
                    disabled={!configured}
                    onDelete={() => deleteDivision(template.id)}
                    onDeleted={() => setOpen(false)}
                  />
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={pending || !configured || !divisions.length}
                className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {pending ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : null}
                {isEditing ? "Save changes" : "Create template"}
              </button>
            </div>
          </form>
        </DialogFrame>
      ) : null}
    </>
  );
}

export function CreateDivisionDialog({
  configured,
  divisions,
  payoutSchedules,
}: {
  configured: boolean;
  divisions: DivisionOption[];
  payoutSchedules: PayoutOption[];
}) {
  return (
    <EventTemplateDialog
      configured={configured}
      divisions={divisions}
      payoutSchedules={payoutSchedules}
    />
  );
}
export function EditDivisionDialog({
  configured,
  divisions,
  payoutSchedules,
  template,
}: {
  configured: boolean;
  divisions: DivisionOption[];
  payoutSchedules: PayoutOption[];
  template: DivisionTemplateSummary;
}) {
  return (
    <EventTemplateDialog
      configured={configured}
      divisions={divisions}
      payoutSchedules={payoutSchedules}
      template={template}
    />
  );
}

function FeeDialog({
  divisionId,
  divisionName,
  configured,
  payoutSchedules,
  fee,
}: {
  divisionId: string;
  divisionName: string;
  configured: boolean;
  payoutSchedules: PayoutOption[];
  fee?: FeeTemplateSummary;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(fee?.kind ?? "standard");
  const [isRequired, setIsRequired] = useState(fee?.isRequired ?? true);
  const [state, action, pending] = useActionState(
    fee ? updateFee : createFee,
    initialState,
  );
  const isEditing = Boolean(fee);
  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          isEditing
            ? "grid h-8 w-8 place-items-center rounded-md hover:bg-[#f1f3f2]"
            : "flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-accent-strong)]"
        }
        aria-label={isEditing ? `Edit ${fee?.title}` : undefined}
      >
        {isEditing ? (
          <Pencil size={15} />
        ) : (
          <>
            <Plus size={14} /> Add fee or option
          </>
        )}
      </button>
      {open ? (
        <DialogFrame
          title={
            isEditing
              ? `Edit ${fee?.title}`
              : `Add fee or option to ${divisionName}`
          }
          description="Configure a required fee, optional insurance, side pot, or another event option."
          close={() => setOpen(false)}
        >
          <form action={action} className="space-y-4 p-5">
            <input type="hidden" name="divisionId" value={divisionId} />
            {fee ? <input type="hidden" name="feeId" value={fee.id} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Title
                <input
                  name="title"
                  defaultValue={fee?.title}
                  className={inputClass}
                  placeholder="Stock fee"
                  required
                />
              </label>
              <label className="block text-sm font-semibold">
                Amount
                <div className="relative">
                  <span className="absolute left-3 top-[21px] text-sm text-[#758078]">
                    $
                  </span>
                  <input
                    name="amount"
                    defaultValue={fee ? (fee.amountCents / 100).toFixed(2) : ""}
                    inputMode="decimal"
                    className={`${inputClass} pl-7`}
                    placeholder="10.00"
                    required
                  />
                </div>
              </label>
              <label className="block text-sm font-semibold">
                Type
                <select
                  name="kind"
                  value={kind}
                  onChange={(event) => {
                    setKind(
                      event.target.value as NonNullable<
                        FeeTemplateSummary["kind"]
                      >,
                    );
                    if (!isEditing)
                      setIsRequired(event.target.value === "standard");
                  }}
                  className={inputClass}
                >
                  <option value="standard">Standard fee</option>
                  <option value="insurance">Insurance</option>
                  <option value="side_pot">Side pot</option>
                  <option value="other">Other option</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Applied
                <select
                  name="scope"
                  defaultValue={fee?.scope ?? "entry"}
                  className={inputClass}
                >
                  <option value="entry">Each entry</option>
                  <option value="contestant_division">
                    Once per contestant in this template
                  </option>
                  <option value="contestant_event">
                    Once per contestant at the event
                  </option>
                </select>
              </label>
            </div>
            {kind === "side_pot" || kind === "insurance" ? (
              <label className="block text-sm font-semibold">
                {kind === "insurance" ? "Insurance" : "Side pot"} payout
                schedule
                <select
                  name="payoutScheduleId"
                  defaultValue={fee?.payoutScheduleId ?? ""}
                  className={inputClass}
                  required
                >
                  <option value="">Choose a schedule</option>
                  {payoutSchedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <input type="hidden" name="payoutScheduleId" value="" />
            )}
            <div className="space-y-2">
              <label className="flex items-center gap-3 rounded-md border border-[#e1e6e3] p-3 text-sm font-semibold">
                <input
                  name="isRequired"
                  type="checkbox"
                  checked={isRequired}
                  onChange={(event) => setIsRequired(event.target.checked)}
                  className="h-4 w-4 accent-[var(--brand-accent)]"
                />{" "}
                Required with the entry
              </label>
              <label className="flex items-center gap-3 rounded-md border border-[#e1e6e3] p-3 text-sm font-semibold">
                <input
                  name="includedInEntryPrice"
                  type="checkbox"
                  defaultChecked={fee?.includedInEntryPrice}
                  className="h-4 w-4 accent-[var(--brand-accent)]"
                />{" "}
                Include in displayed entry price
              </label>
              {kind !== "side_pot" && kind !== "insurance" ? (
                <label className="flex items-center gap-3 rounded-md border border-[#e1e6e3] p-3 text-sm font-semibold">
                  <input
                    name="contributesToPayout"
                    type="checkbox"
                    defaultChecked={fee?.contributesToPayout}
                    className="h-4 w-4 accent-[var(--brand-accent)]"
                  />{" "}
                  Include in the main payout pool
                </label>
              ) : (
                <p className="rounded-md bg-[#f7f8f7] p-3 text-xs leading-5 text-[#66716b]">
                  Each selected{" "}
                  {kind === "insurance" ? "insurance" : "side pot"}
                  entry forms part of a separate payout pool using this
                  schedule.
                </p>
              )}
            </div>
            <FormMessage state={state} />
            <div className="flex flex-wrap justify-end gap-2 border-t border-[#e7ebe8] pt-4">
              {fee ? (
                <div className="mr-auto">
                  <DeleteRecordButton
                    recordType="fee"
                    recordName={fee.title}
                    warning="This removes the fee or option from this template. Existing ropings keep the fee that was copied when they were created."
                    disabled={!configured}
                    onDelete={() => deleteFee(fee.id)}
                    onDeleted={() => setOpen(false)}
                  />
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={
                  pending ||
                  !configured ||
                  ((kind === "side_pot" || kind === "insurance") &&
                    !payoutSchedules.length)
                }
                className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {pending ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : null}
                {isEditing ? "Save changes" : "Add"}
              </button>
            </div>
          </form>
        </DialogFrame>
      ) : null}
    </>
  );
}

export function AddFeeDialog(props: {
  divisionId: string;
  divisionName: string;
  configured: boolean;
  payoutSchedules: PayoutOption[];
}) {
  return <FeeDialog {...props} />;
}
export function EditFeeDialog(props: {
  divisionId: string;
  divisionName: string;
  configured: boolean;
  payoutSchedules: PayoutOption[];
  fee: FeeTemplateSummary;
}) {
  return <FeeDialog {...props} />;
}
