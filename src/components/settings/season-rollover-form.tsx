"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { startNextSeason } from "@/app/(app)/settings/seasons/rollover/actions";
import { nextSeasonDates } from "@/lib/season-rollover";
import type { DuesSettings } from "@/lib/membership-dues";
import { formatCurrencyExact } from "@/lib/utils";
import { useProducerFeatures } from "@/components/settings/producer-features-context";
import { featureEnabled } from "@/lib/producer-features";

type Season = { id: string; name: string; starts_on: string; ends_on: string };
type Fund = { id: string; name: string; is_active: boolean; balance_cents: number; reserved_cents: number; available_cents: number };
type Props = { seasons: Season[]; sourceId: string; settings: DuesSettings|null; seasonal: (DuesSettings & { id: string; enabled: boolean })[]; funds: Fund[]; activeMembers: number; ruleCounts: Record<string,number> };
const field="h-10 w-40 max-w-full rounded-md border bg-white pl-3 pr-9 text-sm font-normal";
export function SeasonRolloverForm(props: Props) {
  const [sourceId,setSourceId]=useState(props.seasons.some(s=>s.id===props.sourceId)?props.sourceId:props.seasons[0].id);
  return <div><label className="grid w-fit max-w-full gap-2 text-sm font-semibold">Build from<select className={field} value={sourceId} onChange={e=>setSourceId(e.target.value)}>{props.seasons.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><RolloverFields key={sourceId} {...props} sourceId={sourceId}/></div>;
}
function RolloverFields(props: Props) {
  const features = useProducerFeatures();
  const showDues = featureEnabled(features, "dues");
  const showQualifications = featureEnabled(features, "qualifications");
  const source=props.seasons.find(s=>s.id===props.sourceId)!;
  const seasonal=props.seasonal.find(s=>s.id===source.id);
  const defaults=seasonal ?? props.settings;
  const showAllocation = featureEnabled(features, "funds") || Boolean(defaults?.fund_id) || (defaults?.allocation_value ?? 0) > 0;
  const dates=nextSeasonDates(source.starts_on,source.ends_on);
  const [reference]=useState(()=>crypto.randomUUID());
  const [state,action,pending]=useActionState(startNextSeason,{});
  const [enabled,setEnabled]=useState(showDues && (seasonal ? seasonal.enabled : Boolean(defaults)));
  const [mode,setMode]=useState(defaults?.allocation_mode ?? "fixed");
  const [review,setReview]=useState(false);
  if(state.seasonId) return <section role="status" className="mt-5 space-y-4 border-y py-5"><h2 className="flex items-center gap-2 text-lg font-bold"><Check size={20}/>New season ready</h2><p className="text-sm">Prior-season records and fund ledgers are unchanged.{showQualifications && " Review copied qualification cutoffs before using them."}</p><div className="flex flex-wrap gap-3">{enabled && <Link href={`/members/dues?season=${state.seasonId}`} className="rounded-md border bg-white px-3 py-2 text-sm font-semibold">Review dues</Link>}{showQualifications && <Link href="/settings/qualifications" className="rounded-md border bg-white px-3 py-2 text-sm font-semibold">Qualification templates</Link>}<Link href="/settings?tab=seasons" className="rounded-md border bg-white px-3 py-2 text-sm font-semibold">Seasons</Link></div></section>;
  return <form action={action} className="mt-5 space-y-6"><input type="hidden" name="reference" value={reference}/><input type="hidden" name="sourceSeason" value={source.id}/>
    <fieldset disabled={pending} className="min-w-0 space-y-6">
      <section className="space-y-3 border-t pt-5"><h2 className="font-bold">New season</h2><div className="flex flex-wrap items-end gap-3"><label className="grid max-w-full gap-2 text-sm font-semibold">Name<input name="name" required maxLength={80} defaultValue={dates.startsOn.slice(0,4)===dates.endsOn.slice(0,4) ? dates.startsOn.slice(0,4) : `${dates.startsOn.slice(0,4)}-${dates.endsOn.slice(0,4)}`} className={field}/></label><label className="grid gap-2 text-sm font-semibold">Starts<input name="startsOn" type="date" required min={new Date(Date.parse(source.ends_on)+86400000).toISOString().slice(0,10)} defaultValue={dates.startsOn} className={field}/></label><label className="grid gap-2 text-sm font-semibold">Ends<input name="endsOn" type="date" required defaultValue={dates.endsOn} className={field}/></label></div></section>
      {!showDues && <input type="hidden" name="mode" value="fixed"/>}
      <fieldset hidden={!showDues} disabled={!showDues} className="min-w-0 space-y-3 border-t pt-5"><h2 className="font-bold">Membership dues</h2><label className="flex min-h-10 items-center gap-2 text-sm"><input name="duesEnabled" type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>Set dues for this season</label>
        <div hidden={!enabled} className="space-y-4"><div className="flex flex-wrap items-end gap-3"><label className="grid gap-2 text-sm font-semibold">Dues ($)<input name="amount" inputMode="decimal" required={enabled} defaultValue={defaults ? (defaults.amount_cents/100).toFixed(2):""} className={field}/></label><label className="flex min-h-10 items-center gap-2 text-sm"><input name="installments" type="checkbox" defaultChecked={defaults?.installments}/>Allow installments</label></div>
        <div hidden={!showAllocation}><div className="flex flex-wrap items-end gap-3"><label className="grid gap-2 text-sm font-semibold">Fund contribution<select name="mode" value={mode} onChange={e=>setMode(e.target.value as "fixed"|"percent")} className={field}><option value="fixed">Fixed amount</option><option value="percent">Percentage</option></select></label><label className="grid gap-2 text-sm font-semibold">{mode==="fixed"?"Contribution ($)":"Contribution (%)"}<input key={mode} name="allocation" inputMode="decimal" defaultValue={defaults?.allocation_mode===mode?(defaults.allocation_value/100).toFixed(2):"0.00"} className={field}/></label><label className="grid gap-2 text-sm font-semibold">Destination<select name="fund" defaultValue={defaults?.fund_id ?? ""} className={field}><option value="">No contribution</option>{props.funds.filter(f=>f.is_active || f.id===defaults?.fund_id).map(f=><option key={f.id} value={f.id}>{f.name}{!f.is_active?" (inactive)":""}</option>)}</select></label></div></div>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input name="assessMembers" type="checkbox"/>Create unpaid dues for all {props.activeMembers} active members</label><p className="text-sm text-[#66716b]">This does not record payments, renew memberships, or clear old balances.</p></div>
      </fieldset>
      <section className="space-y-3 border-t pt-5"><h2 className="font-bold">Reuse setup</h2><p className="text-sm text-[#66716b]">Divisions, classifications, roping templates, staff, and producer settings remain available.</p>{showQualifications && <><label className="flex min-h-10 items-center gap-2 text-sm"><input name="copyQualifications" type="checkbox" defaultChecked/>Copy {props.ruleCounts[source.id] ?? 0} qualification templates to the new season</label><p className="text-sm text-[#66716b]">Copied templates use the new season. Both cutoffs reset to season end until you set them. No events or earned positions are copied.</p></>}</section>
      <section className="space-y-3 border-t pt-5"><h2 className="font-bold">History & balances</h2><p className="text-sm text-[#66716b]">Prior standings, attendance, and qualifications stay in the prior season.</p>{props.funds.length > 0 && <><p className="text-sm text-[#66716b]">Fund accounts continue with their existing balances and reservations. Rollover records a balance snapshot, not another deposit.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Fund","Balance","Reserved","Available"].map(h=><th key={h} className="whitespace-nowrap px-3 py-2">{h}</th>)}</tr></thead><tbody>{props.funds.map(f=><tr key={f.id} className="border-t"><td className="px-3 py-2">{f.name}{!f.is_active?" (inactive)":""}</td>{[f.balance_cents,f.reserved_cents,f.available_cents].map((n,i)=><td key={i} className="whitespace-nowrap px-3 py-2">{formatCurrencyExact(Number(n))}</td>)}</tr>)}</tbody></table></div></>}</section>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={review} onChange={e=>setReview(e.target.checked)}/>I have reviewed the season dates, dues, and carry-forward balances.</label>
    </fieldset>
    {state.error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{state.error}</p>}
    <button disabled={pending||!review} className="flex min-h-11 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-semibold text-white disabled:opacity-40">{pending?<LoaderCircle size={16} className="animate-spin"/>:<ArrowRight size={16}/>} {pending?"Creating season…":"Start new season"}</button>
  </form>;
}
