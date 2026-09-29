"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Plus, Trash2, Trophy } from "lucide-react";
import {
  saveShortRoundSettings,
  type LiveRunState,
} from "@/app/(app)/ropings/[ropingId]/actions";

export interface ShortRoundBracket {
  minimumEntries: number;
  maximumEntries: number | null;
  comebackCount: number;
}

const inputClass =
  "h-9 w-full rounded-md border border-[#ccd4d0] bg-white px-2 font-mono text-sm outline-none focus:border-[var(--brand-accent)] disabled:bg-[#f1f3f2]";

const defaultBracket: ShortRoundBracket = {
  minimumEntries: 1,
  maximumEntries: null,
  comebackCount: 10,
};

export function ShortRoundFields({
  defaultEnabled = false,
  defaultBrackets = [defaultBracket],
  disabled = false,
}: {
  defaultEnabled?: boolean;
  defaultBrackets?: ShortRoundBracket[];
  disabled?: boolean;
}) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [brackets, setBrackets] = useState(
    defaultBrackets.length ? defaultBrackets : [defaultBracket],
  );

  function updateBracket(index: number, values: Partial<ShortRoundBracket>) {
    setBrackets((current) =>
      current.map((bracket, bracketIndex) =>
        bracketIndex === index ? { ...bracket, ...values } : bracket,
      ),
    );
  }

  function addBracket() {
    setBrackets((current) => {
      const last = current.at(-1) ?? defaultBracket;
      const previousMaximum = last.maximumEntries ?? last.minimumEntries + 9;
      const withClosedRange = current.map((bracket, index) =>
        index === current.length - 1 && bracket.maximumEntries === null
          ? { ...bracket, maximumEntries: previousMaximum }
          : bracket,
      );
      return [
        ...withClosedRange,
        {
          minimumEntries: previousMaximum + 1,
          maximumEntries: null,
          comebackCount: last.comebackCount,
        },
      ];
    });
  }

  return (
    <section className="rounded-md border border-[#dfe4e1]">
      <input
        type="hidden"
        name="shortRoundBrackets"
        value={JSON.stringify(brackets)}
      />
      <label className="flex cursor-pointer items-start gap-3 p-4">
        <input
          name="shortRoundEnabled"
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          disabled={disabled}
          className="mt-0.5 h-4 w-4 accent-[var(--brand-accent)]"
        />
        <Trophy
          size={18}
          className="mt-0.5 text-[var(--brand-accent-strong)]"
        />
        <span>
          <span className="block text-sm font-bold">Short round</span>
          <span className="mt-1 block text-xs leading-5 text-[#758078]">
            Bring the top entries in the main-round aggregate back for a final
            run.
          </span>
        </span>
      </label>
      {enabled ? (
        <div className="space-y-3 border-t border-[#e7ebe8] p-4">
          <div>
            <p className="text-sm font-bold">Comeback schedule</p>
            <p className="mt-1 text-xs leading-5 text-[#758078]">
              Set the number of finalists for each total-entry range.
            </p>
          </div>
          {brackets.map((bracket, index) => (
            <div
              key={index}
              className="grid grid-cols-[1fr_1fr_auto] items-end gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <label className="text-[10px] font-bold uppercase text-[#66716b] sm:col-auto">
                Min entries
                <input
                  type="number"
                  min="1"
                  value={bracket.minimumEntries}
                  onChange={(event) =>
                    updateBracket(index, {
                      minimumEntries: Number(event.target.value),
                    })
                  }
                  disabled={disabled}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="text-[10px] font-bold uppercase text-[#66716b] sm:col-auto">
                Max entries
                <input
                  type="number"
                  min="1"
                  value={bracket.maximumEntries ?? ""}
                  onChange={(event) =>
                    updateBracket(index, {
                      maximumEntries: event.target.value
                        ? Number(event.target.value)
                        : null,
                    })
                  }
                  disabled={disabled}
                  placeholder="No limit"
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <label className="col-span-2 text-[10px] font-bold uppercase text-[#66716b] sm:col-span-1">
                Come back
                <input
                  type="number"
                  min="1"
                  value={bracket.comebackCount}
                  onChange={(event) =>
                    updateBracket(index, {
                      comebackCount: Number(event.target.value),
                    })
                  }
                  disabled={disabled}
                  className={`mt-1 ${inputClass}`}
                />
              </label>
              <button
                type="button"
                aria-label={`Remove comeback bracket ${index + 1}`}
                onClick={() =>
                  setBrackets((current) =>
                    current.filter((_, bracketIndex) => bracketIndex !== index),
                  )
                }
                disabled={disabled || brackets.length === 1}
                className="grid h-9 w-9 place-items-center rounded-md border border-[#d7ddda] text-rose-700 disabled:opacity-30"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addBracket}
            disabled={disabled}
            className="flex h-9 items-center gap-2 rounded-md border border-dashed border-[#aeb8b2] px-3 text-xs font-semibold disabled:opacity-50"
          >
            <Plus size={14} /> Add entry range
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function ShortRoundSettingsForm({
  ropingId,
  divisionId,
  enabled,
  brackets,
  editable,
}: {
  ropingId: string;
  divisionId: string;
  enabled: boolean;
  brackets: ShortRoundBracket[];
  editable: boolean;
}) {
  const action = saveShortRoundSettings.bind(null, ropingId, divisionId);
  const [state, formAction, pending] = useActionState<LiveRunState, FormData>(
    action,
    {},
  );

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <ShortRoundFields
        defaultEnabled={enabled}
        defaultBrackets={brackets}
        disabled={!editable}
      />
      {state.message ? (
        <p
          className={`text-xs ${state.success ? "text-emerald-700" : "text-rose-700"}`}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}
      {editable ? (
        <div className="flex justify-end">
          <button
            disabled={pending}
            className="flex h-9 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-xs font-semibold disabled:opacity-50"
          >
            {pending ? (
              <LoaderCircle size={14} className="animate-spin" />
            ) : null}
            Save short round
          </button>
        </div>
      ) : null}
    </form>
  );
}
