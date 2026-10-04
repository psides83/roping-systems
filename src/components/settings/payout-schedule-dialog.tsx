"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Copy, LoaderCircle, Plus, Trash2, X } from "lucide-react";
import {
  deletePayoutSchedule,
  savePayoutSchedule,
  type PayoutFormState,
} from "@/app/(app)/settings/payouts/actions";
import { DeleteRecordButton } from "@/components/settings/delete-record-button";
import { FourDSettingsFields } from "@/components/settings/four-d-settings-fields";
import type { CompetitionFormat, FourDSettings } from "@/types/domain";

interface EditableBracket {
  key: string;
  minimumEntries: number;
  maximumEntries: number | null;
  percentages: number[];
}

type PayoutStage = "go_round" | "aggregate" | "short_round";

const payoutStages: Array<{ id: PayoutStage; label: string }> = [
  { id: "go_round", label: "Go-rounds" },
  { id: "aggregate", label: "Average" },
  { id: "short_round", label: "Short round" },
];

export interface EditablePayoutSchedule {
  id: string;
  name: string;
  description: string;
  addedMoneyCents: number;
  paybackPercent: number;
  goRoundsPercent: number;
  aggregatePercent: number;
  shortRoundPercent: number;
  shortRoundEnabled: boolean;
  competitionFormat: "standard" | "four_d";
  fourDSettings: FourDSettings | null;
  bracketsByStage: Record<
    PayoutStage,
    Array<{
      minimumEntries: number;
      maximumEntries: number | null;
      percentages: number[];
    }>
  >;
}

const inputClass =
  "mt-2 h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm outline-none focus:border-[var(--brand-accent)]";
const initialState: PayoutFormState = {};
const newBracket = (index: number): EditableBracket => ({
  key: `${Date.now()}-${index}`,
  minimumEntries: index === 0 ? 1 : 11,
  maximumEntries: index === 0 ? 10 : null,
  percentages: [100],
});

