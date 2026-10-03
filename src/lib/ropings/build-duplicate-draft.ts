import type { RopingDraft } from "@/components/ropings/create-roping-dialog";
import type { ResultStatus, RopingStatus, RopingSummary } from "@/types/domain";

interface ScheduledRopingRecord {
  id: string;
  source_template_id: string | null;
  classification_id: string | null;
  competition_format: "standard" | "handicap" | "four_d";
  starts_at: string | null;
  scheduled_date: string;
  schedule_type: "fixed" | "tentative" | "follows_previous";
  schedule_note: string | null;
  sort_order: number;
  arena_name: string | null;
  incentive_enabled: boolean;
  male_eligibility_policy: import("@/components/ropings/scheduled-class-fields").MaleEligibilityPolicy;
  male_youth_maximum_age: number | null;
  male_senior_minimum_age: number | null;
  male_classification_discipline_id: string | null;
  male_minimum_classification_number: number | null;
  roping_incentive_rules: Array<{
    classification_id: string;
    adjustment_seconds: number;
  }>;
}

export interface RopingListRecord {
  id: string;
  title: string;
  slug: string;
  starts_at: string;
  ends_at: string | null;
  entries_open_at: string | null;
  entries_close_at: string | null;
  venue_name: string | null;
  address: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_postal_code: string | null;
  arena_count: number;
  publication_state: "draft" | "published" | "unpublished";
  is_public: boolean;
  status: string;
  result_status: string;
  roping_divisions: ScheduledRopingRecord[];
  entries: unknown[];
}

export interface EventFeeRecord {
  roping_id: string;
  title: string;
  amount_cents: number;
}

export type DuplicableRopingSummary = RopingSummary & {
  duplicationDraft?: RopingDraft;
};

function toLocalDateTimeInput(value: string | null, timeZone: string) {
  if (!value) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function nextCopySlug(sourceSlug: string, existingSlugs: Set<string>) {
  const base = `${sourceSlug}-copy`;
  let candidate = base;
  let copyNumber = 2;
  while (existingSlugs.has(candidate)) {
    candidate = `${base}-${copyNumber}`;
    copyNumber += 1;
  }
  return candidate;
}

export function buildDuplicableRopingSummary({
  event,
  eventFees,
  activeTemplateIds,
  activeClassificationIds,
  existingSlugs,
  timeZone,
  dateFormatter,
}: {
  event: RopingListRecord;
  eventFees: EventFeeRecord[];
  activeTemplateIds: Set<string>;
  activeClassificationIds: Set<string>;
  existingSlugs: Set<string>;
  timeZone: string;
  dateFormatter: Intl.DateTimeFormat;
}): DuplicableRopingSummary {
  const scheduledRopings = [...event.roping_divisions].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  const canDuplicate =
    scheduledRopings.length > 0 &&
    scheduledRopings.every(
      (scheduled) =>
        scheduled.source_template_id &&
        activeTemplateIds.has(scheduled.source_template_id) &&
        (scheduled.competition_format === "handicap" ||
          (scheduled.classification_id &&
            activeClassificationIds.has(scheduled.classification_id))),
    );
  const eventFee = eventFees.find((fee) => fee.roping_id === event.id);
  const duplicationDraft: RopingDraft | undefined = canDuplicate
    ? {
        sourceTitle: event.title,
        title: `${event.title} Copy`,
        slug: nextCopySlug(event.slug, existingSlugs),
        venueName: event.venue_name ?? "",
        address: event.address ?? "",
        city: event.venue_city ?? "",
        state: event.venue_state ?? "",
        postalCode: event.venue_postal_code ?? "",
        arenaCount: event.arena_count,
        startsAt: toLocalDateTimeInput(event.starts_at, timeZone),
        endsAt: toLocalDateTimeInput(event.ends_at, timeZone),
        entriesOpenAt: toLocalDateTimeInput(event.entries_open_at, timeZone),
        entriesCloseAt: toLocalDateTimeInput(event.entries_close_at, timeZone),
        publicationState: "draft",
        eventFeeTitle: eventFee?.title ?? "",
        eventFeeAmount: eventFee
          ? (eventFee.amount_cents / 100).toFixed(2)
          : "",
        occurrences: scheduledRopings.map((scheduled) => ({
          templateId: scheduled.source_template_id!,
          classificationId: scheduled.classification_id ?? "",
          scheduledDate: scheduled.scheduled_date,
          scheduleType: scheduled.schedule_type,
          startTime: scheduled.starts_at
            ? toLocalDateTimeInput(scheduled.starts_at, timeZone).slice(11)
            : "",
          scheduleNote: scheduled.schedule_note ?? "",
          arenaName: scheduled.arena_name ?? "Arena 1",
          incentiveEnabled: scheduled.incentive_enabled,
          incentiveRules: Object.fromEntries(
            scheduled.roping_incentive_rules.map((rule) => [
              rule.classification_id,
              String(-Number(rule.adjustment_seconds)),
            ]),
          ),
          maleEligibilityPolicy: scheduled.male_eligibility_policy,
          maleYouthMaximumAge:
            scheduled.male_youth_maximum_age?.toString() ?? "",
          maleSeniorMinimumAge:
            scheduled.male_senior_minimum_age?.toString() ?? "",
          maleClassificationDisciplineId:
            scheduled.male_classification_discipline_id ?? "",
          maleMinimumClassificationNumber:
            scheduled.male_minimum_classification_number?.toString() ?? "",
        })),
      }
    : undefined;

  return {
    id: event.id,
    title: event.title,
    date: dateFormatter.format(new Date(event.starts_at)),
    location:
      [event.venue_name, event.venue_city, event.venue_state]
        .filter(Boolean)
        .join(", ") || "Location pending",
    divisions: scheduledRopings.length,
    entries: event.entries.length,
    status: event.status as RopingStatus,
    resultStatus: event.result_status as ResultStatus,
    publicationState: event.publication_state,
    duplicationDraft,
  };
}
