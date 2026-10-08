import Link from "next/link";
import { EventBrowser } from "@/components/events/event-browser";
import { CalendarDays, MapPin, Users } from "lucide-react";
import {
  CreateRopingDialog,
  type RopingDraft,
} from "@/components/events/create-roping-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import {
  events as demoRopings,
  divisionTemplates as demoDivisions,
} from "@/data/demo";
import { getActiveProducer } from "@/lib/producers";
import {
  buildDuplicableRopingSummary,
  type RopingListRecord,
} from "@/lib/events/build-duplicate-draft";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

async function getRopingData() {
  if (!isSupabaseConfigured())
    return {
      events: demoRopings.map((roping) => ({
        ...roping,
        duplicationDraft: undefined as RopingDraft | undefined,
      })),
      divisions: demoDivisions.map((division) => ({
        id: division.id,
        name: division.name,
        disciplineId: division.name.startsWith("Breakaway")
          ? "preview-breakaway"
          : "preview-calf-roping",
        competitionFormat: division.competitionFormat ?? "standard",
        handicapRules: division.handicapRules ?? {},
        numberOfRuns: division.numberOfRuns ?? 1,
        cattleDrawEnabled: division.cattleDrawEnabled ?? false,
        divisionName: division.name.split(" · ")[0],
        fees: division.fees.map((fee) => ({
          id: fee.id,
          title: fee.title,
          amountCents: fee.amountCents,
          isRequired: fee.isRequired ?? true,
        })),
      })),
      incentiveClassifications: [
        {
          id: "00000000-0000-4000-8000-000000000101",
          disciplineId: "preview-breakaway",
          divisionName: "Breakaway",
          name: "Open",
          classificationNumber: 0,
          standaloneEnabled: true,
          handicapAdjustmentSeconds: 0,
        },
        {
          id: "00000000-0000-4000-8000-000000000102",
          disciplineId: "preview-breakaway",
          divisionName: "Breakaway",
          name: "11.5",
          classificationNumber: 11.5,
          standaloneEnabled: true,
          handicapAdjustmentSeconds: null,
        },
        {
          id: "00000000-0000-4000-8000-000000000103",
          disciplineId: "preview-breakaway",
          divisionName: "Breakaway",
          name: "10",
          classificationNumber: 10,
          standaloneEnabled: true,
          handicapAdjustmentSeconds: null,
        },
      ],
    };
  const producer = await getActiveProducer();
  if (!producer)
    return { events: [], divisions: [], incentiveClassifications: [] };
  const supabase = await createClient();
  const [
    { data: eventData, error: eventError },
    { data: divisionData, error: divisionError },
    { data: classificationData, error: classificationError },
    { data: eventFeeData, error: eventFeeError },
  ] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, title, slug, starts_at, ends_at, entries_open_at, entries_close_at, venue_name, address, venue_city, venue_state, venue_postal_code, arena_count, publication_state, is_public, status, result_status, event_ropings(id, roping_template_id, classification_id, competition_format, starts_at, scheduled_date, schedule_type, schedule_note, sort_order, main_round_count, cattle_draw_enabled, arena_name, incentive_enabled, male_eligibility_policy, male_youth_maximum_age, male_senior_minimum_age, male_classification_division_id, male_minimum_classification_number, event_roping_handicap_adjustments(classification_id, handicap_time_credit_seconds)), entries:roping_entries(id)",
      )
      .eq("producer_id", producer.id)
      .order("starts_at", { ascending: false }),
    supabase
      .from("roping_templates")
      .select(
        "id, name, division_id, competition_format, handicap_rules, main_round_count, cattle_draw_enabled, divisions(name), roping_template_fees(id, title, amount_cents, is_required)",
      )
      .eq("producer_id", producer.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("classifications")
      .select(
        "id, name, classification_number:rank, division_id, standalone_enabled, handicap_time_credit_seconds:handicap_adjustment_seconds, divisions!inner(name, sort_order)",
      )
      .eq("producer_id", producer.id)
      .eq("is_active", true)
      .order("rank", { ascending: false }),
    supabase
      .from("event_fees")
      .select("event_id, title, amount_cents")
      .eq("producer_id", producer.id)
      .is("event_roping_id", null),
  ]);
  if (eventError)
    throw new Error(`Unable to load events: ${eventError.message}`);
  if (divisionError)
    throw new Error(
      `Unable to load roping templates: ${divisionError.message}`,
    );
  if (classificationError)
    throw new Error(
      `Unable to load incentive classifications: ${classificationError.message}`,
    );
  if (eventFeeError)
    throw new Error(`Unable to load event charges: ${eventFeeError.message}`);
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: producer.timezone,
  });
  const handicapAdjustments = new Map(
    classificationData.map((classification) => [
      classification.id,
      classification.handicap_time_credit_seconds === null
        ? null
        : Number(classification.handicap_time_credit_seconds),
    ]),
  );
  const divisions = divisionData.map((division) => ({
    id: division.id,
    name: division.name,
    disciplineId: division.division_id,
    competitionFormat: division.competition_format,
    numberOfRuns: division.main_round_count,
    cattleDrawEnabled: division.cattle_draw_enabled,
    handicapRules: Object.fromEntries(
      (
        (division.handicap_rules ?? []) as Array<{
          classificationId: string;
        }>
      )
        .filter((rule) => handicapAdjustments.get(rule.classificationId) != null)
        .map((rule) => [
          rule.classificationId,
          handicapAdjustments.get(rule.classificationId)!,
        ]),
    ),
    divisionName:
      (division.divisions as unknown as { name: string } | null)?.name ??
      "Unassigned division",
    fees: (
      division.roping_template_fees as unknown as Array<{
        id: string;
        title: string;
        amount_cents: number;
        is_required: boolean;
      }>
    ).map((fee) => ({
      id: fee.id,
      title: fee.title,
      amountCents: fee.amount_cents,
      isRequired: fee.is_required,
    })),
  }));
  const incentiveClassifications = classificationData.map((classification) => ({
    id: classification.id,
    name: classification.name,
    disciplineId: classification.division_id,
    divisionName: (classification.divisions as unknown as { name: string })
      .name,
    classificationNumber: Number(classification.classification_number),
    standaloneEnabled: classification.standalone_enabled,
    handicapAdjustmentSeconds:
      classification.handicap_time_credit_seconds === null
        ? null
        : Number(classification.handicap_time_credit_seconds),
  }));
  const activeTemplateIds = new Set(divisions.map((division) => division.id));
  const activeClassificationIds = new Set(
    incentiveClassifications
      .filter((classification) => classification.standaloneEnabled)
      .map((classification) => classification.id),
  );
  const existingSlugs = new Set(eventData.map((event) => event.slug));
  const events = eventData.map((event) =>
    buildDuplicableRopingSummary({
      event: event as unknown as RopingListRecord,
      eventFees: eventFeeData ?? [],
      activeTemplateIds,
      activeClassificationIds,
      existingSlugs,
      timeZone: producer.timezone,
      dateFormatter,
    }),
  );
  return { events, divisions, incentiveClassifications };
}

