"use client";

import { useActionState, useEffect, useState } from "react";
import { LoaderCircle, Tags, X } from "lucide-react";
import {
  assignMemberClassification,
  type MemberClassificationFormState,
} from "@/app/(app)/members/[membershipId]/actions";
import { blocksMoveBack, type MoveBackProgress } from "@/lib/classification-move-back";
import { MoveBackFeedback } from "./move-back-feedback";

interface DisciplineOption {
  id: string;
  name: string;
  classifications: Array<{ id: string; name: string }>;
}

const initialState: MemberClassificationFormState = {};
const inputClass =
  "mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]";

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
        aria-label={title}
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

function FormMessage({ state }: { state: MemberClassificationFormState }) {
  return state.message ? (
    <p
      className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
    >
      {state.message}
    </p>
  ) : null;
}

export function AssignClassificationDialog({
  membershipId,
  divisions,
  enabled,
  reviewId = "",
  defaultDisciplineId,
  compact = false,
  moveBackProgress = [],
}: {
  membershipId: string;
  divisions: DisciplineOption[];
  enabled: boolean;
  reviewId?: string;
  defaultDisciplineId?: string;
  compact?: boolean;
  moveBackProgress?: MoveBackProgress[];
}) {
  const [open, setOpen] = useState(false);
  const [disciplineId, setDisciplineId] = useState(
    defaultDisciplineId ?? divisions[0]?.id ?? "",
  );
  const [state, action, pending] = useActionState(
    assignMemberClassification,
    initialState,
  );
  const [classificationId, setClassificationId] = useState("");
  useEffect(() => {
    if (!state.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [state]);
  const selected = divisions.find(
    (discipline) => discipline.id === disciplineId,
  );
  const targetId = classificationId || selected?.classifications[0]?.id || "";
  const progress = moveBackProgress.find((p) => p.divisionId === disciplineId);
  const blocked = blocksMoveBack(progress, targetId);

  return (
    <>
      <button
        disabled={!enabled || !divisions.length}
        onClick={() => setOpen(true)}
        className={
          compact
            ? "flex h-9 items-center gap-2 rounded-md brand-accent-fill px-3 text-xs font-bold text-white disabled:opacity-50"
            : "flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-50"
        }
      >
        <Tags size={compact ? 15 : 17} />
        {reviewId ? "Resolve & assign" : "Assign classification"}
      </button>
      {open ? (
        <DialogFrame
          title="Assign classification"
          description="The previous assignment stays in history and this change becomes effective on the selected date."
          close={() => setOpen(false)}
        >
          <form action={action} className="space-y-4 p-5">
            <input type="hidden" name="membershipId" value={membershipId} />
            <input type="hidden" name="reviewId" value={reviewId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                Division
                <select
                  name="disciplineId"
                  value={disciplineId}
                  onChange={(event) => { setDisciplineId(event.target.value); setClassificationId(""); }}
                  className={inputClass}
                >
                  {divisions.map((discipline) => (
                    <option key={discipline.id} value={discipline.id}>
                      {discipline.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-semibold">
                Classification
                <select
                  name="classificationId"
                  key={disciplineId}
                  value={targetId}
                  onChange={(event) => setClassificationId(event.target.value)}
                  className={inputClass}
                  required
                >
                  {selected?.classifications.map((classification) => (
                    <option key={classification.id} value={classification.id}>
                      {classification.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <MoveBackFeedback progress={progress} targetId={targetId} memberId={membershipId} onNavigate={() => setOpen(false)} />
            <label className="block text-sm font-semibold">
              Effective date
              <input
                name="effectiveOn"
                type="date"
                defaultValue={today()}
                className={inputClass}
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              Reason
              <textarea
                name="reason"
                className="mt-2 min-h-20 w-full rounded-md border border-[#ccd4d0] p-3 outline-none focus:border-[var(--brand-accent)]"
                placeholder="Performance review, appeal, annual review..."
              />
            </label>
            <FormMessage state={state} />
            <div className="flex justify-end gap-2 border-t border-[#e7ebe8] pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                disabled={pending || blocked || !selected?.classifications.length}
                className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {pending ? (
                  <LoaderCircle size={16} className="animate-spin" />
                ) : null}
                Save assignment
              </button>
            </div>
          </form>
        </DialogFrame>
      ) : null}
    </>
  );
}
