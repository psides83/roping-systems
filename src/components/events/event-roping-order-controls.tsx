"use client";

import { ReorderHandle } from "@/components/ui/reorder-handle";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { moveEventRoping } from "@/app/(app)/events/[eventId]/actions";

export function EventRopingOrderControls({
  eventId,
  ropingId,
  ropingName,
  canMoveUp,
  canMoveDown,
  enabled,
  orderGroup,
}: {
  eventId: string;
  ropingId: string;
  ropingName: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  enabled: boolean;
  orderGroup: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function move(direction: "up" | "down", target?: string) {
    startTransition(async () => {
      try {
        const result = await moveEventRoping(eventId, ropingId, direction, target);
        setMessage(result.success ? "Order saved." : (result.message ?? "Unable to reorder."));
      } catch { setMessage("Unable to save the order. Please try again."); }
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
      <ReorderHandle id={ropingId} group={orderGroup} label={ropingName} disabled={!enabled || pending || (!canMoveUp && !canMoveDown)} onMove={target => move("up", target)} />
      <button
        type="button"
        disabled={!enabled || !canMoveUp || pending}
        onClick={(event) => {
          event.preventDefault();
          move("up");
        }}
        title={`Move ${ropingName} earlier`}
        aria-label={`Move ${ropingName} earlier`}
        className="grid h-8 w-8 place-items-center rounded-md border border-[#d7ddda] bg-white text-[#56615b] hover:bg-[#f1f3f2] disabled:opacity-30"
      >
        <ArrowUp size={14} />
      </button>
      <button
        type="button"
        disabled={!enabled || !canMoveDown || pending}
        onClick={(event) => {
          event.preventDefault();
          move("down");
        }}
        title={`Move ${ropingName} later`}
        aria-label={`Move ${ropingName} later`}
        className="grid h-8 w-8 place-items-center rounded-md border border-[#d7ddda] bg-white text-[#56615b] hover:bg-[#f1f3f2] disabled:opacity-30"
      >
        <ArrowDown size={14} />
      </button>
      {pending || message ? (
        <span role="status" className="max-w-44 text-xs font-medium text-[#66716b]">
          {pending ? "Saving order…" : message}
        </span>
      ) : null}
    </div>
  );
}
