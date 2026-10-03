import Link from "next/link";
import { AlertTriangle, Check, CircleHelp, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RopingSetupTabs } from "@/components/settings/roping-setup-tabs";
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
  genderPolicy: "open" | "women_only";
  maleYouthMaximumAge: number | null;
  maleSeniorMinimumAge: number | null;
  maleClassificationDisciplineId: string | null;
  maleMinimumClassificationNumber: number | null;
  classifications: Array<{
    id: string;
    name: string;
    description: string;
    rank: number;
    eligibilityType: "skill" | "open" | "age";
    minimumAge: number | null;
    maximumAge: number | null;
    standaloneEnabled: boolean;
    handicapAdjustmentSeconds: number | null;
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
          genderPolicy: "open",
          maleYouthMaximumAge: null,
          maleSeniorMinimumAge: null,
          maleClassificationDisciplineId: null,
          maleMinimumClassificationNumber: null,
          classifications: [
            {
              id: "open",
              name: "Open",
              description: "Open to eligible contestants",
              rank: 0,
              eligibilityType: "open",
              minimumAge: null,
              maximumAge: null,
              standaloneEnabled: true,
              handicapAdjustmentSeconds: null,
              isActive: true,
            },
            {
              id: "115",
              name: "11.5",
              description: "",
              rank: 11.5,
              eligibilityType: "skill",
              minimumAge: null,
              maximumAge: null,
              standaloneEnabled: true,
              handicapAdjustmentSeconds: null,
              isActive: true,
            },
            {
              id: "11",
              name: "11",
              description: "",
              rank: 11,
              eligibilityType: "skill",
              minimumAge: null,
              maximumAge: null,
              standaloneEnabled: true,
              handicapAdjustmentSeconds: null,
              isActive: true,
            },
            {
              id: "10",
              name: "10",
              description: "",
              rank: 10,
              eligibilityType: "skill",
              minimumAge: null,
              maximumAge: null,
              standaloneEnabled: true,
              handicapAdjustmentSeconds: null,
              isActive: true,
            },
            {
              id: "40-plus",
              name: "40+",
              description: "Age-limited classification",
              rank: 0,
              eligibilityType: "age",
              minimumAge: 40,
              maximumAge: null,
              standaloneEnabled: true,
              handicapAdjustmentSeconds: null,
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
          "id, name, description, watch_threshold, is_active, gender_policy, male_youth_maximum_age, male_senior_minimum_age, male_classification_discipline_id, male_minimum_classification_number, classifications(id, name, description, rank, eligibility_type, minimum_age, maximum_age, standalone_enabled, handicap_adjustment_seconds, is_active)",
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
      genderPolicy: discipline.gender_policy as "open" | "women_only",
      maleYouthMaximumAge: discipline.male_youth_maximum_age,
      maleSeniorMinimumAge: discipline.male_senior_minimum_age,
      maleClassificationDisciplineId:
        discipline.male_classification_discipline_id,
      maleMinimumClassificationNumber:
        discipline.male_minimum_classification_number,
      classifications: (
        discipline.classifications as unknown as Array<{
          id: string;
          name: string;
          description: string;
          rank: number;
          eligibility_type: "skill" | "open" | "age";
          minimum_age: number | null;
          maximum_age: number | null;
          standalone_enabled: boolean;
          handicap_adjustment_seconds: number | null;
          is_active: boolean;
        }>
      )
        .map((classification) => ({
          id: classification.id,
          name: classification.name,
          description: classification.description ?? "",
          rank: classification.rank,
          eligibilityType: classification.eligibility_type,
          minimumAge: classification.minimum_age,
          maximumAge: classification.maximum_age,
          standaloneEnabled: classification.standalone_enabled,
          handicapAdjustmentSeconds:
            classification.handicap_adjustment_seconds === null
              ? null
              : -Number(classification.handicap_adjustment_seconds),
          isActive: classification.is_active,
        }))
        .sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name)),
    })),
  };
}

