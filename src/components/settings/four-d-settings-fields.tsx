"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { FourDEntryBracket, FourDSettings } from "@/types/domain";

const inputClass =
  "h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm outline-none focus:border-[var(--brand-accent)]";

const defaultBracket: FourDEntryBracket = {
  minimumEntries: 1,
  maximumEntries: null,
  activeDivisions: 4,
  purseBasisPoints: [3300, 2800, 2200, 1700],
  placesByDivision: [1, 1, 1, 1],
};

const defaultSettings: FourDSettings = {
  splitSeconds: 0.5,
  brackets: [defaultBracket],
};

function replaceAt<T>(values: readonly T[], index: number, value: T) {
  return values.map((item, itemIndex) =>
    itemIndex === index ? value : item,
  ) as [T, T, T, T];
}

export function FourDSettingsFields({
  initialSettings,
}: {
  initialSettings?: FourDSettings | null;
}) {
  const [settings, setSettings] = useState<FourDSettings>(
    initialSettings ?? defaultSettings,
  );
  const totals = useMemo(
    () =>
      settings.brackets.map((bracket) =>
        bracket.purseBasisPoints
          .slice(0, bracket.activeDivisions)
          .reduce((total, value) => total + value, 0),
      ),
    [settings.brackets],
  );

  function updateBracket(
    bracketIndex: number,
    update: (bracket: FourDEntryBracket) => FourDEntryBracket,
  ) {
    setSettings((current) => ({
      ...current,
      brackets: current.brackets.map((bracket, index) =>
        index === bracketIndex ? update(bracket) : bracket,
      ),
    }));
  }

  return (
    <section className="space-y-4 border-t border-[#e1e6e3] pt-4">
      <input
        type="hidden"
        name="fourDSettings"
        value={JSON.stringify(settings)}
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold">4D scoring</h3>
          <p className="mt-1 text-xs leading-5 text-[#66716b]">
            Final times are grouped into time windows measured from the fastest
            qualified time.
          </p>
        </div>
        <label className="w-36 text-xs font-semibold">
          D split (seconds)
          <input
            className={`${inputClass} mt-1`}
            type="number"
            min="0.001"
            max="60"
            step="0.001"
            value={settings.splitSeconds}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                splitSeconds: Number(event.target.value),
              }))
            }
            required
          />
        </label>
      </div>

      {settings.brackets.map((bracket, bracketIndex) => (
        <div
          key={bracketIndex}
          className="space-y-3 rounded-md border border-[#dce2de] bg-[#f8faf9] p-3"
        >
          <div className="flex items-end gap-3">
            <label className="flex-1 text-xs font-semibold">
              Minimum entries
              <input
                className={`${inputClass} mt-1`}
                type="number"
                min="1"
                value={bracket.minimumEntries}
                onChange={(event) =>
                  updateBracket(bracketIndex, (current) => ({
                    ...current,
                    minimumEntries: Number(event.target.value),
                  }))
                }
                required
              />
            </label>
            <label className="flex-1 text-xs font-semibold">
              Maximum entries
              <input
                className={`${inputClass} mt-1`}
                type="number"
                min={bracket.minimumEntries}
                value={bracket.maximumEntries ?? ""}
                placeholder="No limit"
                onChange={(event) =>
                  updateBracket(bracketIndex, (current) => ({
                    ...current,
                    maximumEntries: event.target.value
                      ? Number(event.target.value)
                      : null,
                  }))
                }
              />
            </label>
            <label className="w-28 text-xs font-semibold">
              Active Ds
              <select
                className={`${inputClass} mt-1`}
                value={bracket.activeDivisions}
                onChange={(event) => {
                  const count = Number(event.target.value);
                  updateBracket(bracketIndex, (current) => ({
                    ...current,
                    activeDivisions: count,
                    purseBasisPoints: current.purseBasisPoints.map(
                      (value, index) => (index < count ? value : 0),
                    ) as FourDEntryBracket["purseBasisPoints"],
                    placesByDivision: current.placesByDivision.map(
                      (value, index) =>
                        index < count ? Math.max(value, 1) : 0,
                    ) as FourDEntryBracket["placesByDivision"],
                  }));
                }}
              >
                {[1, 2, 3, 4].map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
            {settings.brackets.length > 1 ? (
              <button
                type="button"
                aria-label="Remove entry bracket"
                className="grid h-10 w-10 place-items-center rounded-md border border-[#d7ddda] text-rose-700 hover:bg-rose-50"
                onClick={() =>
                  setSettings((current) => ({
                    ...current,
                    brackets: current.brackets.filter(
                      (_, index) => index !== bracketIndex,
                    ),
                  }))
                }
              >
                <Trash2 size={16} />
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-[48px_1fr_1fr] gap-2 text-xs font-semibold text-[#66716b]">
            <span>D</span>
            <span>Purse share</span>
            <span>Places paid</span>
          </div>
          {[0, 1, 2, 3].map((divisionIndex) => {
            const active = divisionIndex < bracket.activeDivisions;
            return (
              <div
                key={divisionIndex}
                className="grid grid-cols-[48px_1fr_1fr] items-center gap-2"
              >
                <span className="text-sm font-bold">{divisionIndex + 1}D</span>
                <div className="relative">
                  <input
                    className={`${inputClass} pr-8 disabled:bg-[#eef1ef]`}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    disabled={!active}
                    value={bracket.purseBasisPoints[divisionIndex] / 100}
                    onChange={(event) =>
                      updateBracket(bracketIndex, (current) => ({
                        ...current,
                        purseBasisPoints: replaceAt(
                          current.purseBasisPoints,
                          divisionIndex,
                          Math.round(Number(event.target.value) * 100),
                        ),
                      }))
                    }
                  />
                  <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-[#66716b]">
                    %
                  </span>
                </div>
                <input
                  className={`${inputClass} disabled:bg-[#eef1ef]`}
                  type="number"
                  min="1"
                  max="100"
                  disabled={!active}
                  value={bracket.placesByDivision[divisionIndex]}
                  onChange={(event) =>
                    updateBracket(bracketIndex, (current) => ({
                      ...current,
                      placesByDivision: replaceAt(
                        current.placesByDivision,
                        divisionIndex,
                        Number(event.target.value),
                      ),
                    }))
                  }
                />
              </div>
            );
          })}
          <p
            className={`text-xs font-semibold ${totals[bracketIndex] === 10000 ? "text-emerald-700" : "text-rose-700"}`}
          >
            Active purse shares total {(totals[bracketIndex] / 100).toFixed(2)}%
          </p>
        </div>
      ))}

      <button
        type="button"
        className="flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-xs font-bold hover:bg-[#f4f6f5]"
        onClick={() =>
          setSettings((current) => ({
            ...current,
            brackets: [
              ...current.brackets,
              {
                ...defaultBracket,
                minimumEntries:
                  (current.brackets.at(-1)?.maximumEntries ??
                    current.brackets.at(-1)?.minimumEntries ??
                    0) + 1,
              },
            ],
          }))
        }
      >
        <Plus size={15} /> Add entry-count bracket
      </button>
    </section>
  );
}
