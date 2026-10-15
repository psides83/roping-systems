import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions, compact = false }: { eyebrow?: string; title: string; description: string; actions?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col flex-wrap border-b border-[#dfe4e1] sm:flex-row sm:items-end sm:justify-between ${compact ? "gap-2 pb-3 sm:gap-4 sm:pb-4" : "gap-4 pb-6"}`}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-2 text-xs font-bold uppercase text-[var(--brand-accent-strong)]">{eyebrow}</p> : null}
        <h1 className={`font-bold text-[#17201c] ${compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl"}`}>{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66716b]">{description}</p>}
      </div>
      {actions ? <div className="flex max-w-full flex-wrap items-center gap-2 [&>a]:shrink-0 [&>a]:whitespace-nowrap [&>button]:shrink-0 [&>button]:whitespace-nowrap">{actions}</div> : null}
    </div>
  );
}