export default async function ClassificationSettingsPage() {
  const data = await getClassificationData();
  const enabled = isSupabaseConfigured() && data.role !== "viewer";
  const classificationDivisions = data.disciplines.map((discipline) => ({
    id: discipline.id,
    name: discipline.name,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organization setup"
        title="Divisions & classifications"
        description="Define member classifications and choose whether each supports standalone ropings, Handicap time adjustments, or both."
        actions={
          <CreateDisciplineDialog
            classificationDivisions={classificationDivisions}
            enabled={enabled}
          />
        }
      />
      <RopingSetupTabs active="classifications" />
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
                {discipline.genderPolicy === "women_only" ? (
                  <p className="mt-2 text-xs font-semibold text-[#66716b]">
                    Women only
                    {discipline.maleYouthMaximumAge !== null
                      ? ` · Boys ${discipline.maleYouthMaximumAge} and under`
                      : ""}
                    {discipline.maleSeniorMinimumAge !== null
                      ? ` · Men ${discipline.maleSeniorMinimumAge} and over`
                      : ""}
                    {discipline.maleClassificationDisciplineId &&
                    discipline.maleMinimumClassificationNumber !== null
                      ? ` · ${data.disciplines.find((item) => item.id === discipline.maleClassificationDisciplineId)?.name ?? "Number"} ${discipline.maleMinimumClassificationNumber}+`
                      : ""}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <CreateClassificationDialog
                  disciplineId={discipline.id}
                  disciplineName={discipline.name}
                  enabled={enabled}
                />
                <EditDisciplineDialog
                  discipline={discipline}
                  classificationDivisions={classificationDivisions}
                  enabled={enabled}
                />
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left">
                <thead className="bg-[#f7f8f7] text-[10px] font-bold uppercase text-[#758078]">
                  <tr>
                    <th className="px-5 py-3">Classification</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">Eligibility</th>
                    <th className="px-5 py-3">Roping use</th>
                    <th className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        Classification number
                        <span
                          className="group relative inline-flex normal-case text-[#758078]"
                          tabIndex={0}
                          aria-label="Numbered skill classes use their contestant classification number. Open and age-based classes use 0."
                        >
                          <CircleHelp size={14} aria-hidden="true" />
                          <span
                            role="tooltip"
                            className="pointer-events-none absolute bottom-full right-0 z-10 mb-2 hidden w-64 rounded-md bg-[#17201b] px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-lg group-hover:block group-focus:block"
                          >
                            Numbered skill classes use their contestant
                            classification number. Open and age-based classes
                            use 0.
                          </span>
                        </span>
                      </span>
                    </th>
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
                      <td className="px-5 py-3 text-xs font-semibold text-[#66716b]">
                        {classification.eligibilityType === "open"
                          ? "Open to anyone"
                          : classification.eligibilityType === "age"
                            ? classification.minimumAge !== null &&
                              classification.maximumAge !== null
                              ? `Ages ${classification.minimumAge}-${classification.maximumAge}`
                              : classification.minimumAge !== null
                                ? `${classification.minimumAge} and over`
                                : `${classification.maximumAge} and under`
                            : "Skill level"}
                      </td>
                      <td className="px-5 py-3 text-xs font-semibold text-[#66716b]">
                        {classification.standaloneEnabled
                          ? classification.handicapAdjustmentSeconds !== null
                            ? "Standalone and Handicap"
                            : "Standalone"
                          : "Handicap Time Offset"}
                        {classification.handicapAdjustmentSeconds !== null ? (
                          <span className="mt-1 block font-mono font-normal text-[#758078]">
                            {classification.handicapAdjustmentSeconds >= 0
                              ? "+"
                              : ""}
                            {classification.handicapAdjustmentSeconds.toFixed(
                              3,
                            )}{" "}
                            sec
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-[#66716b]">
                        {classification.eligibilityType === "skill"
                          ? classification.rank
                          : 0}
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
                        colSpan={7}
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
