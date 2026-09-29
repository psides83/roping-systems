import Link from "next/link";
import { AlertTriangle, Check, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  CreateClassificationDialog,
  CreateDisciplineDialog,
  EditClassificationDialog,
  EditDisciplineDialog,
} from "@/components/settings/classification-dialogs";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

interface DisciplineSummary {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
  classifications: Array<{
    id: string;
    name: string;
    description: string;
    rank: number;
    isActive: boolean;
  }>;
}

async function getClassificationData() {
  if (!isSupabaseConfigured())
    return {
      role: "owner",
      openReviews: 1,
      reviews: [
        {
          id: "review-2",
          membershipId: "2",
          memberName: "Mason Cole",
          memberNumber: "RR-1168",
          discipline: "Calf roping",
          reason: "Annual classification review",
          reviewOn: "2026-10-01",
        },
      ],
      disciplines: [
        {
          id: "calf-roping",
          name: "Calf roping",
          description: "Timed calf roping division",
          isActive: true,
          classifications: [
            {
              id: "open",
              name: "Open",
              description: "Open to eligible contestants",
              rank: 200,
              isActive: true,
            },
            {
              id: "115",
              name: "11.5",
              description: "",
              rank: 115,
              isActive: true,
            },
            {
              id: "11",
              name: "11",
              description: "",
              rank: 110,
              isActive: true,
            },
            {
              id: "10",
              name: "10",
              description: "",
              rank: 100,
              isActive: true,
            },
            {
              id: "40-plus",
              name: "40+",
              description: "Age-limited classification",
              rank: 40,
              isActive: true,
            },
          ],
        },
      ] satisfies DisciplineSummary[],
    };
  const organization = await getActiveOrganization();
  if (!organization)
    return {
      role: "viewer",
      openReviews: 0,
      reviews: [],
      disciplines: [] as DisciplineSummary[],
    };
  const supabase = await createClient();
  const [{ data, error }, { data: reviews, count, error: reviewsError }] =
    await Promise.all([
      supabase
        .from("disciplines")
        .select(
          "id, name, description, watch_threshold, is_active, classifications(id, name, description, rank, is_active)",
        )
        .eq("organization_id", organization.id)
        .order("sort_order")
        .order("created_at"),
      supabase
        .from("classification_reviews")
        .select(
          "id, membership_id, reason, review_on, disciplines!inner(name), organization_memberships!inner(member_number, people!inner(first_name, last_name))",
          { count: "exact" },
        )
        .eq("organization_id", organization.id)
        .eq("status", "open")
        .order("review_on")
        .limit(12),
    ]);
  if (error)
    throw new Error(`Unable to load classifications: ${error.message}`);
  if (reviewsError)
    throw new Error(
      `Unable to load classification reviews: ${reviewsError.message}`,
    );
  return {
    role: organization.role,
    openReviews: count ?? 0,
    reviews: (reviews ?? []).map((review) => {
      const membership = review.organization_memberships as unknown as {
        member_number: string;
        people: { first_name: string; last_name: string };
      };
      const discipline = review.disciplines as unknown as { name: string };
      return {
        id: review.id,
        membershipId: review.membership_id,
        memberName:
          `${membership.people.first_name} ${membership.people.last_name}`.trim(),
        memberNumber: membership.member_number,
        discipline: discipline.name,
        reason: review.reason,
        reviewOn: review.review_on,
      };
    }),
    disciplines: data.map((discipline) => ({
      id: discipline.id,
      name: discipline.name,
      description: discipline.description ?? "",
      isActive: discipline.is_active,
      classifications: (
        discipline.classifications as unknown as DisciplineSummary["classifications"]
      ).sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name)),
    })),
  };
}