export function PayoutScheduleDialog({
  schedule,
  enabled,
}: {
  schedule?: EditablePayoutSchedule;
  enabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<PayoutStage>("go_round");
  const [shortRoundEnabled, setShortRoundEnabled] = useState(
    schedule?.shortRoundEnabled ?? false,
  );
  const [competitionFormat, setCompetitionFormat] = useState<
    Extract<CompetitionFormat, "standard" | "four_d">
  >(schedule?.competitionFormat ?? "standard");
  const [bracketsByStage, setBracketsByStage] = useState<
    Record<PayoutStage, EditableBracket[]>
  >(
    () =>
      Object.fromEntries(
        payoutStages.map(({ id }) => [
          id,
          schedule?.bracketsByStage[id].map((bracket, index) => ({
            ...bracket,
            key: `${schedule.id}-${id}-${index}`,
          })) ?? (id === "short_round" ? [] : [newBracket(0)]),
        ]),
      ) as Record<PayoutStage, EditableBracket[]>,
  );
  const activePayoutStages = payoutStages.filter(
    (stage) => stage.id !== "short_round" || shortRoundEnabled,
  );
  const brackets = bracketsByStage[selectedStage];
  const setBrackets = (
    update:
      | EditableBracket[]
      | ((current: EditableBracket[]) => EditableBracket[]),
  ) =>
    setBracketsByStage((current) => ({
      ...current,
      [selectedStage]:
        typeof update === "function" ? update(current[selectedStage]) : update,
    }));
  const [state, action, pending] = useActionState(
    savePayoutSchedule,
    initialState,
  );
  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);
  const bracketsJson = useMemo(
    () =>
      JSON.stringify(
        activePayoutStages.flatMap(({ id }) =>
          bracketsByStage[id].map((bracket) => ({
            stageType: id,
            minimumEntries: Number(bracket.minimumEntries),
            maximumEntries:
              bracket.maximumEntries === null
                ? null
                : Number(bracket.maximumEntries),
            places: bracket.percentages.map((percentage, index) => ({
              place: index + 1,
              percentageBasisPoints: Math.round(Number(percentage) * 100),
            })),
          })),
        ),
      ),
    [activePayoutStages, bracketsByStage],
  );

  const updateBracket = (index: number, update: Partial<EditableBracket>) =>
    setBrackets((current) =>
      current.map((bracket, itemIndex) =>
        itemIndex === index ? { ...bracket, ...update } : bracket,
      ),
    );
  const updatePercentage = (
    bracketIndex: number,
    placeIndex: number,
    value: number,
  ) =>
    setBrackets((current) =>
      current.map((bracket, itemIndex) =>
        itemIndex === bracketIndex
          ? {
              ...bracket,
              percentages: bracket.percentages.map((percentage, index) =>
                index === placeIndex ? value : percentage,
              ),
            }
          : bracket,
      ),
    );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          schedule
            ? "h-9 rounded-md border border-[#d7ddda] px-3 text-xs font-semibold"
            : "flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white"
        }
      >
        {schedule ? (
          "Edit schedule"
        ) : (
          <>
            <Plus size={17} /> New schedule
          </>
        )}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/45 p-4">
          <button
            aria-label="Close dialog"
            className="fixed inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            className="relative mx-auto my-6 w-full max-w-3xl rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 className="text-lg font-bold">
                  {schedule
                    ? `Edit ${schedule.name}`
                    : "Create payout schedule"}
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  Set paid places and the percentage split for each entry-count
                  range.
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#f0f2f1]"
              >
                <X size={18} />
              </button>
            </header>
            <form action={action} className="space-y-5 p-5">
              <input
                type="hidden"
                name="scheduleId"
                value={schedule?.id ?? ""}
              />
              <input type="hidden" name="bracketsJson" value={bracketsJson} />
              <input
                type="hidden"
                name="competitionFormat"
                value={competitionFormat}
              />
              <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
                <label className="block text-sm font-semibold">
                  Schedule name
                  <input
                    name="name"
                    defaultValue={schedule?.name}
                    className={inputClass}
                    placeholder="Standard 1 per 10"
                    required
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Default added money
                  <div className="relative">
                    <span className="absolute left-3 top-[19px] text-sm text-[#758078]">
                      $
                    </span>
                    <input
                      name="addedMoney"
                      inputMode="decimal"
                      defaultValue={(
                        (schedule?.addedMoneyCents ?? 0) / 100
                      ).toFixed(2)}
                      className={`${inputClass} pl-7`}
                      required
                    />
                  </div>
                </label>
              </div>
              <label className="block text-sm font-semibold">
                Description
                <input
                  name="description"
                  defaultValue={schedule?.description}
                  className={inputClass}
                  placeholder="Pays one place for every ten entries"
                />
              </label>
              <section className="rounded-md border border-[#dfe4e1] p-4">
                <label className="block text-sm font-semibold">
                  Payout format
                  <select
                    value={competitionFormat}
                    onChange={(event) =>
                      setCompetitionFormat(
                        event.target.value as "standard" | "four_d",
                      )
                    }
                    className={inputClass}
                  >
                    <option value="standard">Standard places</option>
                    <option value="four_d">4D breakaway</option>
                  </select>
                </label>
                {competitionFormat === "four_d" ? (
                  <FourDSettingsFields
                    initialSettings={schedule?.fourDSettings}
                    allowIncomplete
                  />
                ) : (
                  <input type="hidden" name="fourDSettings" value="" />
                )}
              </section>
              <section className="rounded-md border border-[#dfe4e1] p-4">
                <h3 className="text-sm font-bold">Purse allocation</h3>
                <p className="mt-1 text-xs text-[#758078]">
                  Payback is applied to collected payout fees. The go-round
                  share is divided evenly across the configured main rounds.
                </p>
                <div
                  className={`mt-3 grid gap-3 sm:grid-cols-2 ${shortRoundEnabled ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
                >
                  <label className="text-xs font-bold">
                    Payback
                    <span className="mt-2 flex h-10 items-center rounded-md border border-[#ccd4d0] bg-white px-3">
                      <input
                        name="paybackPercent"
                        type="number"
                        min="0.01"
                        max="100"
                        step="0.01"
                        defaultValue={schedule?.paybackPercent ?? 100}
                        className="min-w-0 flex-1 bg-transparent outline-none"
                        required
                      />
                      <span>%</span>
                    </span>
                  </label>
                  <label className="text-xs font-bold">
                    All go-rounds
                    <span className="mt-2 flex h-10 items-center rounded-md border border-[#ccd4d0] bg-white px-3">
                      <input
                        name="goRoundsPercent"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        defaultValue={schedule?.goRoundsPercent ?? 50}
                        className="min-w-0 flex-1 bg-transparent outline-none"
                        required
                      />
                      <span>%</span>
                    </span>
                  </label>
                  <label className="text-xs font-bold">
                    Aggregate
                    <span className="mt-2 flex h-10 items-center rounded-md border border-[#ccd4d0] bg-white px-3">
                      <input
                        name="aggregatePercent"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        defaultValue={schedule?.aggregatePercent ?? 50}
                        className="min-w-0 flex-1 bg-transparent outline-none"
                        required
                      />
                      <span>%</span>
                    </span>
                  </label>
                  {shortRoundEnabled ? (
                    <label className="text-xs font-bold">
                      Short round
                      <span className="mt-2 flex h-10 items-center rounded-md border border-[#ccd4d0] bg-white px-3">
                        <input
                          name="shortRoundPercent"
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          defaultValue={schedule?.shortRoundPercent ?? 0}
                          className="min-w-0 flex-1 bg-transparent outline-none"
                          required
                        />
                        <span>%</span>
                      </span>
                    </label>
                  ) : (
                    <input type="hidden" name="shortRoundPercent" value="0" />
                  )}
                </div>
                <label className="mt-4 flex items-start gap-3 border-t border-[#e7ebe8] pt-4 text-sm font-semibold">
                  <input
                    name="shortRoundEnabled"
                    type="checkbox"
                    checked={shortRoundEnabled}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setShortRoundEnabled(enabled);
                      if (enabled && !bracketsByStage.short_round.length)
                        setBracketsByStage((current) => ({
                          ...current,
                          short_round: [newBracket(0)],
                        }));
                      if (!enabled && selectedStage === "short_round")
                        setSelectedStage("go_round");
                    }}
                    className="mt-0.5 h-4 w-4 accent-[var(--brand-accent)]"
                  />
                  <span>
                    Include a short-round payout
                    <span className="mt-1 block text-xs font-normal leading-5 text-[#758078]">
                      Adds a separate purse allocation and paid-place schedule
                      for the short round.
                    </span>
                  </span>
                </label>
              </section>
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-bold">Paid-place rules</h3>
                  <p className="mt-1 text-xs text-[#758078]">
                    Each stage can pay a different number of places.
                  </p>
                </div>
                <div
                  className={`grid rounded-md bg-[#eef1ef] p-1 ${shortRoundEnabled ? "grid-cols-3" : "grid-cols-2"}`}
                >
                  {activePayoutStages.map((stage) => (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => setSelectedStage(stage.id)}
                      className={`min-h-9 rounded px-2 text-xs font-bold ${
                        selectedStage === stage.id
                          ? "bg-white text-[#17201c] shadow-sm"
                          : "text-[#66716b]"
                      }`}
                    >
                      {stage.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-[#758078]">
                  Percentages within each bracket in this stage must total 100%.
                </p>
                {selectedStage === "aggregate" ? (
                  <button type="button" onClick={() => {
                    if (bracketsByStage.aggregate.length && !window.confirm("Replace the Average paid-place rules with the go-round rules?")) return;
                    setBracketsByStage((current) => ({ ...current, aggregate: current.go_round.map((bracket, index) => ({ ...bracket, percentages: [...bracket.percentages], key: `average-${Date.now()}-${index}` })) }));
                  }} className="flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-xs font-semibold">
                    <Copy size={15} /> Copy go-rounds
                  </button>
                ) : null}
                {brackets.map((bracket, bracketIndex) => {
                  const total = bracket.percentages.reduce(
                    (sum, value) => sum + Number(value || 0),
                    0,
                  );
                  return (
                    <article
                      key={bracket.key}
                      className="rounded-md border border-[#dfe4e1] p-4"
                    >
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="w-28 text-xs font-bold">
                          Minimum entries
                          <input
                            type="number"
                            min="1"
                            value={bracket.minimumEntries}
                            onChange={(event) =>
                              updateBracket(bracketIndex, {
                                minimumEntries: Number(event.target.value),
                              })
                            }
                            className={inputClass}
                          />
                        </label>
                        <label className="w-28 text-xs font-bold">
                          Maximum
                          <input
                            type="number"
                            min="1"
                            value={bracket.maximumEntries ?? ""}
                            onChange={(event) =>
                              updateBracket(bracketIndex, {
                                maximumEntries: event.target.value
                                  ? Number(event.target.value)
                                  : null,
                              })
                            }
                            className={inputClass}
                            placeholder="No limit"
                          />
                        </label>
                        <span
                          className={`mb-2 ml-auto text-xs font-bold ${total === 100 ? "text-emerald-700" : "text-rose-700"}`}
                        >
                          {total.toFixed(2)}% allocated
                        </span>
                        {brackets.length > 1 ? (
                          <button
                            type="button"
                            aria-label="Remove bracket"
                            onClick={() =>
                              setBrackets((current) =>
                                current.filter(
                                  (_, index) => index !== bracketIndex,
                                ),
                              )
                            }
                            className="mb-1 grid h-9 w-9 place-items-center rounded-md border border-[#d7ddda] text-rose-700"
                          >
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {bracket.percentages.map((percentage, placeIndex) => (
                          <label
                            key={placeIndex}
                            className="flex items-center gap-2 rounded-md bg-[#f7f8f7] p-2 text-xs font-bold"
                          >
                            <span className="w-16">Place {placeIndex + 1}</span>
                            <input
                              aria-label={`Place ${placeIndex + 1} percentage`}
                              type="number"
                              min="0"
                              max="100"
                              step="0.01"
                              value={percentage}
                              onChange={(event) =>
                                updatePercentage(
                                  bracketIndex,
                                  placeIndex,
                                  Number(event.target.value),
                                )
                              }
                              className="h-9 min-w-0 flex-1 rounded border border-[#ccd4d0] bg-white px-2"
                            />
                            <span>%</span>
                            {bracket.percentages.length > 1 ? (
                              <button
                                type="button"
                                aria-label={`Remove place ${placeIndex + 1}`}
                                onClick={() =>
                                  updateBracket(bracketIndex, {
                                    percentages: bracket.percentages.filter(
                                      (_, index) => index !== placeIndex,
                                    ),
                                  })
                                }
                                className="text-rose-700"
                              >
                                <X size={14} />
                              </button>
                            ) : null}
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateBracket(bracketIndex, {
                            percentages: [...bracket.percentages, 0],
                          })
                        }
                        className="mt-3 flex items-center gap-1 text-xs font-semibold text-[var(--brand-accent-strong)]"
                      >
                        <Plus size={14} /> Add paid place
                      </button>
                    </article>
                  );
                })}
                <button
                  type="button"
                  onClick={() =>
                    setBrackets((current) => [
                      ...current,
                      newBracket(current.length),
                    ])
                  }
                  className="flex h-10 items-center gap-2 rounded-md border border-dashed border-[#aeb8b2] px-4 text-sm font-semibold"
                >
                  <Plus size={16} /> Add entry bracket
                </button>
              </div>
              {state.message ? (
                <p
                  className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
                >
                  {state.message}
                </p>
              ) : null}
              <div className="flex flex-wrap justify-end gap-2 border-t border-[#e7ebe8] pt-4">
                {schedule ? (
                  <div className="mr-auto">
                    <DeleteRecordButton
                      recordType="schedule"
                      recordName={schedule.name}
                      warning="This removes the reusable payout schedule and its brackets. Templates using it will be left with no default schedule, while existing event payout plans remain unchanged."
                      disabled={!enabled}
                      onDelete={() => deletePayoutSchedule(schedule.id)}
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
                  disabled={pending || !enabled}
                  className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
                >
                  {pending ? (
                    <LoaderCircle size={16} className="animate-spin" />
                  ) : null}
                  Save schedule
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
