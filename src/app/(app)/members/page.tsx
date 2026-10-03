import Link from "next/link";
import { Download, Filter, Search, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { members as demoMembers } from "@/data/demo";
import { AddMemberDialog } from "@/components/members/add-member-dialog";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getActiveOrganization } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";
import { formatPhoneNumber } from "@/lib/utils";
import type { MemberSummary, MembershipStatus } from "@/types/domain";

interface DisciplineOption {
  id: string;
  name: string;
  classifications: Array<{ id: string; name: string }>;
}

async function getMemberPageData(): Promise<{
  members: MemberSummary[];
  disciplines: DisciplineOption[];
  canEdit: boolean;
}> {
  if (!isSupabaseConfigured())
    return { members: demoMembers, disciplines: [], canEdit: false };
  const organization = await getActiveOrganization();
  if (!organization) return { members: [], disciplines: [], canEdit: false };
  const supabase = await createClient();
  const [
    { data, error },
    { data: assignments, error: assignmentError },
    { data: disciplineRows, error: disciplineError },
  ] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select(
        "id, member_number, status, joined_on, people!inner(first_name, last_name, email, phone)",
      )
      .eq("organization_id", organization.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("member_classifications")
      .select(
        "membership_id, classifications!inner(name), disciplines!inner(name)",
      )
      .eq("organization_id", organization.id)
      .is("ended_on", null),
    supabase
      .from("disciplines")
      .select(
        "id, name, classifications(id, name, rank, eligibility_type, is_active)",
      )
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("sort_order")
      .order("created_at"),
  ]);
  if (error) throw new Error(`Unable to load members: ${error.message}`);
  if (assignmentError)
    throw new Error(
      `Unable to load member classifications: ${assignmentError.message}`,
    );
  if (disciplineError)
    throw new Error(
      `Unable to load classification choices: ${disciplineError.message}`,
    );

  const classificationsByMember = new Map<
    string,
    Array<{ discipline: string; name: string }>
  >();
  for (const assignment of assignments ?? []) {
    const classification = assignment.classifications as unknown as {
      name: string;
    };
    const discipline = assignment.disciplines as unknown as { name: string };
    const current = classificationsByMember.get(assignment.membership_id) ?? [];
    current.push({ discipline: discipline.name, name: classification.name });
    classificationsByMember.set(assignment.membership_id, current);
  }

  const members = data.map((membership) => {
    const person = membership.people as unknown as {
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
    };
    const classifications = classificationsByMember.get(membership.id) ?? [];
    return {
      id: membership.id,
      memberNumber: membership.member_number,
      name: `${person.first_name} ${person.last_name}`.trim(),
      email: person.email ?? "-",
      phone: formatPhoneNumber(person.phone) || "-",
      classification: classifications[0]?.name ?? "Unclassified",
      classifications,
      status: membership.status as MembershipStatus,
      joinedAt: membership.joined_on
        ? new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }).format(new Date(`${membership.joined_on}T12:00:00`))
        : "-",
    };
  });
  const disciplines = (disciplineRows ?? []).flatMap((discipline) => {
    const classifications = (
      discipline.classifications as unknown as Array<{
        id: string;
        name: string;
        rank: number;
        eligibility_type: "skill" | "open" | "age";
        is_active: boolean;
      }>
    )
      .filter((item) => item.is_active && item.eligibility_type === "skill")
      .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name))
      .map(({ id, name }) => ({ id, name }));
    return classifications.length
      ? [{ id: discipline.id, name: discipline.name, classifications }]
      : [];
  });
  return {
    members,
    disciplines,
    canEdit: organization.role !== "viewer",
  };
}