export default async function ClassificationSettingsPage() {
  const data = await getClassificationData();
  const enabled = isSupabaseConfigured() && data.role !== "viewer";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organization setup"
        title="Divisions & classifications"
        description="Create divisions such as Calf roping or Breakaway, then define each division’s skill, open, and age-limited classifications."
        actions={<CreateDisciplineDialog enabled={enabled} />}
      />
      <div className="flex gap-1 overflow-x-auto border-b border-[#d7ddda]">
        <Link
          href="/settings/classifications"
          className="border-b-2 border-[var(--brand-accent)] px-4 py-3 text-sm font-bold text-[#17201c]"
        >
          Divisions & classifications
        </Link>
        <Link
          href="/settings/divisions"
          className="px-4 py-3 text-sm font-semibold text-[#66716b]"
        >
          Event templates
        </Link>
        <Link
          href="/settings/payouts"
          className="px-4 py-3 text-sm font-semibold text-[#66716b]"
        >
          Payouts
        </Link>
      </div>
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-md border border-[#dfe4e1] bg-white p-4">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-amber-50 text-amber-700">
            <AlertTriangle size={19} />
          </span>
          <div>
            <p className="text-2xl font-bold">{data.openReviews}</p>
            <p className="text-xs font-semibold text-[#758078]">
              Open classification reviews
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-md border border-[#dfe4e1] bg-white p-4">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-[#eef1ef] text-[#435149]">
            <ListChecks size={19} />
          </span>
          <div>
            <p className="text-2xl font-bold">{data.disciplines.length}</p>
            <p className="text-xs font-semibold text-[#758078]">
              Configured divisions
            </p>
          </div>
        </div>
      </section>
      {data.reviews.length ? (
        <section className="overflow-hidden rounded-md border border-amber-200 bg-white">
          <header className="border-b border-amber-100 bg-amber-50 px-5 py-4">
            <h2 className="font-bold text-amber-950">Review queue</h2>
            <p className="mt-1 text-xs text-amber-800">
              Members who need a classification decision
            </p>
          </header>
          <div className="divide-y divide-[#edf0ee]">
            {data.reviews.map((review) => (
              <Link
                key={review.id}
                href={`/members/${review.membershipId}`}
                className="flex flex-col gap-2 px-5 py-4 hover:bg-[#fafbfa] sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">
                    {review.memberName}{" "}
                    <span className="font-mono text-xs font-normal text-[#758078]">
                      {review.memberNumber}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-[#66716b]">
                    {review.discipline} · {review.reason}
                  </p>
                </div>
                <span className="text-xs font-semibold text-[var(--brand-accent-strong)]">
                  Review member
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      <section className="space-y-4">
        {data.disciplines.map((discipline) => (
          <article
            key={discipline.id}
            className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white"
          >
            <header className="flex flex-col gap-3 border-b border-[#e7ebe8] p-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-bold">{discipline.name}</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    <Check size={12} />{" "}
                    {discipline.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#66716b]">
                  {discipline.description || "No description"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <CreateClassificationDialog
                  disciplineId={discipline.id}
                  disciplineName={discipline.name}
                  enabled={enabled}
                />
                <EditDisciplineDialog
                  discipline={discipline}
                  enabled={enabled}
                />
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead className="bg-[#f7f8f7] text-[10px] font-bold uppercase text-[#758078]">
                  <tr>
                    <th className="px-5 py-3">Classification</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">Rank</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="w-12 px-5 py-3">
                      <span className="sr-only">Edit</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0ee]">
                  {discipline.classifications.map((classification) => (
                    <tr key={classification.id}>
                      <td className="px-5 py-3 text-sm font-bold">
                        {classification.name}
                      </td>
                      <td className="px-5 py-3 text-sm text-[#66716b]">
                        {classification.description || "-"}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-[#66716b]">
                        {classification.rank}
                      </td>
                      <td className="px-5 py-3 text-xs font-semibold text-[#66716b]">
                        {classification.isActive ? "Active" : "Inactive"}
                      </td>
                      <td className="px-5 py-3">
                        <EditClassificationDialog
                          disciplineId={discipline.id}
                          classification={classification}
                          enabled={enabled}
                        />
                      </td>
                    </tr>
                  ))}
                  {!discipline.classifications.length ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-7 text-center text-sm text-[#758078]"
                      >
                        Add this division&apos;s first classification.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
        ))}
        {!data.disciplines.length ? (
          <div className="rounded-md border border-dashed border-[#cbd2ce] bg-white p-10 text-center">
            <p className="font-semibold">Create the first division</p>
            <p className="mt-2 text-sm text-[#758078]">
              Most organizations begin with Calf roping and add Breakaway when
              needed.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
