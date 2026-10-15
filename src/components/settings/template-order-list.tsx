"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import { GripVertical, ListOrdered } from "lucide-react";
import { reorderRopingTemplates } from "@/app/(app)/settings/roping-templates/actions";
import { moveTemplate, replaceTemplateGroupOrder } from "@/lib/template-order";

type TemplateItem = { id: string; name: string; groupId: string; groupName: string; content: ReactNode };

export function TemplateOrderList({ items, enabled }: { items: TemplateItem[]; enabled: boolean }) {
  return <OrderedTemplates key={items.map(item => `${item.groupId}:${item.id}`).join(",")} items={items} enabled={enabled} />;
}

function OrderedTemplates({ items, enabled }: { items: TemplateItem[]; enabled: boolean }) {
  const [order, setOrder] = useState(items.map(item => item.id));
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<{ id: string; after: boolean } | null>(null);
  const drag = useRef<{ id: string; y: number } | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const byId = new Map(items.map(item => [item.id, item]));
  const groups = Array.from(new Map(items.map(item => [item.groupId, item.groupName])));

  function cancel() {
    drag.current = null;
    setTarget(null);
    setEditing(null);
    setMessage("");
  }

  function save() {
    const next = replaceTemplateGroupOrder(order, draft);
    startTransition(async () => {
      try {
        const result = await reorderRopingTemplates(next);
        if (result.success) { setOrder(next); setEditing(null); }
        setMessage(result.message ?? "Unable to save order. Please try again.");
      } catch { setMessage("Unable to save order. Please try again."); }
    });
  }

  return <div className="space-y-8">
    <p role="status" className={message ? "text-sm text-[#526059]" : "sr-only"}>{message}</p>
    {groups.map(([groupId, groupName]) => {
      const ids = order.filter(id => byId.get(id)!.groupId === groupId);
      const active = editing === groupId;
      return <section key={groupId} aria-label={`${groupName} templates`} className="space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe4e1] pb-3">
          <h2 className="text-lg font-bold">{groupName}<span className="ml-2 text-sm font-normal text-[#66716b]">{ids.length} {ids.length === 1 ? "template" : "templates"}</span></h2>
          {enabled && ids.length > 1 && !active && <button type="button" disabled={editing !== null} onClick={() => { setDraft(ids); setEditing(groupId); setMessage(""); }} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold disabled:opacity-40"><ListOrdered size={16} />Reorder<span className="sr-only"> {groupName} templates</span></button>}
          {active && <div className="flex gap-2"><button type="button" disabled={pending} onClick={cancel} className="min-h-11 rounded-md border px-3 text-sm font-semibold disabled:opacity-40">Cancel</button><button type="button" disabled={pending || draft.every((id, index) => id === ids[index])} onClick={save} className="min-h-11 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-40">{pending ? "Saving…" : "Save order"}</button></div>}
        </header>
        {active ? <div aria-busy={pending} className="rounded-md border border-[#dfe4e1] bg-white p-3 sm:p-4">
          <p className="mb-3 text-sm text-[#66716b]">Drag a handle to arrange {groupName} templates. Use the arrow keys on a handle to move it with the keyboard.</p>
          <ol ref={list} className="space-y-1" onKeyDown={event => { if (event.key === "Escape" && !pending) cancel(); }}>
            {draft.map((id, index) => <li key={id} data-template-order-id={id} className={`relative flex min-h-14 items-center gap-3 rounded-md border border-[#e7ebe8] bg-[#f7f8f7] px-2 ${target?.id === id ? target.after ? "after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:bg-[var(--brand-accent-strong)]" : "before:absolute before:inset-x-0 before:-top-1 before:h-0.5 before:bg-[var(--brand-accent-strong)]" : ""}`}>
              <button type="button" disabled={pending} aria-label={`Reorder ${byId.get(id)!.name}, position ${index + 1} of ${draft.length}`} aria-keyshortcuts="ArrowUp ArrowDown" className="flex size-11 shrink-0 touch-none items-center justify-center rounded text-[#66716b] hover:bg-[#e7ebe8] focus-visible:outline-2 focus-visible:outline-offset-2 cursor-grab active:cursor-grabbing"
                onKeyDown={event => {
                  if (pending || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
                  event.preventDefault();
                  const destination = draft[index + (event.key === "ArrowUp" ? -1 : 1)];
                  if (destination) { setDraft(moveTemplate(draft, id, destination)); setMessage(`${byId.get(id)!.name} moved to position ${index + (event.key === "ArrowUp" ? 0 : 2)} of ${draft.length}.`); }
                }}
                onPointerDown={event => {
                  if (pending || event.button !== 0) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = { id, y: event.clientY };
                }}
                onPointerMove={event => {
                  const current = drag.current;
                  if (!current || Math.abs(event.clientY - current.y) < 5) return;
                  const rows = Array.from(list.current?.querySelectorAll<HTMLElement>("[data-template-order-id]") ?? []);
                  const row = rows.reduce<HTMLElement | null>((nearest, candidate) => {
                    const bounds = candidate.getBoundingClientRect();
                    const previous = nearest?.getBoundingClientRect();
                    return !previous || Math.abs(event.clientY - (bounds.top + bounds.bottom) / 2) < Math.abs(event.clientY - (previous.top + previous.bottom) / 2) ? candidate : nearest;
                  }, null);
                  const bounds = row?.getBoundingClientRect();
                  setTarget(row && bounds ? { id: row.dataset.templateOrderId!, after: event.clientY >= (bounds.top + bounds.bottom) / 2 } : null);
                  if (event.clientY < 80) window.scrollBy(0, -16);
                  else if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 16);
                }}
                onPointerUp={() => {
                  const current = drag.current;
                  if (current && target && current.id !== target.id) {
                    const next = draft.filter(item => item !== current.id);
                    next.splice(next.indexOf(target.id) + (target.after ? 1 : 0), 0, current.id);
                    setDraft(next);
                    setMessage(`${byId.get(current.id)!.name} moved to position ${next.indexOf(current.id) + 1} of ${next.length}.`);
                  }
                  drag.current = null; setTarget(null);
                }}
                onPointerCancel={() => { drag.current = null; setTarget(null); }}
                onLostPointerCapture={() => { drag.current = null; setTarget(null); }}
              ><GripVertical size={18} /></button>
              <span className="w-5 shrink-0 text-center text-xs tabular-nums text-[#66716b]">{index + 1}</span><span className="min-w-0 break-words py-2 text-sm font-semibold">{byId.get(id)!.name}</span>
            </li>)}
          </ol>
        </div> : <div className="space-y-4">{ids.map(id => <div key={id}>{byId.get(id)!.content}</div>)}</div>}
      </section>;
    })}
  </div>;
}
