import type { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col flex-wrap gap-4 border-b border-[#dfe4e1] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-2 text-xs font-bold uppercase text-[var(--brand-accent-strong)]">{eyebrow}</p> : null}
        <h1 className="text-2xl font-bold text-[#17201c] sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66716b]">{description}</p>
      </div>
      {actions ? <div className="flex max-w-full flex-wrap items-center gap-2 [&>a]:shrink-0 [&>a]:whitespace-nowrap [&>button]:shrink-0 [&>button]:whitespace-nowrap">{actions}</div> : null}
    </div>
  );
}
