"use client";

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
}: {
  eventId: string;
  ropingId: string;
  ropingName: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  enabled: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function move(direction: "up" | "down") {
    startTransition(async () => {
      const result = await moveEventRoping(eventId, ropingId, direction);
      setMessage(result.success ? "" : (result.message ?? "Unable to reorder."));
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1" onClick={(event) => event.stopPropagation()}>
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
      {message ? (
        <span role="alert" className="max-w-44 text-xs font-medium text-rose-700">
          {message}
        </span>
      ) : null}
    </div>
  );
}
