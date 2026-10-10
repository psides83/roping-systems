"use client";
import { NumberStepper } from "@/components/ui/number-stepper";
import { useProducerFeatures } from "@/components/settings/producer-features-context";
import { featureEnabled } from "@/lib/producer-features";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { Check, Copy, LoaderCircle, Pencil, Plus, X } from "lucide-react";
import {
  createDivision,
  createFee,
  deleteDivision,
  deleteFee,
  duplicateDivision,
  updateDivision,
  updateFee,
  type SettingsFormState,
} from "@/app/(app)/settings/roping-templates/actions";
import { DeleteRecordButton } from "@/components/settings/delete-record-button";
import { ShortRoundFields } from "@/components/events/short-round-settings";
import type {
  CompetitionFormat,
  DivisionTemplateSummary,
  FeeTemplateSummary,
  RoundOrderMethod,
} from "@/types/domain";

const initialState: SettingsFormState = {};
const inputClass =
  "mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]";

const roundOrderOptions: Array<{
  value: RoundOrderMethod;
  label: string;
}> = [
  { value: "reverse_first", label: "Reverse first-round order" },
  {
    value: "aggregate_slowest_to_fastest",
    label: "Slowest aggregate to fastest",
  },
  { value: "custom", label: "Custom / manual order" },
];

export interface DivisionOption {
  id: string;
  name: string;
}

export interface ClassificationOption {
  id: string;
  disciplineId: string;
  name: string;
  handicapAdjustmentSeconds: number | null;
}

