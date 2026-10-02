import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  CalendarClock,
  CircleAlert,
  History,
  Mail,
  Phone,
  UsersRound,
  UserRound,
} from "lucide-react";
import { notFound } from "next/navigation";
import {
  dismissClassificationReview,
  updateMemberBirthDate,
  updateMemberCompetitionGender,
} from "./actions";
import { AssignClassificationDialog } from "@/components/members/classification-dialogs";
import { StatusPill } from "@/components/ui/status-pill";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { MembershipStatus } from "@/types/domain";

interface DisciplineData {
  id: string;
  name: string;
  classifications: Array<{ id: string; name: string; rank: number }>;
}

interface MemberDetail {
  id: string;
  name: string;
  memberNumber: string;
  status: MembershipStatus;
  email: string;
  phone: string;
  joinedOn: string | null;
  birthDate: string | null;
  competitionGender: "female" | "male" | null;
  disciplines: DisciplineData[];
  history: Array<{
    id: string;
    disciplineId: string;
    discipline: string;
    classification: string;
    effectiveOn: string;
    endedOn: string | null;
    reason: string;
  }>;
  reviews: Array<{
    id: string;
    disciplineId: string;
    discipline: string;
    reason: string;
    reviewOn: string;
    proposedClassification: string | null;
  }>;
  canEdit: boolean;
}

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(`${value}T12:00:00`))
    : "-";

