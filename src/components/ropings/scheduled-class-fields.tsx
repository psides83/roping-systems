"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Beef,
  ChevronDown,
  Clock3,
  Gauge,
  Plus,
  Trash2,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CompetitionFormat } from "@/types/domain";

export interface IncentiveClassification {
  id: string;
  disciplineId: string;
  divisionName: string;
  name: string;
  rank: number;
}

export type MaleEligibilityPolicy =
  | "producer_default"
  | "none"
  | "age"
  | "classification"
  | "age_and_classification"
  | "age_or_classification";

export interface EventTemplate {
  id: string;
  name: string;
  disciplineId: string | null;
  divisionName: string;
  competitionFormat: CompetitionFormat;
  handicapRules: Record<string, number>;
  fees: Array<{
    id: string;
    title: string;
    amountCents: number;
    isRequired: boolean;
  }>;
}

export type ScheduleType = "fixed" | "tentative" | "follows_previous";

export interface ScheduledOccurrenceDraft {
  templateId: string;
  classificationId: string;
  scheduledDate: string;
  scheduleType: ScheduleType;
  startTime: string;
  scheduleNote: string;
  arenaName: string;
  roundCount: number;
  incentiveEnabled: boolean;
  incentiveRules: Record<string, string>;
  cattleDrawEnabled: boolean;
  maleEligibilityPolicy: MaleEligibilityPolicy;
  maleYouthMaximumAge: string;
  maleSeniorMinimumAge: string;
  maleClassificationDisciplineId: string;
  maleMinimumClassificationNumber: string;
}

interface ScheduledOccurrence extends ScheduledOccurrenceDraft {
  key: string;
}

function newKey() {
  return crypto.randomUUID();
}

function shiftDate(value: string, dayDifference: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayDifference);
  return date.toISOString().slice(0, 10);
}