export default async function MembersPage() {
  const configured = isSupabaseConfigured();
  const { members, disciplines, canEdit } = await getMemberPageData();
  const activeCount = members.filter(
    (member) => member.status === "active",
  ).length;
  const pendingCount = members.filter(
    (member) => member.status === "pending",
  ).length;
  const expiredCount = members.filter(
    (member) => member.status === "expired",
  ).length;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Members"
        description="Manage memberships, division-specific classifications, and review history while each roper keeps one shared profile."
        actions={
          <AddMemberDialog
            configured={configured && canEdit}
            disciplines={disciplines}
          />
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-[#dfe4e1] bg-white p-4">
          <p className="text-xs font-semibold text-[#758078]">Active members</p>
          <p className="mt-1 text-2xl font-bold">
            {configured ? activeCount : 248}
          </p>
        </div>
        <div className="rounded-md border border-[#dfe4e1] bg-white p-4">
          <p className="text-xs font-semibold text-[#758078]">
            Pending approval
          </p>
          <p className="mt-1 text-2xl font-bold">
            {configured ? pendingCount : 7}
          </p>
        </div>
        <div className="rounded-md border border-[#dfe4e1] bg-white p-4">
          <p className="text-xs font-semibold text-[#758078]">Expired</p>
          <p className="mt-1 text-2xl font-bold">
            {configured ? expiredCount : 19}
          </p>
        </div>
      </div>
      <section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
        <div className="flex flex-col gap-3 border-b border-[#e7ebe8] p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex h-10 max-w-md flex-1 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-[#758078]">
            <Search size={17} />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#99a19d]"
              placeholder="Search name, member number, or phone"
            />
          </label>
          <div className="flex gap-2">
            <button className="flex h-10 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-sm font-semibold">
              <Filter size={16} /> Filter
            </button>
            <button
              aria-label="Export members"
              className="grid h-10 w-10 place-items-center rounded-md border border-[#d7ddda]"
            >
              <Download size={17} />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto scrollbar-subtle">
          <table className="w-full min-w-[860px] text-left">
            <thead className="bg-[#f7f8f7] text-[11px] font-bold uppercase text-[#758078]">
              <tr>
                <th className="px-5 py-3">Member</th>
                <th className="px-5 py-3">Member #</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Classifications</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Joined</th>
                <th className="w-12 px-4 py-3">
                  <span className="sr-only">Manage</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e7ebe8]">
              {members.map((member) => (
                <tr key={member.id} className="hover:bg-[#fafbfa]">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-[#eef1ef] text-xs font-bold text-[#435149]">
                        {member.name
                          .split(" ")
                          .map((part) => part[0])
                          .join("")}
                      </span>
                      <Link
                        href={`/members/${member.id}`}
                        className="text-sm font-semibold hover:text-[var(--brand-accent-strong)]"
                      >
                        {member.name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-5 py-4 font-mono text-xs text-[#58645d]">
                    {member.memberNumber}
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm">{member.phone}</p>
                    <p className="mt-1 text-xs text-[#7b857f]">
                      {member.email}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {member.classifications?.length ? (
                        member.classifications.map((classification) => (
                          <span
                            key={`${classification.discipline}-${classification.name}`}
                            title={classification.discipline}
                            className="rounded bg-[#eef1ef] px-2 py-1 text-xs font-semibold"
                          >
                            {classification.discipline}: {classification.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-sm text-[#758078]">
                          Unclassified
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <StatusPill status={member.status} />
                  </td>
                  <td className="px-5 py-4 text-sm text-[#66716b]">
                    {member.joinedAt}
                  </td>
                  <td className="px-4 py-4">
                    <Link
                      href={`/members/${member.id}`}
                      aria-label={`Manage ${member.name}`}
                      className="grid h-8 w-8 place-items-center rounded-md hover:bg-[#eef1ef]"
                    >
                      <Settings2 size={17} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-[#e7ebe8] px-5 py-4 text-xs text-[#758078]">
          <span>
            Showing {members.length} member{members.length === 1 ? "" : "s"}
          </span>
          <div className="flex gap-2">
            <button className="rounded border border-[#d7ddda] px-3 py-1.5">
              Previous
            </button>
            <button className="rounded border border-[#d7ddda] px-3 py-1.5">
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
