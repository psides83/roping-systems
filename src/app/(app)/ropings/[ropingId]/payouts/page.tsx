import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, Users } from "lucide-react";
import { initializePayoutPlans } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveOrganization } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

interface PayoutPlan {
  id: string;
  name: string;
  poolType: string;
  division: string;
  entryCount: number;
  poolCents: number;
  places: Array<{ place: number; percentage: number; amountCents: number }>;
}

export default async function EventPayoutsPage({ params }: PageProps<"/ropings/[ropingId]/payouts">) {
  const { ropingId } = await params;
  const organization = await getActiveOrganization();
  if (!organization) notFound();
  const supabase = await createClient();
  const [{ data: roping }, { data: plans, error }] = await Promise.all([
    supabase.from("ropings").select("id, title").eq("id", ropingId).eq("organization_id", organization.id).single(),
    supabase.from("roping_payout_plans").select("id, name, pool_type, roping_divisions!inner(name)").eq("roping_id", ropingId).eq("organization_id", organization.id).order("created_at"),
  ]);
  if (!roping) notFound();
  if (error) throw new Error(`Unable to load payout plans: ${error.message}`);

  const calculated = await Promise.all((plans ?? []).map(async (plan): Promise<PayoutPlan> => {
    const { data, error: calculationError } = await supabase.rpc("calculate_roping_payouts", { target_plan_id: plan.id });
    if (calculationError) throw new Error(`Unable to calculate ${plan.name}: ${calculationError.message}`);
    const rows = (data ?? []) as Array<{ entry_count: number; pool_cents: number; place_number: number | null; percentage_basis_points: number | null; payout_cents: number | null }>;
    const summary = rows[0] ?? { entry_count: 0, pool_cents: 0 };
    return { id: plan.id, name: plan.name, poolType: plan.pool_type, division: (plan.roping_divisions as unknown as { name: string }).name, entryCount: summary.entry_count, poolCents: Number(summary.pool_cents), places: rows.filter((row) => row.place_number !== null).map((row) => ({ place: row.place_number as number, percentage: Number(row.percentage_basis_points) / 100, amountCents: Number(row.payout_cents) })) };
  }));

  const initAction = initializePayoutPlans.bind(null, ropingId);
  return <div className="space-y-6"><Link href={`/ropings/${ropingId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#66716b]"><ArrowLeft size={16} /> Back to event</Link><PageHeader eyebrow="Event payouts" title={roping.title} description="Live projections use accepted entries, selected side pots, payout-contributing charges, and added money." />{calculated.length ? <section className="grid gap-4 lg:grid-cols-2">{calculated.map((plan) => <article key={plan.id} className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white"><header className="border-b border-[#e7ebe8] p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">{plan.poolType === "side_pot" ? "Side pot" : plan.division}</p><h2 className="mt-1 text-lg font-bold">{plan.name}</h2></div><Banknote size={20} className="text-[#758078]" /></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-md bg-[#f7f8f7] p-3"><p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#758078]"><Users size={13} /> Entries</p><p className="mt-1 text-xl font-bold">{plan.entryCount}</p></div><div className="rounded-md bg-[#f7f8f7] p-3"><p className="text-[10px] font-bold uppercase text-[#758078]">Payout pool</p><p className="mt-1 text-xl font-bold">{formatCurrency(plan.poolCents)}</p></div></div></header>{plan.places.length ? <div className="divide-y divide-[#edf0ee]">{plan.places.map((place) => <div key={place.place} className="flex items-center px-5 py-4"><span className="w-24 text-sm font-bold">Place {place.place}</span><span className="flex-1 text-sm text-[#66716b]">{place.percentage}%</span><span className="text-lg font-bold">{formatCurrency(place.amountCents)}</span></div>)}</div> : <div className="p-6 text-center"><p className="text-sm font-semibold">No payout bracket applies yet</p><p className="mt-1 text-xs text-[#758078]">The current entry count is below the first configured bracket.</p></div>}</article>)}</section> : <section className="rounded-md border border-dashed border-[#cbd2ce] bg-white p-10 text-center"><p className="font-semibold">No payout plans are attached to this roping</p><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#758078]">Assign payout schedules to division templates and side pots. Existing ropings can then copy those rules without changing prior results.</p><form action={initAction}><button className="mt-4 h-10 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white">Load configured payout plans</button></form></section>}</div>;
}
