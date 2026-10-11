"use client";

import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  LockKeyhole,
  LoaderCircle,
  Plus,
  Settings2,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import {
  changeShortRoundQualifier,
  lockShortRoundField,
  type LiveRunState,
} from "@/app/(app)/events/[eventId]/actions";

export interface ShortRoundCandidate {
  entryId: string;
  name: string;
  aggregateTime: number;
  lastRoundTime: number;
  isQualifier: boolean;
}

interface SelectedChange {
  entryId: string;
  name: string;
  action: "added" | "removed";
}

export function ShortRoundFieldDialog({
  eventId,
  divisionId,
  candidates,
  locked,
  editable,
}: {
  eventId: string;
  divisionId: string;
  candidates: ShortRoundCandidate[];
  locked: boolean;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedChange | null>(null);
  const changeAction = changeShortRoundQualifier.bind(
    null,
    eventId,
    divisionId,
  );
  const lockAction = lockShortRoundField.bind(null, eventId, divisionId);
  const [changeState, changeFormAction, changePending] = useActionState<
    LiveRunState,
    FormData
  >(changeAction, {});
  const [lockState, lockFormAction, lockPending] = useActionState<
    LiveRunState,
    FormData
  >(lockAction, {});
  const finalists = useMemo(
    () =>
      candidates
        .filter((candidate) => candidate.isQualifier)
        .sort((a, b) => b.aggregateTime - a.aggregateTime),
    [candidates],
  );
  const available = candidates.filter((candidate) => !candidate.isQualifier);

  useEffect(() => {
    if (!changeState.success && !lockState.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [changeState.success, lockState.success]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-xs font-semibold"
      >
        {locked ? <LockKeyhole size={14} /> : <Settings2 size={14} />}
        {locked ? "Finalists locked" : "Review finalists"}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[95] grid place-items-center overflow-y-auto bg-black/45 p-4">
          <button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`short-round-field-${divisionId}`}
            className="relative my-8 w-full max-w-2xl rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2
                  id={`short-round-field-${divisionId}`}
                  className="flex items-center gap-2 font-bold"
                >
                  <Trophy
                    size={18}
                    className="text-[var(--brand-accent-strong)]"
                  />
                  Short round finalists
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  {finalists.length} advancing · ordered slowest aggregate to
                  fastest
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#f0f2f1]"
              >
                <X size={18} />
              </button>
            </header>

            <div className="max-h-[55vh] overflow-y-auto p-5">
              {locked ? (
                <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                  This finalist field is locked. Its order and membership can no
                  longer be changed.
                </p>
              ) : null}
              <div className="grid gap-5 md:grid-cols-2">
                <FieldList
                  title="Finalists"
                  rows={finalists}
                  action="removed"
                  editable={editable && !locked}
                  onSelect={setSelected}
                />
                <FieldList
                  title="Eligible aggregate entries"
                  rows={available}
                  action="added"
                  editable={editable && !locked}
                  onSelect={setSelected}
                />
              </div>
            </div>

            {selected ? (
              <PersistentForm
                action={changeFormAction}
                className="space-y-3 border-t border-[#e7ebe8] bg-[#fafbfa] p-5"
              >
                <input type="hidden" name="entryId" value={selected.entryId} />
                <input
                  type="hidden"
                  name="fieldAction"
                  value={selected.action}
                />
                <p className="text-sm font-bold">
                  {selected.action === "added" ? "Add" : "Remove"}{" "}
                  {selected.name}
                </p>
                <textarea
                  name="reason"
                  required
                  minLength={5}
                  maxLength={300}
                  rows={2}
                  placeholder="Reason for changing the finalist field"
                  className="w-full resize-y rounded-md border border-[#ccd4d0] bg-white px-3 py-2 text-sm"
                />
                {changeState.message ? (
                  <p className="text-xs text-rose-700">{changeState.message}</p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="h-9 rounded-md border border-[#ccd4d0] px-3 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={changePending}
                    className="flex h-9 items-center gap-2 rounded-md brand-accent-fill px-3 text-xs font-bold text-white disabled:opacity-50"
                  >
                    {changePending ? (
                      <LoaderCircle size={14} className="animate-spin" />
                    ) : selected.action === "added" ? (
                      <Plus size={14} />
                    ) : (
                      <Trash2 size={14} />
                    )}
                    Confirm change
                  </button>
                </div>
              </PersistentForm>
            ) : (
              <footer className="flex items-center justify-between gap-3 border-t border-[#e7ebe8] p-5">
                <p className="text-xs text-[#758078]">
                  Every manual change requires a reason and appears in the
                  changelog.
                </p>
                {!locked ? (
                  <PersistentForm action={lockFormAction}>
                    <button
                      disabled={!editable || !finalists.length || lockPending}
                      className="flex h-9 shrink-0 items-center gap-2 rounded-md brand-primary-fill px-3 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {lockPending ? (
                        <LoaderCircle size={14} className="animate-spin" />
                      ) : (
                        <LockKeyhole size={14} />
                      )}
                      Lock field
                    </button>
                  </PersistentForm>
                ) : null}
                {lockState.message && !lockState.success ? (
                  <p className="text-xs text-rose-700">{lockState.message}</p>
                ) : null}
              </footer>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function FieldList({
  title,
  rows,
  action,
  editable,
  onSelect,
}: {
  title: string;
  rows: ShortRoundCandidate[];
  action: "added" | "removed";
  editable: boolean;
  onSelect: (change: SelectedChange) => void;
}) {
  return (
    <section>
      <h3 className="text-xs font-bold uppercase text-[#66716b]">{title}</h3>
      <div className="mt-2 divide-y divide-[#e7ebe8] rounded-md border border-[#dfe4e1]">
        {rows.map((row) => (
          <div
            key={row.entryId}
            className="flex items-center gap-3 px-3 py-2.5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {row.name}
              </span>
              <span className="font-mono text-[10px] text-[#758078]">
                {row.aggregateTime.toFixed(2)} aggregate
              </span>
            </span>
            <button
              type="button"
              disabled={!editable}
              onClick={() =>
                onSelect({ entryId: row.entryId, name: row.name, action })
              }
              aria-label={`${action === "added" ? "Add" : "Remove"} ${row.name}`}
              title={action === "added" ? "Add finalist" : "Remove finalist"}
              className={`grid h-8 w-8 place-items-center rounded-md border disabled:opacity-30 ${action === "added" ? "border-emerald-200 text-emerald-700" : "border-rose-200 text-rose-700"}`}
            >
              {action === "added" ? <Plus size={14} /> : <Trash2 size={14} />}
            </button>
          </div>
        ))}
        {!rows.length ? (
          <p className="p-4 text-center text-xs text-[#758078]">None</p>
        ) : null}
      </div>
    </section>
  );
}
