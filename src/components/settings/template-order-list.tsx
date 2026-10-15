"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { reorderRopingTemplates } from "@/app/(app)/settings/roping-templates/actions";

export function TemplateOrderList({ items, enabled }: {
  items: { id: string; name: string; content: ReactNode }[];
  enabled: boolean;
}) {
  // Remount when the server's template membership/order changes.
  return <OrderedTemplates key={items.map(item => item.id).join(",")} items={items} enabled={enabled} />;
}

function OrderedTemplates({ items, enabled }: {
  items: { id: string; name: string; content: ReactNode }[];
  enabled: boolean;
}) {
  const [order, setOrder] = useState(items.map(item => item.id));
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("Order is up to date.");
  const [target, setTarget] = useState<string | null>(null);
  const drag = useRef<{ id: string; y: number; target: string } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const byId = new Map(items.map(item => [item.id, item]));

  function move(id: string, destination: string) {
    if (pending || id === destination) return;
    const previous = order;
    const next = [...order];
    next.splice(next.indexOf(id), 1);
    next.splice(order.indexOf(destination), 0, id);
    setOrder(next);
    setMessage("Saving order…");
    startTransition(async () => {
      try {
        const result = await reorderRopingTemplates(next);
        if (!result.success) setOrder(previous);
        setMessage(result.message ?? "Unable to save order.");
      } catch {
        setOrder(previous);
        setMessage("Unable to save order. Please try again.");
      }
    });
  }

  const controlClass = "rounded p-2 text-[#66716b] hover:bg-[#eef1ef] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-30";
  return <div ref={list} className="space-y-4" aria-busy={pending}>
    {enabled && items.length > 1 && <p className="text-sm text-[#66716b]">Drag a handle to reorder templates, or use the arrow buttons. Order saves automatically. Template settings are saved separately.</p>}
    {enabled && <p role="status" className="text-sm text-[#66716b]">{message}</p>}
    {order.map((id, index) => {
      const item = byId.get(id)!;
      return <div key={id} data-template-order-id={id} className={target === id ? "rounded-md ring-2 ring-[var(--brand-accent)]" : ""}>
        {enabled && items.length > 1 && <div className="flex items-center gap-1 pb-1">
          <button type="button" className={`${controlClass} touch-none cursor-grab active:cursor-grabbing`} disabled={pending}
            aria-label={`Drag to reorder ${item.name}`} title="Drag to reorder"
            onPointerDown={event => {
              if (event.button !== 0) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { id, y: event.clientY, target: id };
            }}
            onPointerMove={event => {
              const active = drag.current;
              if (!active || Math.abs(event.clientY - active.y) < 5) return;
              const rows = Array.from(list.current?.querySelectorAll<HTMLElement>("[data-template-order-id]") ?? []);
              const row = rows.reduce<HTMLElement | null>((nearest, candidate) => {
                const bounds = candidate.getBoundingClientRect();
                const current = nearest?.getBoundingClientRect();
                return !current || Math.abs(event.clientY - (bounds.top + bounds.bottom) / 2) < Math.abs(event.clientY - (current.top + current.bottom) / 2) ? candidate : nearest;
              }, null);
              active.target = row?.dataset.templateOrderId ?? id;
              setTarget(active.target);
              if (event.clientY < 80) window.scrollBy(0, -20);
              else if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 20);
            }}
            onPointerUp={() => {
              const active = drag.current;
              drag.current = null;
              setTarget(null);
              if (active) move(active.id, active.target);
            }}
            onPointerCancel={() => { drag.current = null; setTarget(null); }}
            onLostPointerCapture={() => { drag.current = null; setTarget(null); }}
          ><GripVertical size={18} /></button>
          <span className="mr-auto text-xs text-[#66716b]">{index + 1} of {order.length}</span>
          <button type="button" className={controlClass} disabled={pending || index === 0} aria-label={`Move ${item.name} up`} onClick={() => move(id, order[index - 1])}><ArrowUp size={16} /></button>
          <button type="button" className={controlClass} disabled={pending || index === order.length - 1} aria-label={`Move ${item.name} down`} onClick={() => move(id, order[index + 1])}><ArrowDown size={16} /></button>
        </div>}
        {item.content}
      </div>;
    })}
  </div>;
}
