import Link from "next/link";
import { ProducerFeatureGate } from "@/components/settings/producer-features-context";
import { MemberList } from "@/components/members/member-list";
import { Settings2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { members as demoMembers } from "@/data/demo";
import { AddMemberDialog } from "@/components/members/add-member-dialog";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getActiveProducer } from "@/lib/producers";
import { getProducerFeatures } from "@/lib/producer-features-server";
import { featureEnabled } from "@/lib/producer-features";
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
  divisions: DisciplineOption[];
  canEdit: boolean;
}> {
  if (!isSupabaseConfigured())
    return { members: demoMembers, divisions: [], canEdit: false };
  const producer = await getActiveProducer();
  if (!producer) return { members: [], divisions: [], canEdit: false };
  const requireMemberships = featureEnabled(await getProducerFeatures(producer.id), "require_memberships");
  const supabase = await createClient();
  const [
    { data, error },
    { data: assignments, error: assignmentError },
    { data: disciplineRows, error: disciplineError },
  ] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        "id, member_number, status, formally_approved, joined_on, ropers!inner(first_name, last_name, email, phone)",
      )
      .eq("producer_id", producer.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("membership_classification_history")
      .select(
        "membership_id, classifications!inner(name), divisions!inner(name)",
      )
      .eq("producer_id", producer.id)
      .is("ended_on", null),
    supabase
      .from("divisions")
      .select(
        "id, name, classifications(id, name, classification_number:rank, eligibility_type, is_active)",
      )
      .eq("producer_id", producer.id)
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
    const discipline = assignment.divisions as unknown as { name: string };
    const current = classificationsByMember.get(assignment.membership_id) ?? [];
    current.push({ discipline: discipline.name, name: classification.name });
    classificationsByMember.set(assignment.membership_id, current);
  }

  const members = data.map((membership) => {
    const person = membership.ropers as unknown as {
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
      status: requireMemberships && membership.status === "active" && !membership.formally_approved ? "pending" : membership.status as MembershipStatus,
      joinedAt: membership.joined_on
        ? new Intl.DateTimeFormat("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }).format(new Date(`${membership.joined_on}T12:00:00`))
        : "-",
    };
  });
  const divisions = (disciplineRows ?? []).flatMap((discipline) => {
    const classifications = (
      discipline.classifications as unknown as Array<{
        id: string;
        name: string;
        classification_number: number;
        eligibility_type: "skill" | "open" | "age";
        is_active: boolean;
      }>
    )
      .filter((item) => item.is_active && item.eligibility_type !== "age")
      .sort(
        (a, b) =>
          b.classification_number - a.classification_number ||
          a.name.localeCompare(b.name),
      )
      .map(({ id, name }) => ({ id, name }));
    return classifications.length
      ? [{ id: discipline.id, name: discipline.name, classifications }]
      : [];
  });
  return {
    members,
    divisions,
    canEdit: producer.role !== "viewer",
  };
}

export default async function MembersPage() {
  const configured = isSupabaseConfigured();
  const { members, divisions, canEdit } = await getMemberPageData();
  const producer = await getActiveProducer();
  const requireMemberships = featureEnabled(producer ? await getProducerFeatures(producer.id) : {}, "require_memberships");
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
        title={requireMemberships ? "Members" : "Ropers"}
        description={requireMemberships ? "Manage memberships, classifications, and roper history." : "Manage roper records, classifications, and competition history. Formal membership is not required."}
        actions={
          <div className="flex flex-wrap items-center gap-3">
          <ProducerFeatureGate feature="dues"><Link href="/members/dues" className="inline-flex items-center gap-2 rounded-md border border-[#dfe4e1] bg-white px-3 py-2 text-sm font-semibold">Membership dues</Link></ProducerFeatureGate>
          {canEdit && <Link href="/members/account-links" className="inline-flex items-center gap-2 rounded-md border border-[#dfe4e1] bg-white px-3 py-2 text-sm font-semibold">Account connections</Link>}
          {canEdit && <Link href="/members/profile-requests" className="inline-flex items-center gap-2 rounded-md border border-[#dfe4e1] bg-white px-3 py-2 text-sm font-semibold">Profile corrections</Link>}
          {canEdit && <Link href="/members/import" className="inline-flex items-center gap-2 rounded-md border border-[#dfe4e1] bg-white px-3 py-2 text-sm font-semibold">Import {requireMemberships ? "members" : "ropers"}</Link>}
          <AddMemberDialog
            configured={configured && canEdit}
            divisions={divisions}
          /></div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-[#dfe4e1] bg-white p-4">
          <p className="text-xs font-semibold text-[#758078]">{requireMemberships ? "Active members" : "Roper records"}</p>
          <p className="mt-1 text-2xl font-bold">
            {configured ? (requireMemberships ? activeCount : members.length) : 248}
          </p>
        </div>
        {requireMemberships && <div className="rounded-md border border-[#dfe4e1] bg-white p-4">
          <p className="text-xs font-semibold text-[#758078]">
            Pending approval
          </p>
          <p className="mt-1 text-2xl font-bold">
            {configured ? pendingCount : 7}
          </p>
        </div>}
        {requireMemberships && <div className="rounded-md border border-[#dfe4e1] bg-white p-4">
          <p className="text-xs font-semibold text-[#758078]">Expired</p>
          <p className="mt-1 text-2xl font-bold">
            {configured ? expiredCount : 19}
          </p>
        </div>}
      </div>
      <MemberList members={members} requireMemberships={requireMemberships} head={
            <thead className="bg-[#f7f8f7] text-[11px] font-bold uppercase text-[#758078]">
              <tr>
                <th className="px-5 py-3">{requireMemberships ? "Member" : "Roper"}</th>
                <th className="px-5 py-3">{requireMemberships ? "Member #" : "Roper #"}</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Classifications</th>
                {requireMemberships && <th className="px-5 py-3">Status</th>}
                <th className="px-5 py-3">Joined</th>
                <th className="w-12 px-4 py-3">
                  <span className="sr-only">Manage</span>
                </th>
              </tr>
            </thead>
      } rows={members.map((member) => (
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
                  {requireMemberships && <td className="px-5 py-4">
                    <StatusPill status={member.status} />
                  </td>}
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
              ))} />
    </div>
  );
}
