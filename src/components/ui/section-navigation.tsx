"use client";

import { useEffect, useId, useRef } from "react";
import { NavigationGuardLink as Link } from "nextjs-nav-guard";
import { useRouter } from "next/navigation";

export function SectionNavigation({ label, active, items }: {
  label: string; active: string; items: readonly { id: string; label: string; href: string }[];
}) {
  const router = useRouter();
  const id = useId();
  const nav = useRef<HTMLElement>(null);
  // Keep the current destination visible without moving the whole page vertically.
  useEffect(() => {
    const selected = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (selected && nav.current) {
      nav.current.scrollLeft = Math.max(0, selected.offsetLeft - nav.current.offsetLeft - 16);
    }
  }, [active]);
  return <div>
    <div className="grid gap-2 sm:hidden">
      <label htmlFor={id} className="text-sm font-semibold text-[#66716b]">{label}</label>
      <select id={id} value={active} className="h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold"
        onChange={event => { const item = items.find(item => item.id === event.target.value); if (item) router.push(item.href); }}>
        {items.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
    </div>
    <nav ref={nav} aria-label={label} className="hidden min-w-0 gap-1 overflow-x-auto border-b border-[#d7ddda] sm:flex">
      {items.map(item => <Link key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined}
        className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${active === item.id ? "border-[var(--brand-accent)] text-[#17201c]" : "border-transparent text-[#66716b] hover:border-[#ccd4d0] hover:text-[#17201c]"}`}>{item.label}</Link>)}
    </nav>
  </div>;
}
