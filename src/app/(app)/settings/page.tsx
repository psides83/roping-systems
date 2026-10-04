import { Building2, Clock3, ShieldCheck, UserCog } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ProducerSettingsForm } from "@/components/settings/producer-settings-form";
import { ProducerLogoForm } from "@/components/settings/producer-logo-form";
import { ProducerBrandingForm } from "@/components/settings/producer-branding-form";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

interface SettingsData {
  producer: { name: string; publicName: string; email: string; phone: string; timezone: string; allowGuestEntries: boolean; logoUrl: string | null; brandPrimary: string; brandAccent: string };
  role: string;
  team: Array<{ id: string; email: string; role: string; joinedAt: string }>;
  audit: Array<{ id: string; entity: string; action: string; createdAt: string }>;
}

async function getSettingsData(): Promise<SettingsData> {
  if (!isSupabaseConfigured()) return { producer: { name: "Red River Calf Ropers", publicName: "", email: "office@example.com", phone: "(940) 555-0100", timezone: "America/Chicago", allowGuestEntries: true, logoUrl: null, brandPrimary: "#17251F", brandAccent: "#BB3E24" }, role: "owner", team: [{ id: "preview-owner", email: "payton@example.com", role: "owner", joinedAt: "Preview" }, { id: "preview-operator", email: "secretary@example.com", role: "operator", joinedAt: "Preview" }], audit: [] };
  const active = await getActiveProducer();
  if (!active) throw new Error("No active producer was found.");
  const supabase = await createClient();
  const [{ data: producer, error }, { data: team }, { data: audit }] = await Promise.all([
    supabase.from("producers").select("name, public_name, email, phone, timezone, allow_non_member_entries, logo_path, brand_primary, brand_accent").eq("id", active.id).single(),
    supabase.from("producer_staff_directory").select("user_id, email, role, created_at").eq("producer_id", active.id).order("created_at"),
    supabase.from("producer_audit_log").select("id, entity_type, action, created_at").eq("producer_id", active.id).order("created_at", { ascending: false }).limit(8),
  ]);
  if (error || !producer) throw new Error(`Unable to load settings: ${error?.message ?? "Not found"}`);
  const logoUrl = producer.logo_path ? supabase.storage.from("organization-logos").getPublicUrl(producer.logo_path).data.publicUrl : null;
  return { producer: { name: producer.name, publicName: producer.public_name ?? "", email: producer.email ?? "", phone: producer.phone ?? "", timezone: producer.timezone, allowGuestEntries: producer.allow_non_member_entries, logoUrl, brandPrimary: producer.brand_primary, brandAccent: producer.brand_accent }, role: active.role, team: (team ?? []).map((member) => ({ id: member.user_id, email: member.email ?? "No email", role: member.role, joinedAt: new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(member.created_at)) })), audit: (audit ?? []).map((item) => ({ id: String(item.id), entity: item.entity_type, action: item.action, createdAt: new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at)) })) };
}

export default async function SettingsPage() {
  const data = await getSettingsData();
  const configured = isSupabaseConfigured();
  const canEdit = configured && ["owner", "admin"].includes(data.role);
  return <div className="space-y-6"><PageHeader title="Settings" description="Manage producer details, team access, and operating preferences." /><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]"><section className="rounded-md border border-[#dfe4e1] bg-white"><div className="flex items-center gap-3 border-b border-[#e7ebe8] px-5 py-4"><span className="grid h-9 w-9 place-items-center rounded-md bg-[#eef1ef]"><Building2 size={18} /></span><div><h2 className="font-bold">Producer profile</h2><p className="mt-1 text-xs text-[#758078]">Public identity and event defaults</p></div></div><div className="p-5"><ProducerLogoForm key={data.producer.logoUrl ?? "no-logo"} producerName={data.producer.publicName || data.producer.name} logoUrl={data.producer.logoUrl} canEdit={canEdit} readOnlyMessage={configured ? "Only owners and administrators can change the logo." : "Connect Supabase to upload a producer logo."} /><ProducerBrandingForm primary={data.producer.brandPrimary} accent={data.producer.brandAccent} canEdit={canEdit} readOnlyMessage={configured ? "Only owners and administrators can change brand colors." : "Connect Supabase to save producer colors."} /><ProducerSettingsForm producer={data.producer} canEdit={canEdit} /></div></section><div className="space-y-5"><section className="rounded-md border border-[#dfe4e1] bg-white"><div className="flex items-center gap-3 border-b border-[#e7ebe8] px-5 py-4"><UserCog size={18} className="text-[var(--brand-accent-strong)]" /><div><h2 className="font-bold">Team access</h2><p className="mt-1 text-xs text-[#758078]">People who can operate this producer</p></div></div><div className="divide-y divide-[#e7ebe8]">{data.team.map((member) => <div key={member.id} className="flex items-center gap-3 px-5 py-4"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#eef1ef] text-xs font-bold">{member.email.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member.email}</p><p className="mt-1 text-xs capitalize text-[#758078]">{member.role} · {member.joinedAt}</p></div><ShieldCheck size={16} className="text-emerald-600" /></div>)}</div><div className="border-t border-[#e7ebe8] p-4"><button disabled className="h-9 w-full rounded-md border border-[#d7ddda] text-xs font-semibold text-[#758078]">Invitations available after email setup</button></div></section><section className="rounded-md border border-[#dfe4e1] bg-white"><div className="flex items-center gap-2 border-b border-[#e7ebe8] px-5 py-4"><Clock3 size={17} className="text-[var(--brand-accent-strong)]" /><h2 className="font-bold">Recent activity</h2></div><div className="divide-y divide-[#e7ebe8]">{data.audit.map((item) => <div key={item.id} className="px-5 py-3"><p className="text-sm font-semibold capitalize">{item.action} {item.entity.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-[#758078]">{item.createdAt}</p></div>)}{!data.audit.length ? <p className="px-5 py-6 text-sm text-[#758078]">Activity will appear after Supabase is connected.</p> : null}</div></section></div></div></div>;
}
