"use client";

import { useEffect, useRef } from "react";
import { GripVertical } from "lucide-react";

/** Rows opt into a group with data-reorder-group and data-reorder-id. */
export function ReorderHandle({ id, group, label, disabled = false, onMove }: {
  id: string; group: string; label: string; disabled?: boolean;
  onMove: (targetId: string) => void;
}) {
  const drag = useRef<{ y: number; target: HTMLElement | null } | null>(null);
  function clear() {
    drag.current?.target?.classList.remove("ring-2", "ring-inset", "ring-amber-500");
    drag.current = null;
  }
  useEffect(() => () => { drag.current?.target?.classList.remove("ring-2", "ring-inset", "ring-amber-500"); }, []);
  return <button type="button" disabled={disabled} aria-label={`Drag to reorder ${label}`} title="Drag to reorder"
    className="inline-flex h-8 w-8 shrink-0 touch-none cursor-grab items-center justify-center rounded-md border border-[#d7ddda] bg-white text-[#56615b] hover:bg-[#f1f3f2] focus-visible:outline-2 focus-visible:outline-offset-2 active:cursor-grabbing disabled:opacity-30"
    onClick={event => { event.preventDefault(); event.stopPropagation(); }}
    onPointerDown={event => {
      if (disabled || event.button !== 0) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { y: event.clientY, target: null };
    }}
    onPointerMove={event => {
      const active = drag.current;
      if (!active || disabled || Math.abs(event.clientY - active.y) < 5) return;
      const underPointer = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-reorder-id]");
      const row = underPointer?.dataset.reorderGroup === group ? underPointer : null;
      active.target?.classList.remove("ring-2", "ring-inset", "ring-amber-500");
      active.target = row;
      row?.classList.add("ring-2", "ring-inset", "ring-amber-500");
      if (event.clientY < 80) window.scrollBy(0, -20);
      else if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 20);
    }}
    onPointerUp={() => {
      const target = drag.current?.target?.dataset.reorderId;
      clear();
      if (!disabled && target && target !== id) onMove(target);
    }}
    onPointerCancel={clear} onLostPointerCapture={clear}
  ><GripVertical size={16} /></button>;
}
