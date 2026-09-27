import { Download, Filter, MoreHorizontal, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { members as demoMembers } from "@/data/demo";
import { AddMemberDialog } from "@/components/members/add-member-dialog";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getActiveOrganization } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";
import type { MemberSummary, MembershipStatus } from "@/types/domain";

async function getMembers(): Promise<MemberSummary[]> {
  if (!isSupabaseConfigured()) return demoMembers;
  const organization = await getActiveOrganization();
  if (!organization) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("organization_memberships").select("id, member_number, status, joined_on, people!inner(first_name, last_name, email, phone), skill_levels(name)").eq("organization_id", organization.id).order("created_at", { ascending: false });
  if (error) throw new Error(`Unable to load members: ${error.message}`);

  return data.map((membership) => {
    const person = membership.people as unknown as { first_name: string; last_name: string; email: string | null; phone: string | null };
    const level = membership.skill_levels as unknown as { name: string } | null;
    return { id: membership.id, memberNumber: membership.member_number, name: `${person.first_name} ${person.last_name}`.trim(), email: person.email ?? "-", phone: person.phone ?? "-", classification: level?.name ?? "Unclassified", status: membership.status as MembershipStatus, joinedAt: membership.joined_on ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${membership.joined_on}T12:00:00`)) : "-" };
  });
}

export default async function MembersPage() {
  const configured = isSupabaseConfigured();
  const members = await getMembers();
  const activeCount = members.filter((member) => member.status === "active").length;
  const pendingCount = members.filter((member) => member.status === "pending").length;
  const expiredCount = members.filter((member) => member.status === "expired").length;
  return (
    <div className="space-y-6">
      <PageHeader title="Members" description="Manage organization memberships while each roper keeps one profile across all organizations." actions={<AddMemberDialog configured={configured} />} />
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-md border border-[#dfe4e1] bg-white p-4"><p className="text-xs font-semibold text-[#758078]">Active members</p><p className="mt-1 text-2xl font-bold">{configured ? activeCount : 248}</p></div><div className="rounded-md border border-[#dfe4e1] bg-white p-4"><p className="text-xs font-semibold text-[#758078]">Pending approval</p><p className="mt-1 text-2xl font-bold">{configured ? pendingCount : 7}</p></div><div className="rounded-md border border-[#dfe4e1] bg-white p-4"><p className="text-xs font-semibold text-[#758078]">Expired</p><p className="mt-1 text-2xl font-bold">{configured ? expiredCount : 19}</p></div></div>
      <section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#e7ebe8] p-4 sm:flex-row sm:items-center sm:justify-between"><label className="flex h-10 max-w-md flex-1 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-[#758078]"><Search size={17} /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#99a19d]" placeholder="Search name, member number, or phone" /></label><div className="flex gap-2"><button className="flex h-10 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-sm font-semibold"><Filter size={16} /> Filter</button><button aria-label="Export members" className="grid h-10 w-10 place-items-center rounded-md border border-[#d7ddda]"><Download size={17} /></button></div></div>
        <div className="overflow-x-auto scrollbar-subtle"><table className="w-full min-w-[820px] text-left"><thead className="bg-[#f7f8f7] text-[11px] font-bold uppercase text-[#758078]"><tr><th className="px-5 py-3">Member</th><th className="px-5 py-3">Member #</th><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Class</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Joined</th><th className="w-12 px-4 py-3"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-[#e7ebe8]">{members.map((member) => <tr key={member.id} className="hover:bg-[#fafbfa]"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-full bg-[#eef1ef] text-xs font-bold text-[#435149]">{member.name.split(" ").map((part) => part[0]).join("")}</span><span className="text-sm font-semibold">{member.name}</span></div></td><td className="px-5 py-4 font-mono text-xs text-[#58645d]">{member.memberNumber}</td><td className="px-5 py-4"><p className="text-sm">{member.phone}</p><p className="mt-1 text-xs text-[#7b857f]">{member.email}</p></td><td className="px-5 py-4 text-sm">{member.classification}</td><td className="px-5 py-4"><StatusPill status={member.status} /></td><td className="px-5 py-4 text-sm text-[#66716b]">{member.joinedAt}</td><td className="px-4 py-4"><button aria-label={`Actions for ${member.name}`} className="grid h-8 w-8 place-items-center rounded-md hover:bg-[#eef1ef]"><MoreHorizontal size={18} /></button></td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-between border-t border-[#e7ebe8] px-5 py-4 text-xs text-[#758078]"><span>Showing {members.length} member{members.length === 1 ? "" : "s"}</span><div className="flex gap-2"><button className="rounded border border-[#d7ddda] px-3 py-1.5">Previous</button><button className="rounded border border-[#d7ddda] px-3 py-1.5">Next</button></div></div>
      </section>
    </div>
  );
}
