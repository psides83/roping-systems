import Link from "next/link";
import { ArrowRight, ClipboardList } from "lucide-react";
import { ProducerSetupChecklist } from "@/components/settings/producer-setup-checklist";
import { loadProducerSetup } from "@/lib/producer-setup-data";
import { setupChecklistSummary, type ChecklistItem } from "@/lib/producer-setup";

export async function DashboardSetup() {
  const data = await loadProducerSetup();
  return <DashboardSetupChecklist items={data.items} />;
}

export function DashboardSetupChecklist({ items }: { items: ChecklistItem[] }) {
  const summary = setupChecklistSummary(items);
  if (!summary.next) return null;
  return <section aria-labelledby="dashboard-setup-title" className="rounded-lg border border-[#dfe4e1] bg-white p-5">
    <div className="flex items-center gap-2"><ClipboardList size={18} className="text-[#526059]" /><h2 id="dashboard-setup-title" className="font-bold">Finish setting up your producer</h2></div>
    <p className="mt-2 text-sm text-[#66716b]">{summary.ready} of {summary.total} setup checks ready. Optional features do not need to be configured. This checklist disappears when your setup is ready.</p>
    <Link href={summary.next.href} className="mt-3 inline-flex min-h-11 max-w-full items-center gap-2 text-sm font-semibold text-[var(--brand-accent-strong)]"><span>Next step: {summary.next.title}</span><ArrowRight size={16} className="shrink-0" /></Link>
    <details className="mt-2"><summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">View setup checklist</summary><ProducerSetupChecklist items={items} /></details>
  </section>;
}
