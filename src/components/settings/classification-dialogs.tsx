"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CircleHelp, LoaderCircle, Pencil, Plus, X } from "lucide-react";
import {
  createClassification,
  createDiscipline,
  deleteClassification,
  deleteDiscipline,
  updateClassification,
  updateDiscipline,
  type ClassificationFormState,
} from "@/app/(app)/settings/classifications/actions";
import { DeleteRecordButton } from "@/components/settings/delete-record-button";

const initialState: ClassificationFormState = {};
const inputClass =
  "mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]";

const classificationNumberHelp =
  "Use the contestant skill number, such as 11.5, 11, or 10. Open, youth, senior, and other age-based classes use 0.";

type ClassificationUse = "standalone" | "handicap" | "both";

function ClassificationNumberLabel() {
  return (
    <span className="inline-flex items-center gap-1.5">
      Classification number
      <span
        className="group relative inline-flex text-[#758078]"
        tabIndex={0}
        aria-label={classificationNumberHelp}
      >
        <CircleHelp size={15} aria-hidden="true" />
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 hidden w-64 rounded-md bg-[#17201b] px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-lg group-hover:block group-focus:block"
        >
          {classificationNumberHelp}
        </span>
      </span>
    </span>
  );
}

function ClassificationNumberField({
  eligibilityType,
  defaultRank = 0,
  error,
}: {
  eligibilityType: "skill" | "open" | "age";
  defaultRank?: number;
  error?: string;
}) {
  const usesNumber = eligibilityType === "skill";

  return (
    <label className="block text-sm font-semibold">
      <ClassificationNumberLabel />
      {usesNumber ? (
        <input
          name="rank"
          type="number"
          min="0"
          max="100"
          step="0.1"
          defaultValue={defaultRank}
          className={inputClass}
          required
        />
      ) : (
        <>
          <input type="hidden" name="rank" value="0" />
          <input
            type="number"
            value="0"
            className={`${inputClass} cursor-not-allowed bg-[#f3f5f4] text-[#758078]`}
            disabled
            aria-label="Classification number"
          />
        </>
      )}
      {error ? (
        <span className="mt-1 block text-xs text-rose-700">{error}</span>
      ) : null}
    </label>
  );
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
        className="relative my-8 w-full max-w-xl rounded-md bg-white shadow-2xl"
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

function FormMessage({ state }: { state: ClassificationFormState }) {
  return state.message ? (
    <p
      className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
    >
      {state.message}
    </p>
  ) : null;
}

function EligibilityFields({
  type,
  setType,
  minimumAge,
  maximumAge,
  errors,
}: {
  type: "skill" | "open" | "age";
  setType: (type: "skill" | "open" | "age") => void;
  minimumAge?: number | null;
  maximumAge?: number | null;
  errors?: Record<string, string[]>;
}) {
  return (
    <div className="space-y-4 rounded-md border border-[#e1e6e3] bg-[#fafbfa] p-4">
      <label className="block text-sm font-semibold">
        Eligibility
        <select
          name="eligibilityType"
          value={type}
          onChange={(event) =>
            setType(event.target.value as "skill" | "open" | "age")
          }
          className={inputClass}
        >
          <option value="skill">Skill level</option>
          <option value="open">Open to anyone</option>
          <option value="age">Age limited</option>
        </select>
      </label>
      <p className="text-xs leading-5 text-[#66716b]">
        {type === "skill"
          ? "A contestant may enter their classification or a lower-numbered class, but not a higher-numbered class."
          : type === "open"
            ? "No skill classification is required for this class."
            : "Age is calculated on the scheduled date of this roping."}
      </p>
      {type === "age" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Minimum age
            <input
              name="minimumAge"
              type="number"
              min="0"
              max="120"
              defaultValue={minimumAge ?? ""}
              className={inputClass}
              placeholder="40"
            />
            {errors?.minimumAge ? (
              <span className="mt-1 block text-xs text-rose-700">
                {errors.minimumAge[0]}
              </span>
            ) : null}
          </label>
          <label className="block text-sm font-semibold">
            Maximum age
            <input
              name="maximumAge"
              type="number"
              min="0"
              max="120"
              defaultValue={maximumAge ?? ""}
              className={inputClass}
              placeholder="19"
            />
            {errors?.maximumAge ? (
              <span className="mt-1 block text-xs text-rose-700">
                {errors.maximumAge[0]}
              </span>
            ) : null}
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name="minimumAge" value="" />
          <input type="hidden" name="maximumAge" value="" />
        </>
      )}
    </div>
  );
}

function ClassificationUseFields({
  value,
  setValue,
  adjustmentSeconds,
  error,
}: {
  value: ClassificationUse;
  setValue: (value: ClassificationUse) => void;
  adjustmentSeconds?: number | null;
  error?: string;
}) {
  const usesHandicap = value !== "standalone";
  return (
    <div className="space-y-4 rounded-md border border-[#e1e6e3] bg-[#fafbfa] p-4">
      <label className="block text-sm font-semibold">
        Roping use
        <select
          name="ropingUse"
          value={value}
          onChange={(event) =>
            setValue(event.target.value as ClassificationUse)
          }
          className={inputClass}
        >
          <option value="standalone">Standalone</option>
          <option value="handicap">Handicap Time Offset</option>
          <option value="both">Standalone and Handicap</option>
        </select>
      </label>
      <p className="text-xs leading-5 text-[#66716b]">
        {value === "standalone"
          ? "This classification can have its own roping and is not used in Handicap ropings."
          : value === "handicap"
            ? "This is a member classification used only to calculate time in Handicap ropings."
            : "This classification can have its own roping and can also be used in Handicap ropings."}
      </p>
      {usesHandicap ? (
        <label className="block text-sm font-semibold">
          Final time adjustment
          <span className="relative mt-2 flex h-11 items-center rounded-md border border-[#ccd4d0] bg-white px-3 focus-within:border-[var(--brand-accent)]">
            <input
              name="handicapAdjustmentSeconds"
              type="number"
              min="-60"
              max="60"
              step="0.001"
              defaultValue={adjustmentSeconds ?? 0}
              className="min-w-0 flex-1 bg-transparent font-mono outline-none"
              required
            />
            <span className="text-xs text-[#758078]">seconds</span>
          </span>
          <span className="mt-1 block text-xs font-normal text-[#66716b]">
            Use a negative value to subtract time or a positive value to add
            time. For example, -1.500 gives a 1.5-second advantage. Use 0 for
            no adjustment.
          </span>
          {error ? (
            <span className="mt-1 block text-xs text-rose-700">{error}</span>
          ) : null}
        </label>
      ) : (
        <input type="hidden" name="handicapAdjustmentSeconds" value="" />
      )}
    </div>
  );
}

function GenderEligibilityFields({
  policy,
  setPolicy,
  classificationDivisions,
  youthMaximumAge,
  seniorMinimumAge,
  classificationDisciplineId,
  minimumClassificationNumber,
  errors,
}: {
  policy: "open" | "women_only";
  setPolicy: (policy: "open" | "women_only") => void;
  classificationDivisions: Array<{ id: string; name: string }>;
  youthMaximumAge?: number | null;
  seniorMinimumAge?: number | null;
  classificationDisciplineId?: string | null;
  minimumClassificationNumber?: number | null;
  errors?: Record<string, string[]>;
}) {
  return (
    <div className="space-y-4 rounded-md border border-[#e1e6e3] bg-[#fafbfa] p-4">
      <label className="block text-sm font-semibold">
        Gender eligibility
        <select
          name="genderPolicy"
          value={policy}
          onChange={(event) =>
            setPolicy(event.target.value as "open" | "women_only")
          }
          className={inputClass}
        >
          <option value="open">Open to all contestants</option>
          <option value="women_only">
            Women only, with optional exceptions
          </option>
        </select>
      </label>
      {policy === "women_only" ? (
        <>
          <p className="text-xs leading-5 text-[#66716b]">
            Female contestants are eligible. Male contestants may qualify
            through either an age range or the minimum classification below.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Boys this age and younger
              <input
                name="maleYouthMaximumAge"
                type="number"
                min="0"
                max="120"
                defaultValue={youthMaximumAge ?? ""}
                className={inputClass}
                placeholder="12"
              />
              {errors?.maleYouthMaximumAge ? (
                <span className="mt-1 block text-xs text-rose-700">
                  {errors.maleYouthMaximumAge[0]}
                </span>
              ) : null}
            </label>
            <label className="block text-sm font-semibold">
              Men this age and older
              <input
                name="maleSeniorMinimumAge"
                type="number"
                min="0"
                max="120"
                defaultValue={seniorMinimumAge ?? ""}
                className={inputClass}
                placeholder="55"
              />
              {errors?.maleSeniorMinimumAge ? (
                <span className="mt-1 block text-xs text-rose-700">
                  {errors.maleSeniorMinimumAge[0]}
                </span>
              ) : null}
            </label>
          </div>
          <div className="border-t border-[#dfe4e1] pt-4">
            <p className="text-sm font-bold">Classification exception</p>
            <p className="mt-1 text-xs leading-5 text-[#66716b]">
              Leave both fields blank when this producer does not allow a male
              contestant based on classification number.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Number classification from
                <select
                  name="maleClassificationDisciplineId"
                  defaultValue={classificationDisciplineId ?? ""}
                  className={inputClass}
                >
                  <option value="">No classification exception</option>
                  {classificationDivisions.map((division) => (
                    <option key={division.id} value={division.id}>
                      {division.name}
                    </option>
                  ))}
                </select>
                {errors?.maleClassificationDisciplineId ? (
                  <span className="mt-1 block text-xs text-rose-700">
                    {errors.maleClassificationDisciplineId[0]}
                  </span>
                ) : null}
              </label>
              <label className="block text-sm font-semibold">
                Minimum classification number
                <input
                  name="maleMinimumClassificationNumber"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  defaultValue={minimumClassificationNumber ?? ""}
                  className={inputClass}
                  placeholder="10"
                />
                {errors?.maleMinimumClassificationNumber ? (
                  <span className="mt-1 block text-xs text-rose-700">
                    {errors.maleMinimumClassificationNumber[0]}
                  </span>
                ) : null}
              </label>
            </div>
          </div>
        </>
      ) : (
        <>
          <input type="hidden" name="maleYouthMaximumAge" value="" />
          <input type="hidden" name="maleSeniorMinimumAge" value="" />
          <input type="hidden" name="maleClassificationDisciplineId" value="" />
          <input
            type="hidden"
            name="maleMinimumClassificationNumber"
            value=""
          />
        </>
      )}
    </div>
  );
}

export function CreateDisciplineDialog({
  classificationDivisions,
  enabled,
}: {
  classificationDivisions: Array<{ id: string; name: string }>;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [genderPolicy, setGenderPolicy] = useState<"open" | "women_only">(
    "open",
  );
  const [state, action, pending] = useActionState(
    createDiscipline,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
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
        className="flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-4 text-sm font-semibold"
      >
        <Plus size={17} /> Division
      </button>
      {open ? (
        <DialogFrame
          title="Create division"
          description="Create the first-level event split, such as Calf roping or Breakaway. Each division can have its own classifications."
          close={() => setOpen(false)}
        >
          <form ref={formRef} action={action} className="space-y-4 p-5">
            <label className="block text-sm font-semibold">
              Name
              <input
                name="name"
                className={inputClass}
                placeholder="Calf roping"
                required
              />
              {state.errors?.name ? (
                <span className="mt-1 block text-xs text-rose-700">
                  {state.errors.name[0]}
                </span>
              ) : null}
            </label>
            <GenderEligibilityFields
              policy={genderPolicy}
              setPolicy={setGenderPolicy}
              classificationDivisions={classificationDivisions}
              errors={state.errors}
            />
            <label className="block text-sm font-semibold">
              Description
              <textarea
                name="description"
                className="mt-2 min-h-20 w-full rounded-md border border-[#ccd4d0] p-3 outline-none focus:border-[var(--brand-accent)]"
                placeholder="Describe this division"
              />
            </label>
            <FormMessage state={state} />
            <div className="flex flex-wrap justify-end gap-2 border-t border-[#e7ebe8] pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={pending || !enabled}
                className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {pending ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : null}
                Create division
              </button>
            </div>
          </form>
        </DialogFrame>
      ) : null}
    </>
  );
}

export function CreateClassificationDialog({
  disciplineId,
  disciplineName,
  enabled,
}: {
  disciplineId: string;
  disciplineName: string;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [eligibilityType, setEligibilityType] = useState<
    "skill" | "open" | "age"
  >("skill");
  const [classificationUse, setClassificationUse] =
    useState<ClassificationUse>("standalone");
  const [state, action, pending] = useActionState(
    createClassification,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
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
        className="flex items-center gap-1.5 text-xs font-semibold text-[var(--brand-accent-strong)]"
      >
        <Plus size={14} /> Add classification
      </button>
      {open ? (
        <DialogFrame
          title={`Add ${disciplineName} classification`}
          description="Create a numbered skill class, an open class, or an age-based class."
          close={() => setOpen(false)}
        >
          <form ref={formRef} action={action} className="space-y-4 p-5">
            <input type="hidden" name="disciplineId" value={disciplineId} />
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <label className="block text-sm font-semibold">
                Classification name
                <input
                  name="name"
                  className={inputClass}
                  placeholder="Open, 11.5, 40+"
                  required
                />
                {state.errors?.name ? (
                  <span className="mt-1 block text-xs text-rose-700">
                    {state.errors.name[0]}
                  </span>
                ) : null}
              </label>
              <ClassificationNumberField
                eligibilityType={eligibilityType}
                error={state.errors?.rank?.[0]}
              />
            </div>
            <EligibilityFields
              type={eligibilityType}
              setType={setEligibilityType}
              errors={state.errors}
            />
            <ClassificationUseFields
              value={classificationUse}
              setValue={setClassificationUse}
              error={state.errors?.handicapAdjustmentSeconds?.[0]}
            />
            <label className="block text-sm font-semibold">
              Description
              <textarea
                name="description"
                className="mt-2 min-h-20 w-full rounded-md border border-[#ccd4d0] p-3 outline-none focus:border-[var(--brand-accent)]"
                placeholder="Skill or age eligibility notes"
              />
            </label>
            <FormMessage state={state} />
            <div className="flex flex-wrap justify-end gap-2 border-t border-[#e7ebe8] pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={pending || !enabled}
                className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {pending ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : null}
                Add classification
              </button>
            </div>
          </form>
        </DialogFrame>
      ) : null}
    </>
  );
}

export function EditDisciplineDialog({
  discipline,
  classificationDivisions,
  enabled,
}: {
  discipline: {
    id: string;
    name: string;
    description: string;
    isActive: boolean;
    genderPolicy: "open" | "women_only";
    maleYouthMaximumAge: number | null;
    maleSeniorMinimumAge: number | null;
    maleClassificationDisciplineId: string | null;
    maleMinimumClassificationNumber: number | null;
  };
  classificationDivisions: Array<{ id: string; name: string }>;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [genderPolicy, setGenderPolicy] = useState(discipline.genderPolicy);
  const [state, action, pending] = useActionState(
    updateDiscipline,
    initialState,
  );
  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Edit ${discipline.name}`}
        className="grid h-9 w-9 place-items-center rounded-md border border-[#d7ddda] hover:bg-[#f7f8f7]"
      >
        <Pencil size={16} />
      </button>
      {open ? (
        <DialogFrame
          title={`Edit ${discipline.name}`}
          description="Update this division or make it unavailable for future setup without removing its history."
          close={() => setOpen(false)}
        >
          <form action={action} className="space-y-4 p-5">
            <input type="hidden" name="disciplineId" value={discipline.id} />
            <label className="block text-sm font-semibold">
              Name
              <input
                name="name"
                defaultValue={discipline.name}
                className={inputClass}
                required
              />
            </label>
            <GenderEligibilityFields
              policy={genderPolicy}
              setPolicy={setGenderPolicy}
              classificationDivisions={classificationDivisions}
              youthMaximumAge={discipline.maleYouthMaximumAge}
              seniorMinimumAge={discipline.maleSeniorMinimumAge}
              classificationDisciplineId={
                discipline.maleClassificationDisciplineId
              }
              minimumClassificationNumber={
                discipline.maleMinimumClassificationNumber
              }
              errors={state.errors}
            />
            <label className="block text-sm font-semibold">
              Description
              <textarea
                name="description"
                defaultValue={discipline.description}
                className="mt-2 min-h-20 w-full rounded-md border border-[#ccd4d0] p-3 outline-none focus:border-[var(--brand-accent)]"
              />
            </label>
            <label className="flex items-center gap-3 rounded-md border border-[#e1e6e3] p-3 text-sm font-semibold">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked={discipline.isActive}
                className="h-4 w-4 accent-[var(--brand-accent)]"
              />{" "}
              Available for member classifications and scheduled ropings
            </label>
            <FormMessage state={state} />
            <div className="flex flex-wrap justify-end gap-2 border-t border-[#e7ebe8] pt-4">
              <div className="mr-auto">
                <DeleteRecordButton
                  recordType="division"
                  recordName={discipline.name}
                  warning="The division can only be deleted after its classifications and any connected templates or history have been removed."
                  disabled={!enabled}
                  onDelete={() => deleteDiscipline(discipline.id)}
                  onDeleted={() => setOpen(false)}
                />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={pending || !enabled}
                className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {pending ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : null}
                Save changes
              </button>
            </div>
          </form>
        </DialogFrame>
      ) : null}
    </>
  );
}

export function EditClassificationDialog({
  disciplineId,
  classification,
  enabled,
}: {
  disciplineId: string;
  classification: {
    id: string;
    name: string;
    description: string;
    rank: number;
    eligibilityType: "skill" | "open" | "age";
    minimumAge: number | null;
    maximumAge: number | null;
    standaloneEnabled: boolean;
    handicapAdjustmentSeconds: number | null;
    isActive: boolean;
  };
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [eligibilityType, setEligibilityType] = useState(
    classification.eligibilityType,
  );
  const [classificationUse, setClassificationUse] = useState<ClassificationUse>(
    classification.standaloneEnabled
      ? classification.handicapAdjustmentSeconds !== null
        ? "both"
        : "standalone"
      : "handicap",
  );
  const [state, action, pending] = useActionState(
    updateClassification,
    initialState,
  );
  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Edit ${classification.name}`}
        className="grid h-8 w-8 place-items-center rounded-md hover:bg-[#f1f3f2]"
      >
        <Pencil size={15} />
      </button>
      {open ? (
        <DialogFrame
          title={`Edit ${classification.name}`}
          description="Update this classification or make it unavailable for future use without removing existing records."
          close={() => setOpen(false)}
        >
          <form action={action} className="space-y-4 p-5">
            <input type="hidden" name="disciplineId" value={disciplineId} />
            <input
              type="hidden"
              name="classificationId"
              value={classification.id}
            />
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <label className="block text-sm font-semibold">
                Classification name
                <input
                  name="name"
                  defaultValue={classification.name}
                  className={inputClass}
                  required
                />
              </label>
              <ClassificationNumberField
                eligibilityType={eligibilityType}
                defaultRank={classification.rank}
                error={state.errors?.rank?.[0]}
              />
            </div>
            <EligibilityFields
              type={eligibilityType}
              setType={setEligibilityType}
              minimumAge={classification.minimumAge}
              maximumAge={classification.maximumAge}
              errors={state.errors}
            />
            <ClassificationUseFields
              value={classificationUse}
              setValue={setClassificationUse}
              adjustmentSeconds={classification.handicapAdjustmentSeconds}
              error={state.errors?.handicapAdjustmentSeconds?.[0]}
            />
            <label className="block text-sm font-semibold">
              Description
              <textarea
                name="description"
                defaultValue={classification.description}
                className="mt-2 min-h-20 w-full rounded-md border border-[#ccd4d0] p-3 outline-none focus:border-[var(--brand-accent)]"
              />
            </label>
            <label className="flex items-center gap-3 rounded-md border border-[#e1e6e3] p-3 text-sm font-semibold">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked={classification.isActive}
                className="h-4 w-4 accent-[var(--brand-accent)]"
              />{" "}
              Available for members and roping eligibility
            </label>
            <FormMessage state={state} />
            <div className="flex flex-wrap justify-end gap-2 border-t border-[#e7ebe8] pt-4">
              <div className="mr-auto">
                <DeleteRecordButton
                  recordType="classification"
                  recordName={classification.name}
                  warning="This can only be deleted when no member classifications, incentive rules, or event history still use it."
                  disabled={!enabled}
                  onDelete={() => deleteClassification(classification.id)}
                  onDeleted={() => setOpen(false)}
                />
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={pending || !enabled}
                className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {pending ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : null}
                Save changes
              </button>
            </div>
          </form>
        </DialogFrame>
      ) : null}
    </>
  );
}
