import { Check, CircleDollarSign, GripVertical, MoreHorizontal, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { AddFeeDialog, CreateDivisionDialog } from "@/components/settings/division-dialogs";
import { divisionTemplates as demoDivisions } from "@/data/demo";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import type { DivisionTemplateSummary, FeeScope } from "@/types/domain";

const scopeLabels: Record<FeeScope, string> = {
  entry: "Each entry",
  contestant_division: "Once per division",
  contestant_event: "Once per event",
};

async function getDivisions(): Promise<DivisionTemplateSummary[]> {
  if (!isSupabaseConfigured()) return demoDivisions;
  const organization = await getActiveOrganization();
  if (!organization) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("division_templates").select("id, name, description, number_of_runs, maximum_entries_per_person, allow_guests, is_active, fee_templates(id, title, amount_cents, scope, included_in_entry_price, contributes_to_payout, sort_order)").eq("organization_id", organization.id).order("sort_order").order("created_at");
  if (error) throw new Error(`Unable to load division settings: ${error.message}`);

  return data.map((division) => ({
    id: division.id,
    name: division.name,
    description: division.description ?? "",
    numberOfRuns: division.number_of_runs,
    maximumEntriesPerPerson: division.maximum_entries_per_person,
    allowGuests: division.allow_guests,
    isActive: division.is_active,
    fees: (division.fee_templates as unknown as Array<{ id: string; title: string; amount_cents: number; scope: FeeScope; included_in_entry_price: boolean; contributes_to_payout: boolean; sort_order: number }>).sort((a, b) => a.sort_order - b.sort_order).map((fee) => ({ id: fee.id, title: fee.title, amountCents: fee.amount_cents, scope: fee.scope, includedInEntryPrice: fee.included_in_entry_price, contributesToPayout: fee.contributes_to_payout })),
  }));
}

export default async function DivisionSettingsPage() {
  const configured = isSupabaseConfigured();
  const divisions = await getDivisions();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Organization setup" title="Divisions & fees" description="Build reusable division rules and fee schedules. Every setting can still be adjusted for an individual event." actions={<CreateDivisionDialog configured={configured} />} />
      <div className="flex gap-1 overflow-x-auto border-b border-[#d7ddda]"><button className="border-b-2 border-[var(--brand-accent)] px-4 py-3 text-sm font-bold text-[#17201c]">Divisions</button><button className="px-4 py-3 text-sm font-semibold text-[#66716b]">Skill levels</button><button className="px-4 py-3 text-sm font-semibold text-[#66716b]">Fee library</button><button className="px-4 py-3 text-sm font-semibold text-[#66716b]">Eligibility</button></div>
      <section className="space-y-4">
        {divisions.map((division) => <article key={division.id} className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white"><div className="flex items-start gap-3 border-b border-[#e7ebe8] p-5"><button aria-label={`Reorder ${division.name}`} className="mt-1 text-[#98a09b]"><GripVertical size={18} /></button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-bold">{division.name}</h2><span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><Check size={12} /> {division.isActive ? "Active" : "Inactive"}</span></div><p className="mt-1 text-sm text-[#66716b]">{division.description || "No description"}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[#758078]"><span>{division.numberOfRuns} run{division.numberOfRuns === 1 ? "" : "s"}</span><span>{division.maximumEntriesPerPerson ? `${division.maximumEntriesPerPerson} per contestant` : "Unlimited entries"}</span><span>{division.allowGuests ? "Guests allowed" : "Members only"}</span></div></div><button aria-label={`Options for ${division.name}`} className="grid h-9 w-9 place-items-center rounded-md border border-[#d7ddda]"><MoreHorizontal size={18} /></button></div><div className="p-5"><div className="mb-3 flex items-center justify-between"><p className="flex items-center gap-2 text-xs font-bold uppercase text-[#66716b]"><CircleDollarSign size={15} /> Default fees</p><AddFeeDialog divisionId={division.id} divisionName={division.name} configured={configured} /></div>{division.fees.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left"><thead className="text-[10px] font-bold uppercase text-[#8a938e]"><tr><th className="pb-2">Fee</th><th className="pb-2">Amount</th><th className="pb-2">Applied</th><th className="pb-2">Display</th><th className="w-10 pb-2"></th></tr></thead><tbody className="divide-y divide-[#edf0ee]">{division.fees.map((fee) => <tr key={fee.id}><td className="py-3 text-sm font-semibold">{fee.title}</td><td className="py-3 text-sm">{formatCurrency(fee.amountCents)}</td><td className="py-3 text-sm text-[#66716b]">{scopeLabels[fee.scope]}</td><td className="py-3 text-sm text-[#66716b]">{fee.includedInEntryPrice ? "Included in entry price" : "Listed separately"}</td><td className="py-3"><button aria-label={`Edit ${fee.title}`}><Settings2 size={15} className="text-[#758078]" /></button></td></tr>)}</tbody></table></div> : <p className="rounded-md bg-[#f7f8f7] px-4 py-3 text-sm text-[#66716b]">No default fees yet.</p>}</div></article>)}
        {!divisions.length ? <div className="rounded-md border border-dashed border-[#cbd2ce] bg-white p-10 text-center"><p className="font-semibold">Create your first division</p><p className="mt-2 text-sm text-[#758078]">Divisions hold entry limits, eligibility, runs, and their default fees.</p></div> : null}
      </section>
      <div className="rounded-md border border-dashed border-[#cbd2ce] p-5 text-center"><p className="text-sm font-semibold">Division templates are organization-specific</p><p className="mt-1 text-xs text-[#758078]">Changes here become defaults for new ropings and do not alter past events.</p></div>
    </div>
  );
}
