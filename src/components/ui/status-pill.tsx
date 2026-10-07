import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  declined: "bg-rose-50 text-rose-700 ring-rose-200",
  expired: "bg-rose-50 text-rose-700 ring-rose-200",
  inactive: "bg-stone-100 text-stone-600 ring-stone-200",
  in_progress: "bg-rose-50 text-rose-700 ring-rose-200",
  entries_open: "bg-sky-50 text-sky-700 ring-sky-200",
  scheduled: "bg-violet-50 text-violet-700 ring-violet-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  draft: "bg-stone-100 text-stone-600 ring-stone-200",
  unpaid: "bg-amber-50 text-amber-700 ring-amber-200",
  paid_cash: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  comped: "bg-sky-50 text-sky-700 ring-sky-200",
  refunded: "bg-stone-100 text-stone-600 ring-stone-200",
};

const labels: Record<string, string> = { in_progress: "In progress", entries_open: "Entries open", entries_closed: "Entries closed", paid_cash: "Paid cash" };

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", styles[status] ?? styles.draft, className)}>
      {labels[status] ?? status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