interface PayoutOption {
  id: string;
  name: string;
  competitionFormat: "standard" | "four_d";
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
  classifications,
  template,
}: {
  configured: boolean;
  divisions: DivisionOption[];
  payoutSchedules: PayoutOption[];
  classifications: ClassificationOption[];
  template?: DivisionTemplateSummary;
}) {
  const [open, setOpen] = useState(false);
  const [disciplineId, setDisciplineId] = useState(
    template?.disciplineId ?? divisions[0]?.id ?? "",
  );
  const [competitionFormat, setCompetitionFormat] = useState<CompetitionFormat>(
    template?.competitionFormat ?? "standard",
  );
  const [handicapClassificationIds, setHandicapClassificationIds] = useState<
    Set<string>
  >(() => new Set(Object.keys(template?.handicapRules ?? {})));
  const [state, action, pending] = useActionState(
    template ? updateDivision : createDivision,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const compatiblePayoutSchedules = payoutSchedules.filter(
    (schedule) =>
      schedule.competitionFormat ===
      (competitionFormat === "four_d" ? "four_d" : "standard"),
  );
  const isEditing = Boolean(template);
  const handicapClassifications = classifications.filter(
    (classification) =>
      classification.disciplineId === disciplineId &&
      classification.handicapAdjustmentSeconds !== null,
  );
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
            <Plus size={17} /> New roping template
          </>
        )}
      </button>
      {open ? (
        <DialogFrame
          title={
            isEditing ? `Edit ${template?.name}` : "Create roping template"
          }
          description="Define reusable format, entry, timing, fee, and payout defaults for one division. Choose the classification when adding each roping to an event."
          close={() => setOpen(false)}
        >
          <form ref={formRef} action={action} className="space-y-4 p-5">
            <input
              type="hidden"
              name="handicapRules"
              value={JSON.stringify(
                handicapClassifications
                  .filter((classification) =>
                    handicapClassificationIds.has(classification.id),
                  )
                  .map((classification) => ({
                    classificationId: classification.id,
                    adjustmentSeconds: classification.handicapAdjustmentSeconds,
                  })),
              )}
            />
            {template ? (
              <input type="hidden" name="divisionId" value={template.id} />
            ) : null}
            <label className="block text-sm font-semibold">
              Template name
              <input
                name="name"
                defaultValue={template?.name}
                className={inputClass}
                placeholder="Standard breakaway format"
                required
              />
              {state.errors?.name ? (
                <span className="mt-1 block text-xs text-rose-700">
                  {state.errors.name[0]}
                </span>
              ) : null}
            </label>
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
            {competitionFormat === "handicap" ? (
              <div className="rounded-md border border-[#dfe4e1] bg-[#fafbfa] p-4">
                <p className="text-sm font-bold">Eligible classifications</p>
                <p className="mt-1 text-xs leading-5 text-[#66716b]">
                  Select the member classifications that can enter this Handicap
                  roping. Time adjustments are managed on the classification
                  records.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {handicapClassifications.map((classification) => (
                    <label
                      key={classification.id}
                      className="flex items-center gap-3 rounded-md border border-[#e1e6e3] bg-white px-3 py-2"
                    >
                      <input
                        type="checkbox"
                        checked={handicapClassificationIds.has(
                          classification.id,
                        )}
                        onChange={(event) =>
                          setHandicapClassificationIds((current) => {
                            const next = new Set(current);
                            if (event.target.checked)
                              next.add(classification.id);
                            else next.delete(classification.id);
                            return next;
                          })
                        }
                        className="h-4 w-4 accent-[var(--brand-accent)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {classification.name}
                      </span>
                      <span className="font-mono text-xs text-[#66716b]">
                        {classification.handicapAdjustmentSeconds !== null &&
                        classification.handicapAdjustmentSeconds >= 0
                          ? "+"
                          : ""}
                        {classification.handicapAdjustmentSeconds?.toFixed(2)}{" "}
                        sec
                      </span>
                    </label>
                  ))}
                </div>
                {!handicapClassifications.length ? (
                  <p className="mt-3 text-xs font-semibold text-amber-800">
                    Add a Handicap time adjustment to member classifications
                    such as Open, A, B, and C first.
                  </p>
                ) : null}
              </div>
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
                Member roping count
                <select name="attendanceCountMode" defaultValue={template?.attendanceCountMode ?? "once_per_roping"} className={inputClass}>
                  <option value="once_per_roping">Once per roping</option>
                  <option value="per_entry">Each entry</option>
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Main rounds
                <NumberStepper label="Main rounds"
                  name="numberOfRuns"
                  defaultValue={template?.numberOfRuns ?? 1}
                  min="1"
                  max="20"
                  className={inputClass}
                  required
                />
              </label>
              <label className="block text-sm font-semibold">
                Maximum entries per contestant
                <NumberStepper label="Maximum entries per contestant"
                  name="maximumEntries"
                  defaultValue={template?.maximumEntriesPerPerson ?? ""}
                  min="1"
                  max="100"
                  className={inputClass}
                  placeholder="No limit"
                />
              </label>
              <label className="block text-sm font-semibold">
                Minimum runs between entries
                <NumberStepper label="Minimum runs between entries"
                  name="minimumRunsBetweenEntries"
                  defaultValue={template?.minimumRunsBetweenEntries ?? 0}
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
                  key={competitionFormat}
                  defaultValue={
                    compatiblePayoutSchedules.some(
                      (schedule) => schedule.id === template?.payoutScheduleId,
                    )
                      ? (template?.payoutScheduleId ?? "")
                      : ""
                  }
                  className={inputClass}
                  required={competitionFormat === "four_d"}
                >
                  <option value="">No default schedule</option>
                  {compatiblePayoutSchedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Number of timers
                <NumberStepper label="Number of timers"
                  name="timerCount"
                  defaultValue={template?.timerCount ?? 1}
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
            <div>
              <p className="text-sm font-semibold">Round ordering defaults</p>
              <p className="mt-1 text-xs leading-5 text-[#66716b]">
                These defaults are copied into each event and can be changed
                there before competition starts.
              </p>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold">
                  Round 2
                  <select
                    name="secondRoundOrdering"
                    defaultValue={
                      template?.secondRoundOrdering ?? "reverse_first"
                    }
                    className={inputClass}
                  >
                    {roundOrderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-semibold">
                  Round 3 and later
                  <select
                    name="laterRoundOrdering"
                    defaultValue={
                      template?.laterRoundOrdering ??
                      "aggregate_slowest_to_fastest"
                    }
                    className={inputClass}
                  >
                    {roundOrderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Final-round format</p>
              <ShortRoundFields
                defaultEnabled={template?.shortRoundEnabled}
                defaultBrackets={template?.shortRoundBrackets}
                defaultTiePolicy={template?.shortRoundTiePolicy}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-md border border-[#e1e6e3] p-3 text-sm font-semibold">
                <input
                  name="cattleDrawEnabled"
                  type="checkbox"
                  defaultChecked={template?.cattleDrawEnabled}
                  className="h-4 w-4 accent-[var(--brand-accent)]"
                />{" "}
                Draw and track cattle
              </label>
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
                Active for new events
              </label>
            </div>
            <FormMessage state={state} />
            {!configured ? (
              <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
                Connect Supabase to save producer settings.
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
  classifications,
}: {
  configured: boolean;
  divisions: DivisionOption[];
  payoutSchedules: PayoutOption[];
  classifications: ClassificationOption[];
}) {
  return (
    <EventTemplateDialog
      configured={configured}
      divisions={divisions}
      payoutSchedules={payoutSchedules}
      classifications={classifications}
    />
  );
}
export function EditDivisionDialog({
  configured,
  divisions,
  payoutSchedules,
  classifications,
  template,
}: {
  configured: boolean;
  divisions: DivisionOption[];
  payoutSchedules: PayoutOption[];
  classifications: ClassificationOption[];
  template: DivisionTemplateSummary;
}) {
  return (
    <EventTemplateDialog
      configured={configured}
      divisions={divisions}
      payoutSchedules={payoutSchedules}
      classifications={classifications}
      template={template}
    />
  );
}

export function DuplicateDivisionButton({
  configured,
  template,
}: {
  configured: boolean;
  template: Pick<DivisionTemplateSummary, "id" | "name">;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SettingsFormState>({});

  function duplicate() {
    setResult({});
    startTransition(async () => {
      setResult(await duplicateDivision(template.id));
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!configured || pending}
        onClick={duplicate}
        title={`Duplicate ${template.name}`}
        aria-label={`Duplicate ${template.name}`}
        className="flex h-9 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-sm font-semibold hover:bg-[#f7f8f7] disabled:opacity-50"
      >
        {pending ? (
          <LoaderCircle size={16} className="animate-spin" />
        ) : result.success ? (
          <Check size={16} className="text-emerald-700" />
        ) : (
          <Copy size={16} />
        )}
        {pending ? "Duplicating" : result.success ? "Duplicated" : "Duplicate"}
      </button>
      {result.message && !result.success ? (
        <p
          role="alert"
          className="absolute right-0 top-11 z-20 w-72 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-800 shadow-lg"
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}

function FeeDialog({
  divisionId,
  divisionName,
  configured,
  payoutSchedules,
  fee,
  funds = [],
}: {
  divisionId: string;
  divisionName: string;
  configured: boolean;
  payoutSchedules: PayoutOption[];
  fee?: FeeTemplateSummary;
  funds?: { id: string; name: string }[];
}) {
  const fundsEnabled = featureEnabled(useProducerFeatures(), "funds");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(fee?.kind ?? "standard");
  const [fundTracking, setFundTracking] = useState(fee?.fundTracking ?? "general");
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
                      setIsRequired(["standard", "added_money"].includes(event.target.value));
                  }}
                  className={inputClass}
                >
                  <option value="standard">Standard fee</option>
                  <option value="insurance">Insurance</option>
                  <option value="side_pot">Side pot</option>
                  <option value="other">Other option</option>
                  {(fundsEnabled || fee?.kind === "added_money") && <option value="added_money">Added-money fund</option>}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Applied
                <select
                  name="scope"
                  key={kind}
                  defaultValue={kind === "added_money" ? "entry" : fee?.scope ?? "entry"}
                  disabled={kind === "added_money"}
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
            {kind === "added_money" ? <>
              <input type="hidden" name="scope" value="entry" />
              <label className="block text-sm font-semibold">Fund tracking
                <select name="fundTracking" value={fundTracking} onChange={(event) => setFundTracking(event.target.value as "general" | "classification")} className={inputClass}>
                  <option value="general">General added-money fund</option>
                  <option value="classification">By classification</option>
                </select>
              </label>
              {fundTracking === "general" ? <label className="block text-sm font-semibold">Destination fund
                <select name="destinationFundId" defaultValue={fee?.destinationFundId ?? ""} className={inputClass}>
                  <option value="">Use general / matching classification fund</option>
                  {funds.map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}
                </select>
              </label> : <input type="hidden" name="destinationFundId" value="" />}
            </> : null}
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
                  checked={kind === "added_money" || isRequired}
                  disabled={kind === "added_money"}
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
              {kind === "added_money" ? null : kind !== "side_pot" && kind !== "insurance" ? (
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
                    warning="This removes the fee or option from this template. Existing events keep the fee that was copied when they were created."
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
  funds?: { id: string; name: string }[];
}) {
  return <FeeDialog {...props} />;
}
export function EditFeeDialog(props: {
  divisionId: string;
  divisionName: string;
  configured: boolean;
  payoutSchedules: PayoutOption[];
  funds?: { id: string; name: string }[];
  fee: FeeTemplateSummary;
}) {
  return <FeeDialog {...props} />;
}
