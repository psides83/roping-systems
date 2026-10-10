import { EventWorkflowNav } from "@/components/events/event-workflow-nav";
import { RopingWaitlists } from "@/components/events/roping-waitlist";
import { notFound } from "next/navigation";
import {
  Banknote,
  CircleDollarSign,
  ClipboardCheck,
  Users,
} from "lucide-react";
import { EntryFormDialog } from "@/components/events/entry-form-dialog";
import { getProducerFeatures } from "@/lib/producer-features-server";
import { featureEnabled } from "@/lib/producer-features";
import {
  EntryLedger,
  type LedgerContestant,
} from "@/components/events/entry-ledger";
import { OnlineEntryRequestList } from "@/components/events/online-entry-request-list";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatPhoneNumber } from "@/lib/utils";
import { calculateEntryBalance } from "@/lib/entry-balance";

type PaymentStatus = "unpaid" | "paid_cash" | "comped" | "refunded";

export default async function EventEntriesPage({
  params,
}: PageProps<"/events/[eventId]/entries">) {
  const { eventId } = await params;
  if (!isSupabaseConfigured()) {
    return (
      <EntriesWorkspace
        eventId={eventId}
        title="Fall Classic"
        divisions={[
          {
            id: "calf-open",
            name: "Calf roping · Open",
            allowGuests: true,
            options: [],
          },
          {
            id: "calf-115",
            name: "Calf roping · 11.5",
            allowGuests: true,
            options: [],
          },
          {
            id: "breakaway-open",
            name: "Breakaway · Open",
            allowGuests: false,
            options: [],
          },
        ]}
        ropers={[]}
        contestants={[
          {
            personId: "preview-jace",
            name: "Jace Holloway",
            memberNumber: "RR-1042",
            paymentStatus: "unpaid",
            totalCents: 11500,
            amountPaidCents: 0,
            balanceDueCents: 11500,
            payments: [],
            checkedIn: false,
            checkedInAt: null,
            entries: [
              {
                id: "jace-1",
                divisionId: "calf-open",
                division: "Calf roping · Open",
                entryNumber: 1,
                source: "online",
                paymentStatus: "unpaid",
                incentiveAdjustment: 0,
                transferNote: null,
                eligibilityOverridden: false,
                eligibilityIssue: null,
                eligibilityOverrideReason: null,
                options: [],
                competitionStatus: "active",
                withdrawalReason: null,
              },
              {
                id: "jace-2",
                divisionId: "calf-115",
                division: "Calf roping · 11.5",
                entryNumber: 1,
                source: "office",
                paymentStatus: "unpaid",
                incentiveAdjustment: 0,
                transferNote: null,
                eligibilityOverridden: false,
                eligibilityIssue: null,
                eligibilityOverrideReason: null,
                options: [],
                competitionStatus: "active",
                withdrawalReason: null,
              },
            ],
            charges: [
              {
                id: "jace-entry-1",
                entryId: "jace-1",
                title: "Open entry fee",
                amountCents: 5000,
                waived: false,
                waiverReason: null,
              },
              {
                id: "jace-stock-1",
                entryId: "jace-1",
                title: "Stock fee",
                amountCents: 1000,
                waived: false,
                waiverReason: null,
              },
              {
                id: "jace-entry-2",
                entryId: "jace-2",
                title: "11.5 entry fee",
                amountCents: 5000,
                waived: false,
                waiverReason: null,
              },
              {
                id: "jace-office",
                entryId: null,
                title: "Office fee",
                amountCents: 500,
                waived: false,
                waiverReason: null,
              },
            ],
          },
          {
            personId: "preview-mara",
            name: "Mara Bennett",
            memberNumber: "RR-1088",
            paymentStatus: "paid_cash",
            totalCents: 3500,
            amountPaidCents: 3500,
            balanceDueCents: 0,
            payments: [],
            checkedIn: true,
            checkedInAt: "8:42 AM",
            entries: [
              {
                id: "mara-1",
                divisionId: "breakaway-open",
                division: "Breakaway · Open",
                entryNumber: 1,
                source: "office",
                paymentStatus: "paid_cash",
                incentiveAdjustment: 1.5,
                transferNote: "Moved from Breakaway · 11.5",
                eligibilityOverridden: true,
                eligibilityIssue:
                  "Contestant classification is below this class",
                eligibilityOverrideReason: "Approved by event director",
                options: [],
                competitionStatus: "active",
                withdrawalReason: null,
              },
            ],
            charges: [
              {
                id: "mara-entry",
                entryId: "mara-1",
                title: "Entry fee",
                amountCents: 3000,
                waived: false,
                waiverReason: null,
              },
              {
                id: "mara-office",
                entryId: null,
                title: "Office fee",
                amountCents: 500,
                waived: false,
                waiverReason: null,
              },
            ],
          },
        ]}
        requests={[]}
        totalEntries={3}
        canEdit={false}
      />
    );
  }
  const producer = await getActiveProducer();
  if (!producer) notFound();
  const requireMemberships = featureEnabled(await getProducerFeatures(producer.id), "require_memberships");
  const supabase = await createClient();
  const [
    { data: roping },
    { data: membershipData },
    { data: entryData, error: entryError },
    { data: chargeData, error: chargeError },
    { data: requestData, error: requestError },
    { data: transferData, error: transferError },
    { data: withdrawalData, error: withdrawalError },
    { data: checkInData, error: checkInError },
    { data: paymentData, error: paymentError },
  ] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, title, status, event_ropings(id, name, scheduled_date, schedule_type, starts_at, allow_non_members, sort_order, event_fees(id, title, amount_cents, kind, scope, is_required))",
      )
      .eq("id", eventId)
      .eq("producer_id", producer.id)
      .single(),
    supabase
      .from("memberships")
      .select("member_number, ropers!inner(id, first_name, last_name, phone)")
      .eq("producer_id", producer.id)
      .order("member_number"),
    supabase
      .from("roping_entries")
      .select(
        "id, entry_number, source, payment_status, competition_status, roper_id, handicap_time_credit_seconds, eligibility_overridden, eligibility_note, eligibility_override_reason, event_ropings!inner(id, name, scheduled_date), ropers!inner(first_name, last_name, email, phone)",
      )
      .eq("event_id", eventId)
      .order("entered_at", { ascending: false }),
    supabase
      .from("entry_charges")
      .select(
        "id, roper_id, entry_id, event_fee_id, title, amount_cents, waived_at, waiver_reason",
      )
      .eq("event_id", eventId)
      .order("created_at"),
    supabase
      .from("online_entry_submissions")
      .select(
        "id, revision, first_name, last_name, email, phone, birth_date, competition_gender, member_number, membership_id, requested_membership_id, contestant_note, created_at, online_entry_submission_ropings(quantity, event_ropings!inner(name, scheduled_date))",
      )
      .eq("event_id", eventId)
      .eq("status", "pending")
      .order("created_at"),
    supabase
      .from("entry_roping_transfers")
      .select("entry_id, source_event_roping_id, reason, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    supabase
      .from("entry_withdrawals")
      .select("entry_id, reason, financial_action, withdrawn_at")
      .eq("event_id", eventId)
      .is("reinstated_at", null),
    supabase
      .from("event_check_ins")
      .select("roper_id, checked_in_at, checked_in_by")
      .eq("event_id", eventId),
    supabase
      .from("event_payments")
      .select(
        "id, roper_id, amount_cents, note, received_by_label, received_at, voided_at, void_reason, voided_by_label",
      )
      .eq("event_id", eventId)
      .order("received_at", { ascending: false }),
  ]);
  if (!roping) notFound();
  const loadError =
    entryError ??
    chargeError ??
    requestError ??
    transferError ??
    withdrawalError ??
    checkInError ??
    paymentError;
  if (loadError)
    throw new Error(`Unable to load event entries: ${loadError.message}`);

  const officePermission = await supabase.rpc("can_enter_event", { target_event: eventId });
  const ageRequirements = officePermission.data ? await supabase.rpc("walk_up_age_requirements", { target_event: eventId }) : { data: [], error: null };
  if (ageRequirements.error) throw new Error("Unable to load age eligibility requirements.");
  const ageRules = new Map((ageRequirements.data as Array<{ roping_id: string; age_required: boolean; male_age_required: boolean }>).map(row => [row.roping_id, row]));
  const divisions = (
    roping.event_ropings as unknown as Array<{
      id: string;
      name: string;
      scheduled_date: string;
      schedule_type: "fixed" | "tentative" | "follows_previous";
      starts_at: string | null;
      allow_non_members: boolean;
      sort_order: number;
      event_fees: Array<{
        id: string;
        title: string;
        amount_cents: number;
        kind: string;
        scope: string;
        is_required: boolean;
      }>;
    }>
  )
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((division) => ({
      id: division.id,
      name: `${division.name} · ${new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${division.scheduled_date}T12:00:00Z`))}`,
      allowGuests: division.allow_non_members,
      requiresBirthDate: ageRules.get(division.id)?.age_required ?? false,
      requiresMaleBirthDate: ageRules.get(division.id)?.male_age_required ?? false,
      options: division.event_fees
        .filter((fee) => !fee.is_required)
        .map((fee) => ({
          id: fee.id,
          title: fee.title,
          amountCents: fee.amount_cents,
          kind: fee.kind,
          scope: fee.scope,
        })),
    }));

  const memberNumbers = new Map<string, string>();
  const clearanceRows = await Promise.all(divisions.map(async division => {
    const { data, error } = await supabase.rpc("event_entry_competition_holds", { target_roping_id: division.id });
    if (error) throw new Error(`Unable to load competition clearance: ${error.message}`);
    return data as Array<{ entry_id: string; membership_id: string | null; hold_reason: string | null }>;
  }));
  const clearance = new Map(clearanceRows.flat().map(row => [row.entry_id, row]));
  const ropers = (membershipData ?? []).map((membership) => {
    const person = membership.ropers as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      phone: string | null;
    };
    memberNumbers.set(person.id, membership.member_number);
    return {
      id: person.id,
      name: `${person.first_name} ${person.last_name}`,
      memberNumber: membership.member_number,
      phone: person.phone,
    };
  });

  const chargesByPerson = new Map<string, LedgerContestant["charges"]>();
  for (const charge of chargeData ?? []) {
    const charges = chargesByPerson.get(charge.roper_id) ?? [];
    charges.push({
      id: charge.id,
      entryId: charge.entry_id,
      title: charge.title,
      amountCents: charge.amount_cents,
      waived: Boolean(charge.waived_at),
      waiverReason: charge.waiver_reason,
    });
    chargesByPerson.set(charge.roper_id, charges);
  }

  const divisionNames = new Map(
    divisions.map((division) => [division.id, division.name]),
  );
  const divisionOptions = new Map(
    divisions.map((division) => [division.id, division.options]),
  );
  const latestTransferByEntry = new Map<
    string,
    { sourceDivisionId: string; reason: string }
  >();
  for (const transfer of transferData ?? []) {
    if (!latestTransferByEntry.has(transfer.entry_id)) {
      latestTransferByEntry.set(transfer.entry_id, {
        sourceDivisionId: transfer.source_event_roping_id,
        reason: transfer.reason,
      });
    }
  }
  const activeWithdrawalByEntry = new Map(
    (withdrawalData ?? []).map((withdrawal) => [
      withdrawal.entry_id,
      withdrawal,
    ]),
  );
  const checkInByPerson = new Map(
    (checkInData ?? []).map((checkIn) => [checkIn.roper_id, checkIn]),
  );
  const paymentsByPerson = new Map<string, LedgerContestant["payments"]>();
  for (const payment of paymentData ?? []) {
    const payments = paymentsByPerson.get(payment.roper_id) ?? [];
    payments.push({
      id: payment.id,
      amountCents: payment.amount_cents,
      note: payment.note,
      receivedBy: payment.received_by_label,
      receivedAt: new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: producer.timezone,
      }).format(new Date(payment.received_at)),
      voided: Boolean(payment.voided_at),
      voidReason: payment.void_reason,
      voidedBy: payment.voided_by_label,
      voidedAt: payment.voided_at
        ? new Intl.DateTimeFormat("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: producer.timezone,
          }).format(new Date(payment.voided_at))
        : null,
    });
    paymentsByPerson.set(payment.roper_id, payments);
  }

  const contestantsByPerson = new Map<string, LedgerContestant>();
  for (const entry of entryData ?? []) {
    const person = entry.ropers as unknown as {
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
    };
    const division = entry.event_ropings as unknown as {
      id: string;
      name: string;
      scheduled_date: string;
    };
    const latestTransfer = latestTransferByEntry.get(entry.id);
    const checkIn = checkInByPerson.get(entry.roper_id);
    const contestant: LedgerContestant = contestantsByPerson.get(
      entry.roper_id,
    ) ?? {
      personId: entry.roper_id,
      name: `${person.first_name} ${person.last_name}`,
      email: person.email,
      phone: person.phone,
      memberNumber: memberNumbers.get(entry.roper_id) ?? null,
      paymentStatus: entry.payment_status as PaymentStatus,
      totalCents: 0,
      amountPaidCents: 0,
      balanceDueCents: 0,
      payments: paymentsByPerson.get(entry.roper_id) ?? [],
      checkedIn: Boolean(checkIn),
      checkedInAt: checkIn
        ? new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit",
            timeZone: producer.timezone,
          }).format(new Date(checkIn.checked_in_at))
        : null,
      entries: [],
      charges: chargesByPerson.get(entry.roper_id) ?? [],
    };
    contestant.entries.push({
      id: entry.id,
      divisionId: division.id,
      division: `${division.name} · ${new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${division.scheduled_date}T12:00:00Z`))}`,
      entryNumber: entry.entry_number,
      source: entry.source,
      paymentStatus: entry.payment_status as PaymentStatus,
      incentiveAdjustment: Number(entry.handicap_time_credit_seconds),
      transferNote: latestTransfer
        ? `Moved from ${divisionNames.get(latestTransfer.sourceDivisionId) ?? "another class"}`
        : null,
      eligibilityOverridden: entry.eligibility_overridden,
      eligibilityIssue: entry.eligibility_note,
      eligibilityOverrideReason: entry.eligibility_override_reason,
      competitionHold: clearance.get(entry.id)?.hold_reason,
      membershipId: clearance.get(entry.id)?.membership_id,
      options: (divisionOptions.get(division.id) ?? []).map((option) => ({
        ...option,
        selected: (chargeData ?? []).some(
          (charge) =>
            charge.roper_id === entry.roper_id &&
            charge.event_fee_id === option.id &&
            (charge.entry_id === entry.id || charge.entry_id === null),
        ),
      })),
      competitionStatus: entry.competition_status,
      withdrawalReason: activeWithdrawalByEntry.get(entry.id)?.reason ?? null,
    });
    contestantsByPerson.set(entry.roper_id, contestant);
  }

  const contestants = Array.from(contestantsByPerson.values())
    .map((contestant) => {
      const statuses = new Set(
        contestant.entries.map((entry) => entry.paymentStatus),
      );
      const { amountPaidCents, balanceDueCents } = calculateEntryBalance(contestant.entries, contestant.charges, contestant.payments);
      return {
        ...contestant,
        paymentStatus:
          statuses.size === 1 ? contestant.entries[0].paymentStatus : "mixed",
        totalCents: contestant.charges.reduce(
          (sum, charge) => sum + (charge.waived ? 0 : charge.amountCents),
          0,
        ),
        amountPaidCents,
        balanceDueCents,
      } satisfies LedgerContestant;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const requests = (requestData ?? []).map((request) => ({
    id: request.id,
    revision: request.revision,
    name: `${request.first_name} ${request.last_name}`,
    email: request.email,
    phone: formatPhoneNumber(request.phone) || null,
    birthDate: request.birth_date,
    competitionGender: request.competition_gender,
    memberNumber: request.member_number,
    contestantNote: request.contestant_note,
    submittedAt: new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: producer.timezone,
    }).format(new Date(request.created_at)),
    membershipVerified: Boolean(request.membership_id),
    requestedRecordId: request.requested_membership_id,
    items: request.online_entry_submission_ropings.map((item) => ({
      division: (() => {
        const division = item.event_ropings as unknown as {
          name: string;
          scheduled_date: string;
        };
        return `${division.name} · ${new Intl.DateTimeFormat("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${division.scheduled_date}T12:00:00Z`))}`;
      })(),
      quantity: item.quantity,
    })),
  }));

  const management = await supabase.rpc("can_manage_event", { target_event: eventId });
  const membershipManagement = await supabase.rpc("can_manage_organization", { target_organization_id: producer.id });
  if (membershipManagement.error) throw new Error("Unable to check membership approval access.");
  const collection = await supabase.rpc("can_collect_event", { target_event: eventId });
  const adjustment = await supabase.rpc("can_adjust_event_finances", { target_event: eventId });
  if (officePermission.error || management.error || collection.error || adjustment.error) throw new Error("Unable to check entry office access.");
  return (
    <EntriesWorkspace
      eventId={eventId}
      title={roping.title}
      divisions={divisions}
      ropers={ropers}
      contestants={contestants}
      requests={requests}
      totalEntries={entryData?.length ?? 0}
      canEdit={Boolean(management.data)}
      canOffice={Boolean(officePermission.data)}
      canCollect={Boolean(collection.data)}
      canAdjust={Boolean(adjustment.data)}
      requireMemberships={requireMemberships}
      canApproveMemberships={Boolean(membershipManagement.data)}
    />
  );
}

function EntriesWorkspace({
  eventId,
  title,
  divisions,
  ropers,
  contestants,
  requests,
  totalEntries,
  canEdit,
  canOffice = canEdit,
  canCollect = canOffice,
  canAdjust = canEdit,
  requireMemberships = true,
  canApproveMemberships = false,
}: {
  eventId: string;
  requireMemberships?: boolean;
  canApproveMemberships?: boolean;
  title: string;
  divisions: Array<{
    id: string;
    name: string;
    allowGuests: boolean;
    requiresBirthDate?: boolean;
    requiresMaleBirthDate?: boolean;
    options: Array<{
      id: string;
      title: string;
      amountCents: number;
      kind: string;
      scope: string;
    }>;
  }>;
  ropers: Array<{ id: string; name: string; memberNumber: string; phone?: string | null }>;
  contestants: LedgerContestant[];
  requests: Array<{
    id: string;
    revision: number;
    name: string;
    email: string;
    phone: string | null;
    birthDate: string | null;
    competitionGender: "female" | "male" | null;
    memberNumber: string | null;
    contestantNote: string | null;
    submittedAt: string;
    membershipVerified: boolean;
    requestedRecordId?: string | null;
    items: Array<{ division: string; quantity: number }>;
  }>;
  totalEntries: number;
  canEdit: boolean;
  canOffice?: boolean;
  canCollect?: boolean;
  canAdjust?: boolean;
}) {
  const totalCharges = contestants.reduce(
    (sum, contestant) => sum + contestant.totalCents,
    0,
  );
  const cashCollected = contestants.reduce(
    (sum, contestant) => sum + contestant.amountPaidCents,
    0,
  );
  const unpaidContestants = contestants.filter(
    (contestant) =>
      contestant.paymentStatus === "unpaid" ||
      contestant.paymentStatus === "mixed",
  ).length;
  const checkedInContestants = contestants.filter(
    (contestant) => contestant.checkedIn,
  ).length;

  return (
    <div className="space-y-6">
      <EventWorkflowNav eventId={eventId} active="entries" />
      <PageHeader
        eyebrow="Event entries"
        title={title}
        description="Review online requests, check in contestants, and keep the cash ledger current."
        actions={
          <EntryFormDialog
            eventId={eventId}
            divisions={divisions}
            ropers={ropers}
            enabled={canOffice}
            manager={canEdit}
            requireMemberships={requireMemberships}
            canApproveMemberships={canApproveMemberships}
          />
        }
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Total entries"
          value={String(totalEntries)}
          icon={ClipboardCheck}
        />
        <Metric
          label="Contestants"
          value={String(contestants.length)}
          detail={`${checkedInContestants} checked in · ${unpaidContestants} need payment attention`}
          icon={Users}
        />
        <Metric
          label="Event charges"
          value={formatCurrency(totalCharges)}
          icon={CircleDollarSign}
        />
        <Metric
          label="Cash marked paid"
          value={formatCurrency(cashCollected)}
          detail={`${requests.length} online ${requests.length === 1 ? "request" : "requests"}`}
          icon={Banknote}
        />
      </section>
      <OnlineEntryRequestList eventId={eventId} requests={requests} enabled={canOffice} manager={canEdit} />
      {canOffice && <RopingWaitlists eventId={eventId} manager={canEdit} />}
      <EntryLedger
        eventId={eventId}
        contestants={contestants}
        divisions={divisions.map(({ id, name }) => ({ id, name }))}
        canEdit={canEdit}
        canOffice={canOffice}
        canCollect={canCollect}
        canAdjust={canAdjust}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: typeof Users;
}) {
  return (
    <div className="rounded-md border border-[#dfe4e1] bg-white p-4">
      <div className="flex items-center gap-2 text-[#66716b]">
        <Icon size={16} />
        <p className="text-xs font-semibold">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {detail ? <p className="mt-1 text-xs text-[#758078]">{detail}</p> : null}
    </div>
  );
}
