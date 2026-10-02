import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  CircleDollarSign,
  ClipboardCheck,
  Users,
} from "lucide-react";
import { EntryFormDialog } from "@/components/ropings/entry-form-dialog";
import {
  EntryLedger,
  type LedgerContestant,
} from "@/components/ropings/entry-ledger";
import { OnlineEntryRequestList } from "@/components/ropings/online-entry-request-list";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

type PaymentStatus = "unpaid" | "paid_cash" | "comped" | "refunded";

export default async function EventEntriesPage({
  params,
}: PageProps<"/ropings/[ropingId]/entries">) {
  const { ropingId } = await params;
  if (!isSupabaseConfigured()) {
    return (
      <EntriesWorkspace
        ropingId={ropingId}
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
        people={[]}
        contestants={[
          {
            personId: "preview-jace",
            name: "Jace Holloway",
            memberNumber: "RR-1042",
            paymentStatus: "unpaid",
            totalCents: 11500,
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
                title: "Open entry fee",
                amountCents: 5000,
                waived: false,
                waiverReason: null,
              },
              {
                id: "jace-stock-1",
                title: "Stock fee",
                amountCents: 1000,
                waived: false,
                waiverReason: null,
              },
              {
                id: "jace-entry-2",
                title: "11.5 entry fee",
                amountCents: 5000,
                waived: false,
                waiverReason: null,
              },
              {
                id: "jace-office",
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
                title: "Entry fee",
                amountCents: 3000,
                waived: false,
                waiverReason: null,
              },
              {
                id: "mara-office",
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
  const organization = await getActiveOrganization();
  if (!organization) notFound();
  const supabase = await createClient();
  const [
    { data: roping },
    { data: membershipData },
    { data: entryData, error: entryError },
    { data: chargeData, error: chargeError },
    { data: requestData, error: requestError },
    { data: transferData, error: transferError },
    { data: withdrawalData, error: withdrawalError },
  ] = await Promise.all([
    supabase
      .from("ropings")
      .select(
        "id, title, status, roping_divisions!roping_divisions_roping_id_fkey(id, name, scheduled_date, schedule_type, starts_at, allow_guests, sort_order, roping_fees!roping_fees_roping_division_id_fkey(id, title, amount_cents, kind, scope, is_required))",
      )
      .eq("id", ropingId)
      .eq("organization_id", organization.id)
      .single(),
    supabase
      .from("organization_memberships")
      .select("member_number, people!inner(id, first_name, last_name)")
      .eq("organization_id", organization.id)
      .eq("status", "active")
      .order("member_number"),
    supabase
      .from("entries")
      .select(
        "id, entry_number, source, payment_status, competition_status, person_id, incentive_adjustment_seconds, eligibility_overridden, eligibility_note, eligibility_override_reason, roping_divisions!entries_roping_division_id_fkey!inner(id, name, scheduled_date), people!inner(first_name, last_name)",
      )
      .eq("roping_id", ropingId)
      .order("entered_at", { ascending: false }),
    supabase
      .from("entry_charges")
      .select(
        "id, person_id, entry_id, roping_fee_id, title, amount_cents, waived_at, waiver_reason",
      )
      .eq("roping_id", ropingId)
      .order("created_at"),
    supabase
      .from("online_entry_requests")
      .select(
        "id, first_name, last_name, email, phone, birth_date, competition_gender, member_number, membership_id, contestant_note, created_at, online_entry_request_items!online_entry_request_items_request_id_fkey(quantity, roping_divisions!online_entry_request_items_roping_division_id_fkey!inner(name, scheduled_date))",
      )
      .eq("roping_id", ropingId)
      .eq("status", "pending")
      .order("created_at"),
    supabase
      .from("entry_transfers")
      .select("entry_id, source_division_id, reason, created_at")
      .eq("roping_id", ropingId)
      .order("created_at", { ascending: false }),
    supabase
      .from("entry_withdrawals")
      .select("entry_id, reason, financial_action, withdrawn_at")
      .eq("roping_id", ropingId)
      .is("reinstated_at", null),
  ]);
  if (!roping) notFound();
  const loadError =
    entryError ??
    chargeError ??
    requestError ??
    transferError ??
    withdrawalError;
  if (loadError)
    throw new Error(`Unable to load event entries: ${loadError.message}`);

  const divisions = (
    roping.roping_divisions as unknown as Array<{
      id: string;
      name: string;
      scheduled_date: string;
      schedule_type: "fixed" | "tentative" | "follows_previous";
      starts_at: string | null;
      allow_guests: boolean;
      sort_order: number;
      roping_fees: Array<{
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
      allowGuests: division.allow_guests,
      options: division.roping_fees
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
  const people = (membershipData ?? []).map((membership) => {
    const person = membership.people as unknown as {
      id: string;
      first_name: string;
      last_name: string;
    };
    memberNumbers.set(person.id, membership.member_number);
    return {
      id: person.id,
      name: `${person.first_name} ${person.last_name}`,
      memberNumber: membership.member_number,
    };
  });

  const chargesByPerson = new Map<string, LedgerContestant["charges"]>();
  for (const charge of chargeData ?? []) {
    const charges = chargesByPerson.get(charge.person_id) ?? [];
    charges.push({
      id: charge.id,
      title: charge.title,
      amountCents: charge.amount_cents,
      waived: Boolean(charge.waived_at),
      waiverReason: charge.waiver_reason,
    });
    chargesByPerson.set(charge.person_id, charges);
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
        sourceDivisionId: transfer.source_division_id,
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

  const contestantsByPerson = new Map<string, LedgerContestant>();
  for (const entry of entryData ?? []) {
    const person = entry.people as unknown as {
      first_name: string;
      last_name: string;
    };
    const division = entry.roping_divisions as unknown as {
      id: string;
      name: string;
      scheduled_date: string;
    };
    const latestTransfer = latestTransferByEntry.get(entry.id);
    const contestant: LedgerContestant = contestantsByPerson.get(
      entry.person_id,
    ) ?? {
      personId: entry.person_id,
      name: `${person.first_name} ${person.last_name}`,
      memberNumber: memberNumbers.get(entry.person_id) ?? null,
      paymentStatus: entry.payment_status as PaymentStatus,
      totalCents: 0,
      entries: [],
      charges: chargesByPerson.get(entry.person_id) ?? [],
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
      incentiveAdjustment: Number(entry.incentive_adjustment_seconds),
      transferNote: latestTransfer
        ? `Moved from ${divisionNames.get(latestTransfer.sourceDivisionId) ?? "another class"}`
        : null,
      eligibilityOverridden: entry.eligibility_overridden,
      eligibilityIssue: entry.eligibility_note,
      eligibilityOverrideReason: entry.eligibility_override_reason,
      options: (divisionOptions.get(division.id) ?? []).map((option) => ({
        ...option,
        selected: (chargeData ?? []).some(
          (charge) =>
            charge.person_id === entry.person_id &&
            charge.roping_fee_id === option.id &&
            (charge.entry_id === entry.id || charge.entry_id === null),
        ),
      })),
      competitionStatus: entry.competition_status,
      withdrawalReason: activeWithdrawalByEntry.get(entry.id)?.reason ?? null,
    });
    contestantsByPerson.set(entry.person_id, contestant);
  }

  const contestants = Array.from(contestantsByPerson.values())
    .map((contestant) => {
      const statuses = new Set(
        contestant.entries.map((entry) => entry.paymentStatus),
      );
      return {
        ...contestant,
        paymentStatus:
          statuses.size === 1 ? contestant.entries[0].paymentStatus : "mixed",
        totalCents: contestant.charges.reduce(
          (sum, charge) => sum + (charge.waived ? 0 : charge.amountCents),
          0,
        ),
      } satisfies LedgerContestant;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const requests = (requestData ?? []).map((request) => ({
    id: request.id,
    name: `${request.first_name} ${request.last_name}`,
    email: request.email,
    phone: request.phone,
    birthDate: request.birth_date,
    competitionGender: request.competition_gender,
    memberNumber: request.member_number,
    contestantNote: request.contestant_note,
    submittedAt: new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: organization.timezone,
    }).format(new Date(request.created_at)),
    membershipVerified: Boolean(request.membership_id),
    items: request.online_entry_request_items.map((item) => ({
      division: (() => {
        const division = item.roping_divisions as unknown as {
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

  return (
    <EntriesWorkspace
      ropingId={ropingId}
      title={roping.title}
      divisions={divisions}
      people={people}
      contestants={contestants}
      requests={requests}
      totalEntries={entryData?.length ?? 0}
      canEdit={organization.role !== "viewer"}
    />
  );
}

function EntriesWorkspace({
  ropingId,
  title,
  divisions,
  people,
  contestants,
  requests,
  totalEntries,
  canEdit,
}: {
  ropingId: string;
  title: string;
  divisions: Array<{
    id: string;
    name: string;
    allowGuests: boolean;
    options: Array<{
      id: string;
      title: string;
      amountCents: number;
      kind: string;
      scope: string;
    }>;
  }>;
  people: Array<{ id: string; name: string; memberNumber: string }>;
  contestants: LedgerContestant[];
  requests: Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    birthDate: string | null;
    competitionGender: "female" | "male" | null;
    memberNumber: string | null;
    contestantNote: string | null;
    submittedAt: string;
    membershipVerified: boolean;
    items: Array<{ division: string; quantity: number }>;
  }>;
  totalEntries: number;
  canEdit: boolean;
}) {
  const totalCharges = contestants.reduce(
    (sum, contestant) => sum + contestant.totalCents,
    0,
  );
  const cashCollected = contestants
    .filter((contestant) => contestant.paymentStatus === "paid_cash")
    .reduce((sum, contestant) => sum + contestant.totalCents, 0);
  const unpaidContestants = contestants.filter(
    (contestant) =>
      contestant.paymentStatus === "unpaid" ||
      contestant.paymentStatus === "mixed",
  ).length;

  return (
    <div className="space-y-6">
      <Link
        href={`/ropings/${ropingId}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#66716b]"
      >
        <ArrowLeft size={16} /> Back to event
      </Link>
      <PageHeader
        eyebrow="Event entries"
        title={title}
        description="Review online requests, check in contestants, and keep the cash ledger current."
        actions={
          <EntryFormDialog
            ropingId={ropingId}
            divisions={divisions}
            people={people}
            enabled={canEdit}
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
          detail={`${unpaidContestants} need payment attention`}
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
      <OnlineEntryRequestList ropingId={ropingId} requests={requests} />
      <EntryLedger
        ropingId={ropingId}
        contestants={contestants}
        divisions={divisions.map(({ id, name }) => ({ id, name }))}
        canEdit={canEdit}
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