export function ScheduledClassFields({
  templates,
  classifications,
  eventStartDate,
  initialOccurrences = [],
  error,
}: {
  templates: EventTemplate[];
  classifications: IncentiveClassification[];
  eventStartDate: string;
  initialOccurrences?: ScheduledOccurrenceDraft[];
  error?: string;
}) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    templates[0]?.id ?? "",
  );
  const [allRounds, setAllRounds] = useState(
    initialOccurrences[0]?.roundCount ?? 1,
  );
  const [occurrences, setOccurrences] = useState<ScheduledOccurrence[]>(() =>
    initialOccurrences.map((occurrence, index) => ({
      ...occurrence,
      key: `copied-${index}`,
    })),
  );
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(
    () => new Set(initialOccurrences.map((_, index) => `copied-${index}`)),
  );
  const previousEventStartDate = useRef(eventStartDate);
  useEffect(() => {
    const previous = previousEventStartDate.current;
    previousEventStartDate.current = eventStartDate;
    if (!previous || !eventStartDate || previous === eventStartDate) return;
    const dayDifference = Math.round(
      (Date.parse(`${eventStartDate}T12:00:00Z`) -
        Date.parse(`${previous}T12:00:00Z`)) /
        86_400_000,
    );
    setOccurrences((current) =>
      current.map((occurrence) => ({
        ...occurrence,
        scheduledDate: shiftDate(occurrence.scheduledDate, dayDifference),
      })),
    );
  }, [eventStartDate]);
  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId,
  );
  const selectedTemplateHasClassifications = classifications.some(
    (classification) =>
      classification.disciplineId === selectedTemplate?.disciplineId,
  );

  const serialized = useMemo(
    () =>
      JSON.stringify(
        occurrences.map((occurrence) => ({
          templateId: occurrence.templateId,
          classificationId: occurrence.classificationId,
          scheduledDate: occurrence.scheduledDate,
          scheduleType: occurrence.scheduleType,
          startsAt:
            occurrence.scheduleType === "follows_previous" ||
            !occurrence.scheduledDate ||
            !occurrence.startTime
              ? ""
              : `${occurrence.scheduledDate}T${occurrence.startTime}`,
          scheduleNote: occurrence.scheduleNote,
          arenaName: occurrence.arenaName,
          roundCount: occurrence.roundCount,
          incentiveEnabled:
            templates.find((template) => template.id === occurrence.templateId)
              ?.competitionFormat === "handicap"
              ? true
              : occurrence.incentiveEnabled,
          cattleDrawEnabled: occurrence.cattleDrawEnabled,
          maleEligibilityPolicy: occurrence.maleEligibilityPolicy,
          maleYouthMaximumAge: occurrence.maleYouthMaximumAge
            ? Number(occurrence.maleYouthMaximumAge)
            : null,
          maleSeniorMinimumAge: occurrence.maleSeniorMinimumAge
            ? Number(occurrence.maleSeniorMinimumAge)
            : null,
          maleClassificationDisciplineId:
            occurrence.maleClassificationDisciplineId || null,
          maleMinimumClassificationNumber:
            occurrence.maleMinimumClassificationNumber
              ? Number(occurrence.maleMinimumClassificationNumber)
              : null,
          incentiveRules: Object.entries(occurrence.incentiveRules).map(
            ([classificationId, seconds]) => ({
              classificationId,
              adjustmentSeconds: Number(seconds),
            }),
          ),
        })),
      ),
    [occurrences, templates],
  );

  function addOccurrence() {
    if (!selectedTemplateId) return;
    const template = templates.find((item) => item.id === selectedTemplateId);
    const defaultClassification = classifications.find(
      (classification) =>
        classification.disciplineId === template?.disciplineId,
    );
    if (!template || !defaultClassification) return;
    const occurrenceKey = newKey();
    const templateClassifications = classifications.filter(
      (classification) => classification.disciplineId === template.disciplineId,
    );
    setOccurrences((current) => [
      ...current,
      {
        key: occurrenceKey,
        templateId: selectedTemplateId,
        classificationId:
          template.competitionFormat === "handicap"
            ? ""
            : defaultClassification.id,
        scheduledDate: eventStartDate,
        scheduleType: "fixed",
        startTime: "",
        scheduleNote: "",
        arenaName: "",
        roundCount: allRounds,
        incentiveEnabled: template?.competitionFormat === "handicap",
        incentiveRules:
          template.competitionFormat === "handicap"
            ? Object.fromEntries(
                templateClassifications.map((classification) => [
                  classification.id,
                  String(template.handicapRules[classification.id] ?? 0),
                ]),
              )
            : {},
        cattleDrawEnabled: false,
        maleEligibilityPolicy: "producer_default",
        maleYouthMaximumAge: "",
        maleSeniorMinimumAge: "",
        maleClassificationDisciplineId: "",
        maleMinimumClassificationNumber: "",
      },
    ]);
    setCollapsedKeys((current) => new Set(current).add(occurrenceKey));
  }

  function updateOccurrence(key: string, update: Partial<ScheduledOccurrence>) {
    setOccurrences((current) =>
      current.map((occurrence) =>
        occurrence.key === key ? { ...occurrence, ...update } : occurrence,
      ),
    );
  }

  function moveOccurrence(index: number, offset: -1 | 1) {
    setOccurrences((current) => {
      const target = index + offset;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleOccurrence(key: string) {
    setCollapsedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <fieldset>
      <input type="hidden" name="classOccurrences" value={serialized} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <legend className="text-sm font-bold">Roping schedule</legend>
          <p className="mt-1 text-xs text-[#758078]">
            Add every actual roping in running order. A template may be used
            more than once.
          </p>
        </div>
        {occurrences.length ? (
          <div className="flex items-end gap-2">
            <label className="text-xs font-semibold text-[#66716b]">
              Main rounds for all
              <input
                value={allRounds}
                onChange={(event) => setAllRounds(Number(event.target.value))}
                type="number"
                min="1"
                max="20"
                className="mt-1 block h-9 w-20 rounded-md border border-[#ccd4d0] px-2 text-center font-mono text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() =>
                setOccurrences((current) =>
                  current.map((occurrence) => ({
                    ...occurrence,
                    roundCount: allRounds,
                  })),
                )
              }
              className="h-9 rounded-md border border-[#ccd4d0] px-3 text-xs font-semibold"
            >
              Apply to all
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-md border border-[#dfe4e1] bg-[#f7f8f7] p-3 sm:flex-row">
        <select
          value={selectedTemplateId}
          onChange={(event) => setSelectedTemplateId(event.target.value)}
          aria-label="Roping template"
          className="h-10 min-w-0 flex-1 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"
        >
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addOccurrence}
          disabled={!selectedTemplateId || !selectedTemplateHasClassifications}
          className="flex h-10 items-center justify-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-50"
        >
          <Plus size={16} /> Add to schedule
        </button>
      </div>
      {selectedTemplateId && !selectedTemplateHasClassifications ? (
        <p className="mt-2 text-xs font-semibold text-amber-800">
          Add an active classification to this division before scheduling it.
        </p>
      ) : null}

      <div className="mt-3 space-y-3">
        {occurrences.map((occurrence, index) => {
          const template = templates.find(
            (item) => item.id === occurrence.templateId,
          );
          if (!template) return null;
          const eligible = classifications.filter(
            (classification) =>
              classification.disciplineId === template.disciplineId,
          );
          const selectedClassification =
            template.competitionFormat === "handicap"
              ? null
              : eligible.find(
                  (classification) =>
                    classification.id === occurrence.classificationId,
                );
          const canFollow = occurrences
            .slice(0, index)
            .some(
              (previous) => previous.scheduledDate === occurrence.scheduledDate,
            );
          const collapsed = collapsedKeys.has(occurrence.key);
          const scheduleSummary = [
            occurrence.scheduledDate || "Date not set",
            occurrence.scheduleType === "follows_previous"
              ? "Follows previous"
              : occurrence.startTime || "Time not set",
            occurrence.arenaName || null,
            `${occurrence.roundCount} ${occurrence.roundCount === 1 ? "round" : "rounds"}`,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <section
              key={occurrence.key}
              className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white"
            >
              <header className="flex items-start gap-3 border-b border-[#e7ebe8] p-4">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#eef1ef] text-xs font-bold">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="truncate text-sm font-bold">
                    {template.competitionFormat === "handicap"
                      ? "Handicap"
                      : (selectedClassification?.name ??
                        "Choose classification")}
                  </h4>
                  <p className="mt-0.5 text-xs text-[#758078]">
                    {template.divisionName} · {template.name} ·{" "}
                    {template.competitionFormat === "four_d"
                      ? "4D"
                      : template.competitionFormat === "handicap"
                        ? "Handicap"
                        : "Standard"}
                  </p>
                  <p className="mt-1 truncate text-xs font-semibold text-[#66716b]">
                    {scheduleSummary}
                  </p>
                </div>
                <div className="flex gap-1">
                  <IconButton
                    label={collapsed ? "Expand roping" : "Collapse roping"}
                    expanded={!collapsed}
                    controls={`scheduled-roping-${occurrence.key}`}
                    onClick={() => toggleOccurrence(occurrence.key)}
                  >
                    <ChevronDown
                      size={15}
                      className={`transition-transform ${collapsed ? "" : "rotate-180"}`}
                    />
                  </IconButton>
                  <IconButton
                    label="Move earlier"
                    disabled={index === 0}
                    onClick={() => moveOccurrence(index, -1)}
                  >
                    <ArrowUp size={15} />
                  </IconButton>
                  <IconButton
                    label="Move later"
                    disabled={index === occurrences.length - 1}
                    onClick={() => moveOccurrence(index, 1)}
                  >
                    <ArrowDown size={15} />
                  </IconButton>
                  <IconButton
                    label="Remove roping"
                    onClick={() =>
                      setOccurrences((current) =>
                        current.filter((item) => item.key !== occurrence.key),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </header>

              <div
                id={`scheduled-roping-${occurrence.key}`}
                className={collapsed ? "hidden" : "space-y-4 p-4"}
              >
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {template.competitionFormat === "handicap" ? (
                    <Field label="Roping offering">
                      <div className="flex h-10 items-center rounded-md border border-[#dfe4e1] bg-[#f7f8f7] px-3 text-sm font-bold">
                        Handicap
                      </div>
                    </Field>
                  ) : (
                    <Field label="Classification">
                      <select
                        value={occurrence.classificationId}
                        onChange={(event) =>
                          updateOccurrence(occurrence.key, {
                            classificationId: event.target.value,
                          })
                        }
                        className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-2 text-sm"
                        required
                      >
                        <option value="">Choose classification</option>
                        {eligible.map((classification) => (
                          <option
                            key={classification.id}
                            value={classification.id}
                          >
                            {classification.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label="Date">
                    <input
                      type="date"
                      value={occurrence.scheduledDate}
                      onChange={(event) =>
                        updateOccurrence(occurrence.key, {
                          scheduledDate: event.target.value,
                          scheduleType:
                            occurrence.scheduleType === "follows_previous"
                              ? "fixed"
                              : occurrence.scheduleType,
                        })
                      }
                      className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-2 text-sm"
                    />
                  </Field>
                  <Field label="Start listing">
                    <select
                      value={occurrence.scheduleType}
                      onChange={(event) =>
                        updateOccurrence(occurrence.key, {
                          scheduleType: event.target.value as ScheduleType,
                        })
                      }
                      className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-2 text-sm"
                    >
                      <option value="fixed">Set time</option>
                      <option value="tentative">Tentative time</option>
                      <option value="follows_previous" disabled={!canFollow}>
                        Follows previous
                      </option>
                    </select>
                  </Field>
                  {occurrence.scheduleType !== "follows_previous" ? (
                    <Field
                      label={
                        occurrence.scheduleType === "tentative"
                          ? "Tentative time"
                          : "Start time"
                      }
                    >
                      <input
                        type="time"
                        value={occurrence.startTime}
                        onChange={(event) =>
                          updateOccurrence(occurrence.key, {
                            startTime: event.target.value,
                          })
                        }
                        className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-2 text-sm"
                      />
                    </Field>
                  ) : (
                    <div className="flex items-end pb-2 text-xs font-semibold text-[#66716b]">
                      <Clock3 size={14} className="mr-1.5" /> After roping{" "}
                      {index}
                    </div>
                  )}
                  <Field label="Main rounds">
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={occurrence.roundCount}
                      onChange={(event) =>
                        updateOccurrence(occurrence.key, {
                          roundCount: Number(event.target.value),
                        })
                      }
                      className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-2 text-center font-mono text-sm"
                    />
                  </Field>
                </div>

                <Field label="Schedule note (optional)">
                  <input
                    value={occurrence.scheduleNote}
                    onChange={(event) =>
                      updateOccurrence(occurrence.key, {
                        scheduleNote: event.target.value,
                      })
                    }
                    maxLength={120}
                    className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"
                    placeholder="Arena drag before this roping"
                  />
                </Field>

                <Field label="Arena (optional)">
                  <input
                    value={occurrence.arenaName}
                    onChange={(event) =>
                      updateOccurrence(occurrence.key, {
                        arenaName: event.target.value,
                      })
                    }
                    maxLength={80}
                    className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"
                    placeholder="Arena 1"
                  />
                </Field>

                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-[#e1e6e3] bg-[#fafbfa] p-3">
                  <input
                    type="checkbox"
                    checked={occurrence.cattleDrawEnabled}
                    onChange={(event) =>
                      updateOccurrence(occurrence.key, {
                        cattleDrawEnabled: event.target.checked,
                      })
                    }
                    className="mt-0.5 h-4 w-4 accent-[var(--brand-accent)]"
                  />
                  <Beef
                    size={17}
                    className="text-[var(--brand-accent-strong)]"
                  />
                  <span>
                    <span className="block text-sm font-bold">
                      Draw and track cattle
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-[#758078]">
                      Assign numbered cattle to contestants. Leave off when
                      cattle simply run through the chute in order.
                    </span>
                  </span>
                </label>

                <div>
                  <p className="text-xs font-semibold text-[#66716b]">
                    Entry fees and options
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {template.fees.map((fee) => (
                      <span
                        key={fee.id}
                        className="rounded-md border border-[#dfe4e1] bg-[#fafbfa] px-2 py-1 text-xs"
                      >
                        {fee.title} {formatCurrency(fee.amountCents)} ·{" "}
                        {fee.isRequired ? "required" : "optional"}
                      </span>
                    ))}
                    {!template.fees.length ? (
                      <span className="text-xs text-[#8a938e]">
                        No fees configured
                      </span>
                    ) : null}
                  </div>
                </div>

                {template.competitionFormat === "handicap" ? (
                  <div className="space-y-4 rounded-md border border-[#dce2de] bg-[#f7f9f8] p-3">
                    <div>
                      <p className="text-sm font-bold">
                        Handicap classifications
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#66716b]">
                        Every contestant ropes together. Their current member
                        classification determines the deduction below.
                      </p>
                    </div>
                    <div className="border-t border-[#dce2de] pt-4">
                      <p className="text-sm font-bold">Male entry exceptions</p>
                      <p className="mt-1 text-xs leading-5 text-[#66716b]">
                        These rules apply only to male contestants in this
                        roping. Breakaway A/B/C still controls the time
                        handicap.
                      </p>
                      <select
                        value={occurrence.maleEligibilityPolicy}
                        onChange={(event) =>
                          updateOccurrence(occurrence.key, {
                            maleEligibilityPolicy: event.target
                              .value as MaleEligibilityPolicy,
                          })
                        }
                        className="mt-3 h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"
                      >
                        <option value="producer_default">
                          Use producer default
                        </option>
                        <option value="none">Women only</option>
                        <option value="age">Allow by age</option>
                        <option value="classification">
                          Allow by classification number
                        </option>
                        <option value="age_and_classification">
                          Require age and classification
                        </option>
                        <option value="age_or_classification">
                          Allow age or classification
                        </option>
                      </select>
                      {occurrence.maleEligibilityPolicy.includes("age") ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Field label="Boys this age and under">
                            <input
                              type="number"
                              min="0"
                              max="120"
                              value={occurrence.maleYouthMaximumAge}
                              onChange={(event) =>
                                updateOccurrence(occurrence.key, {
                                  maleYouthMaximumAge: event.target.value,
                                })
                              }
                              className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"
                              placeholder="13"
                            />
                          </Field>
                          <Field label="Men this age and over">
                            <input
                              type="number"
                              min="0"
                              max="120"
                              value={occurrence.maleSeniorMinimumAge}
                              onChange={(event) =>
                                updateOccurrence(occurrence.key, {
                                  maleSeniorMinimumAge: event.target.value,
                                })
                              }
                              className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"
                              placeholder="60"
                            />
                          </Field>
                        </div>
                      ) : null}
                      {occurrence.maleEligibilityPolicy.includes(
                        "classification",
                      ) ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Field label="Number classification from">
                            <select
                              value={occurrence.maleClassificationDisciplineId}
                              onChange={(event) =>
                                updateOccurrence(occurrence.key, {
                                  maleClassificationDisciplineId:
                                    event.target.value,
                                })
                              }
                              className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"
                            >
                              <option value="">Choose division</option>
                              {Array.from(
                                new Map(
                                  classifications.map((item) => [
                                    item.disciplineId,
                                    item.divisionName,
                                  ]),
                                ).entries(),
                              ).map(([id, name]) => (
                                <option key={id} value={id}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Minimum classification number">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={occurrence.maleMinimumClassificationNumber}
                              onChange={(event) =>
                                updateOccurrence(occurrence.key, {
                                  maleMinimumClassificationNumber:
                                    event.target.value,
                                })
                              }
                              className="h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"
                              placeholder="12"
                            />
                          </Field>
                          <p className="text-xs leading-5 text-[#66716b] sm:col-span-2">
                            Example: 12 allows members classified #12 or higher,
                            such as #13 and #15.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : template.competitionFormat !== "four_d" ? (
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={occurrence.incentiveEnabled}
                      onChange={(event) =>
                        updateOccurrence(occurrence.key, {
                          incentiveEnabled: event.target.checked,
                        })
                      }
                      className="mt-0.5 h-4 w-4 accent-[var(--brand-accent)]"
                    />
                    <Gauge
                      size={17}
                      className="text-[var(--brand-accent-strong)]"
                    />
                    <span>
                      <span className="block text-sm font-bold">
                        Incentive or handicap roping
                      </span>
                      <span className="mt-1 block text-xs text-[#758078]">
                        Deduct time from the final time according to the
                        contestant&apos;s member classification.
                      </span>
                    </span>
                  </label>
                ) : (
                  <p className="rounded-md border border-[#dce2de] bg-[#f7f9f8] p-3 text-xs leading-5 text-[#66716b]">
                    4D placement will be calculated from each entry&apos;s final
                    time using the template&apos;s payout schedule.
                  </p>
                )}

                {occurrence.incentiveEnabled ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {eligible.map((classification) => (
                      <label
                        key={classification.id}
                        className="flex items-center gap-3 rounded-md border border-[#e1e6e3] bg-[#fafbfa] px-3 py-2"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {classification.name}
                        </span>
                        <span className="flex w-28 items-center rounded-md border border-[#ccd4d0] bg-white px-2">
                          <input
                            type="number"
                            min="0"
                            max="60"
                            step="0.001"
                            value={
                              occurrence.incentiveRules[classification.id] ?? ""
                            }
                            onChange={(event) =>
                              updateOccurrence(occurrence.key, {
                                incentiveRules: {
                                  ...occurrence.incentiveRules,
                                  [classification.id]: event.target.value,
                                },
                              })
                            }
                            className="h-9 min-w-0 flex-1 bg-transparent text-right font-mono text-sm outline-none"
                            placeholder="0.000"
                            aria-label={`${classification.name} seconds deducted`}
                          />
                          <span className="ml-1 text-xs text-[#758078]">
                            sec
                          </span>
                        </span>
                      </label>
                    ))}
                    {!eligible.length ? (
                      <p className="text-sm text-amber-800">
                        Add classifications for this division before using
                        incentive handicaps.
                      </p>
                    ) : null}
                    <p className="sm:col-span-2 text-xs leading-5 text-[#66716b]">
                      Enter the number of seconds deducted from the
                      contestant&apos;s final time. Use 0 when a classification,
                      such as Open, receives no deduction.
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {!occurrences.length ? (
        <p className="mt-3 rounded-md border border-dashed border-[#cbd2ce] p-5 text-center text-sm text-[#66716b]">
          Add the first roping to begin building the schedule.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-700">{error}</p> : null}
    </fieldset>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs font-semibold text-[#66716b]">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function IconButton({
  label,
  disabled,
  expanded,
  controls,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  expanded?: boolean;
  controls?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-md border border-[#d7ddda] text-[#66716b] disabled:opacity-30"
    >
      {children}
    </button>
  );
}