async function getMemberDetail(
  membershipId: string,
): Promise<MemberDetail | null> {
  if (!isSupabaseConfigured()) {
    return {
      id: membershipId,
      name: "Jace Holloway",
      memberNumber: "RR-1042",
      status: "active",
      email: "jace@example.com",
      phone: "(940) 555-0182",
      joinedOn: "2024-01-12",
      birthDate: "1992-06-18",
      competitionGender: "male",
      canEdit: false,
      disciplines: [
        {
          id: "calf-roping",
          name: "Calf roping",
          classifications: [
            { id: "open", name: "Open", rank: 200 },
            { id: "115", name: "11.5", rank: 115 },
            { id: "11", name: "11", rank: 110 },
          ],
        },
      ],
      history: [
        {
          id: "history-1",
          disciplineId: "calf-roping",
          discipline: "Calf roping",
          classification: "11.5",
          effectiveOn: "2026-01-01",
          endedOn: null,
          reason: "Annual classification review",
        },
      ],
      reviews: [],
    };
  }

  const organization = await getActiveOrganization();
  if (!organization) return null;
  const supabase = await createClient();
  const { data: membership, error } = await supabase
    .from("organization_memberships")
    .select(
      "id, member_number, status, joined_on, people!inner(first_name, last_name, email, phone, birth_date, competition_gender)",
    )
    .eq("id", membershipId)
    .eq("organization_id", organization.id)
    .single();
  if (error || !membership) return null;

  const [
    { data: disciplineRows, error: disciplineError },
    { data: historyRows, error: historyError },
    { data: reviewRows, error: reviewError },
  ] = await Promise.all([
    supabase
      .from("disciplines")
      .select(
        "id, name, classifications(id, name, rank, eligibility_type, is_active)",
      )
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("member_classifications")
      .select(
        "id, discipline_id, effective_on, ended_on, reason, disciplines!inner(name), classifications!inner(name)",
      )
      .eq("organization_id", organization.id)
      .eq("membership_id", membershipId)
      .order("effective_on", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("classification_reviews")
      .select(
        "id, discipline_id, proposed_classification_id, reason, review_on, disciplines!inner(name)",
      )
      .eq("organization_id", organization.id)
      .eq("membership_id", membershipId)
      .eq("status", "open")
      .order("review_on"),
  ]);
  const loadError = disciplineError ?? historyError ?? reviewError;
  if (loadError)
    throw new Error(
      `Unable to load member classification details: ${loadError.message}`,
    );

  const disciplines: DisciplineData[] = (disciplineRows ?? []).map(
    (discipline) => ({
      id: discipline.id,
      name: discipline.name,
      classifications: (
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
        .map(({ id, name, rank }) => ({ id, name, rank })),
    }),
  );
  const classificationNames = new Map(
    disciplines.flatMap((discipline) =>
      discipline.classifications.map(
        (classification) => [classification.id, classification.name] as const,
      ),
    ),
  );
  const person = membership.people as unknown as {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    birth_date: string | null;
    competition_gender: "female" | "male" | null;
  };

  return {
    id: membership.id,
    name: `${person.first_name} ${person.last_name}`.trim(),
    memberNumber: membership.member_number,
    status: membership.status as MembershipStatus,
    email: person.email ?? "-",
    phone: person.phone ?? "-",
    joinedOn: membership.joined_on,
    birthDate: person.birth_date,
    competitionGender: person.competition_gender,
    canEdit: organization.role !== "viewer",
    disciplines,
    history: (historyRows ?? []).map((row) => ({
      id: row.id,
      disciplineId: row.discipline_id,
      discipline: (row.disciplines as unknown as { name: string }).name,
      classification: (row.classifications as unknown as { name: string }).name,
      effectiveOn: row.effective_on,
      endedOn: row.ended_on,
      reason: row.reason ?? "-",
    })),
    reviews: (reviewRows ?? []).map((row) => ({
      id: row.id,
      disciplineId: row.discipline_id,
      discipline: (row.disciplines as unknown as { name: string }).name,
      reason: row.reason,
      reviewOn: row.review_on,
      proposedClassification: row.proposed_classification_id
        ? (classificationNames.get(row.proposed_classification_id) ?? null)
        : null,
    })),
  };
}

export default async function MemberDetailPage({
  params,
}: PageProps<"/members/[membershipId]">) {
  const { membershipId } = await params;
  const member = await getMemberDetail(membershipId);
  if (!member) notFound();
  const options = member.disciplines.map((discipline) => ({
    id: discipline.id,
    name: discipline.name,
    classifications: discipline.classifications.map(({ id, name }) => ({
      id,
      name,
    })),
  }));
  const currentByDiscipline = new Map(
    member.history
      .filter((item) => !item.endedOn)
      .map((item) => [item.disciplineId, item]),
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/members"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#66716b] hover:text-[#17201c]"
        >
          <ArrowLeft size={16} /> Members
        </Link>
        <div className="mt-4 flex flex-col gap-4 border-b border-[#dfe4e1] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#e7ebe8] text-sm font-black text-[#435149]">
              {member.name
                .split(" ")
                .map((part) => part[0])
                .join("")}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold sm:text-3xl">
                  {member.name}
                </h1>
                <StatusPill status={member.status} />
              </div>
              <p className="mt-2 font-mono text-xs text-[#66716b]">
                {member.memberNumber}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <AssignClassificationDialog
              membershipId={member.id}
              disciplines={options}
              enabled={member.canEdit}
            />
          </div>
        </div>
      </div>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="flex items-center gap-3 rounded-md border border-[#dfe4e1] bg-white p-4">
          <Mail size={17} className="text-[#758078]" />
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase text-[#8a938e]">
              Email
            </p>
            <p className="truncate text-sm font-semibold">{member.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-[#dfe4e1] bg-white p-4">
          <Phone size={17} className="text-[#758078]" />
          <div>
            <p className="text-[10px] font-bold uppercase text-[#8a938e]">
              Phone
            </p>
            <p className="text-sm font-semibold">{member.phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-[#dfe4e1] bg-white p-4">
          <CalendarClock size={17} className="text-[#758078]" />
          <div>
            <p className="text-[10px] font-bold uppercase text-[#8a938e]">
              Joined
            </p>
            <p className="text-sm font-semibold">
              {formatDate(member.joinedOn)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-[#dfe4e1] bg-white p-4">
          <CalendarDays size={17} className="shrink-0 text-[#758078]" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase text-[#8a938e]">
              Birth date
            </p>
            {member.canEdit ? (
              <form action={updateMemberBirthDate} className="mt-1 flex gap-2">
                <input type="hidden" name="membershipId" value={member.id} />
                <input
                  name="birthDate"
                  type="date"
                  defaultValue={member.birthDate ?? ""}
                  aria-label="Birth date"
                  className="h-8 min-w-0 flex-1 rounded-md border border-[#ccd4d0] px-2 text-xs outline-none focus:border-[var(--brand-accent)]"
                />
                <button className="h-8 rounded-md border border-[#ccd4d0] px-2 text-xs font-bold">
                  Save
                </button>
              </form>
            ) : (
              <p className="text-sm font-semibold">
                {formatDate(member.birthDate)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-md border border-[#dfe4e1] bg-white p-4">
          <UsersRound size={17} className="shrink-0 text-[#758078]" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase text-[#8a938e]">
              Competition gender
            </p>
            {member.canEdit ? (
              <form
                action={updateMemberCompetitionGender}
                className="mt-1 flex gap-2"
              >
                <input type="hidden" name="membershipId" value={member.id} />
                <select
                  name="competitionGender"
                  defaultValue={member.competitionGender ?? ""}
                  aria-label="Competition gender"
                  className="h-8 min-w-0 flex-1 rounded-md border border-[#ccd4d0] bg-white px-2 text-xs outline-none focus:border-[var(--brand-accent)]"
                  required
                >
                  <option value="" disabled>
                    Select
                  </option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
                <button className="h-8 rounded-md border border-[#ccd4d0] px-2 text-xs font-bold">
                  Save
                </button>
              </form>
            ) : (
              <p className="text-sm font-semibold">
                {member.competitionGender === "female"
                  ? "Female"
                  : member.competitionGender === "male"
                    ? "Male"
                    : "Not set"}
              </p>
            )}
          </div>
        </div>
      </section>
      {member.reviews.length ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold">Open reviews</h2>
            <p className="mt-1 text-sm text-[#66716b]">
              Decisions waiting for producer action.
            </p>
          </div>
          {member.reviews.map((review) => (
            <article
              key={review.id}
              className="flex flex-col gap-4 rounded-md border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center"
            >
              <CircleAlert size={20} className="shrink-0 text-amber-700" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{review.discipline} review</p>
                <p className="mt-1 text-sm text-amber-900">
                  {review.reason}
                  {review.proposedClassification
                    ? ` · Proposed ${review.proposedClassification}`
                    : ""}
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  Review date {formatDate(review.reviewOn)}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={dismissClassificationReview}>
                  <input type="hidden" name="membershipId" value={member.id} />
                  <input type="hidden" name="reviewId" value={review.id} />
                  <button
                    disabled={!member.canEdit}
                    className="h-9 rounded-md border border-amber-300 bg-white px-3 text-xs font-semibold disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </form>
                <AssignClassificationDialog
                  membershipId={member.id}
                  disciplines={options}
                  enabled={member.canEdit}
                  reviewId={review.id}
                  defaultDisciplineId={review.disciplineId}
                  compact
                />
              </div>
            </article>
          ))}
        </section>
      ) : null}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-bold">Current classifications</h2>
          <p className="mt-1 text-sm text-[#66716b]">
            Each division is managed independently.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {member.disciplines.map((discipline) => {
            const current = currentByDiscipline.get(discipline.id);
            return (
              <article
                key={discipline.id}
                className="rounded-md border border-[#dfe4e1] bg-white p-5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase text-[#758078]">
                      {discipline.name}
                    </p>
                    <p className="mt-2 text-2xl font-bold">
                      {current?.classification ?? "Unclassified"}
                    </p>
                  </div>
                  <UserRound size={20} className="text-[#98a09b]" />
                </div>
                <div className="mt-4 border-t border-[#edf0ee] pt-3 text-xs">
                  <span className="text-[#758078]">
                    {current
                      ? `Since ${formatDate(current.effectiveOn)}`
                      : "No assignment"}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      <section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
        <header className="flex items-center gap-2 border-b border-[#e7ebe8] px-5 py-4">
          <History size={18} className="text-[var(--brand-accent-strong)]" />
          <div>
            <h2 className="font-bold">Classification history</h2>
            <p className="mt-1 text-xs text-[#758078]">
              A dated record of every assignment and move
            </p>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead className="bg-[#f7f8f7] text-[10px] font-bold uppercase text-[#758078]">
              <tr>
                <th className="px-5 py-3">Effective</th>
                <th className="px-5 py-3">Division</th>
                <th className="px-5 py-3">Classification</th>
                <th className="px-5 py-3">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf0ee]">
              {member.history.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-3 text-sm">
                    {formatDate(item.effectiveOn)}
                  </td>
                  <td className="px-5 py-3 text-sm text-[#66716b]">
                    {item.discipline}
                  </td>
                  <td className="px-5 py-3 text-sm font-bold">
                    {item.classification}
                  </td>
                  <td className="px-5 py-3 text-sm text-[#66716b]">
                    {item.reason}
                  </td>
                </tr>
              ))}
              {!member.history.length ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-5 py-8 text-center text-sm text-[#758078]"
                  >
                    No classification history yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