export default async function RopingsPage() {
  const configured = isSupabaseConfigured();
  const { events, divisions, incentiveClassifications } =
    await getRopingData();
  return (
    <div className="space-y-6">
      <PageHeader
        title="Ropings"
        description="Schedule events, open entries, prepare draws, and manage results from one place."
        actions={
          <CreateRopingDialog
            configured={configured}
            divisions={divisions}
            incentiveClassifications={incentiveClassifications}
          />
        }
      />
      <EventBrowser events={events} rows={events.map((roping) => (
          <article
            key={roping.id}
            className="rounded-md border border-[#dfe4e1] bg-white p-5"
          >
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-md bg-[#f0f2f1] text-center">
                <span className="text-[10px] font-bold uppercase text-[#7b857f]">
                  {roping.date.split(" ")[0]}
                </span>
                <span className="-mt-3 text-2xl font-bold">
                  {roping.date.split(" ")[1].replace(",", "")}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-bold">{roping.title}</h2>
                  <StatusPill status={roping.status} />
                  <span className="rounded-md bg-[#eef1ef] px-2 py-1 text-xs font-semibold capitalize text-[#59645e]">
                    {roping.publicationState ?? "draft"}
                  </span>
                  {roping.resultStatus ? (
                    <span className="text-xs font-semibold text-[#758078]">
                      Results: {roping.resultStatus}
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#66716b]">
                  <span className="flex items-center gap-1.5">
                    <CalendarDays size={15} />
                    {roping.date}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin size={15} />
                    {roping.location}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users size={15} />
                    {roping.entries} entries · {roping.divisions} scheduled
                    ropings
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {roping.duplicationDraft ? (
                  <CreateRopingDialog
                    configured={configured}
                    divisions={divisions}
                    incentiveClassifications={incentiveClassifications}
                    initialValues={roping.duplicationDraft}
                  />
                ) : null}
                <Link
                  href={
                    roping.status === "in_progress" && !configured
                      ? "/events/current"
                      : `/events/${roping.id}`
                  }
                  className="flex h-10 items-center rounded-md border border-[#d7ddda] px-4 text-sm font-semibold hover:bg-[#f7f8f7]"
                >
                  {roping.status === "in_progress"
                    ? "Manage live"
                    : roping.status === "completed"
                      ? "View results"
                      : "Manage event"}
                </Link>
              </div>
            </div>
          </article>
        ))} />
    </div>
  );
}
