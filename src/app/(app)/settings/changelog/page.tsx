import { History, UserRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

const entityLabels: Record<string, string> = {
  producers: "Producer settings",
  producer_seasons: "Season",
  producer_penalty_rules: "Penalty rule",
  producer_staff: "Team access",
  memberships: "Membership",
  member_fines: "Member fine",
  membership_suspensions: "Membership suspension",
  producer_funds: "Fund account",
  fund_transactions: "Fund transaction",
  member_fine_transactions: "Fine payment or adjustment",
  member_fine_exceptions: "Fine exception",
  roping_templates: "Roping template",
  roping_template_fees: "Fee template",
  divisions: "Division",
  classifications: "Classification",
  membership_classification_history: "Member classification",
  classification_review_events: "Classification review event",
  membership_classification_reviews: "Classification review",
  payout_schedules: "Payout schedule",
  payout_schedule_brackets: "Payout bracket",
  payout_schedule_places: "Payout place",
  payout_disbursements: "Payout payment",
  payout_receipts: "Roper payout receipt",
  payout_receipt_awards: "Payout allocation",
  events: "Event",
  event_ropings: "Roping",
  event_roping_handicap_adjustments: "Handicap adjustment",
  event_fees: "Event fee or option",
  roping_entries: "Entry",
  entry_roping_transfers: "Entry transfer",
  entry_charges: "Entry charge",
  competition_runs: "Run result",
  run_timer_readings: "Timer reading",
  run_rerun_history: "Rerun schedule",
  event_roping_rounds: "Roping round",
  short_round_field_changes: "Short round finalist change",
  online_entry_submissions: "Online entry submission",
  event_payments: "Cash payment",
  event_roping_removals: "Removed event roping",
};

const ignoredFields = new Set(["updated_at", "created_at"]);

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value).replaceAll("_", " ");
}

function describeChanges(
  entityType: string,
  action: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  if (entityType === "membership_suspensions" && action === "insert") {
    return [
      { field: "Reason", before: "", after: formatValue(after?.reason) },
      { field: "Starts on", before: "", after: formatValue(after?.starts_on) },
      { field: "Ends on", before: "", after: formatValue(after?.ends_on) },
    ];
  }
  if (["member_fines", "member_fine_transactions", "member_fine_exceptions"].includes(entityType) && action === "insert") {
    return [
      { field: "Reason", before: "", after: formatValue(after?.reason) },
      { field: "Type", before: "", after: formatValue(after?.restriction ?? after?.kind ?? "Temporary exception") },
      { field: "Amount", before: "", after: after?.amount_cents ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(after.amount_cents) / 100) : "Not applicable" },
      ...(after?.expires_at ? [{ field: "Expires", before: "", after: formatValue(after.expires_at) }] : []),
    ];
  }
  if (entityType === "payout_receipts" && action === "insert") {
    return [
      { field: "Amount", before: "", after: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(after?.amount_cents ?? 0) / 100) },
      { field: "Received by", before: "", after: formatValue(after?.received_by) },
      { field: "Payment method", before: "", after: formatValue(after?.payment_method) },
      { field: "Receipt confirmed", before: "", after: formatValue(after?.receipt_confirmed) },
    ];
  }
  if (entityType === "entry_roping_transfers" && action === "insert") {
    return [
      { field: "Reason", before: "", after: formatValue(after?.reason) },
      {
        field: "Previous entry number",
        before: "",
        after: formatValue(after?.source_entry_number),
      },
      {
        field: "New entry number",
        before: "",
        after: formatValue(after?.destination_entry_number),
      },
    ];
  }
  if (entityType === "run_rerun_history" && action === "insert") {
    return [
      { field: "Reason", before: "", after: formatValue(after?.reason) },
      { field: "Timing", before: "", after: formatValue(after?.timing) },
      {
        field: "Draw position",
        before: formatValue(after?.previous_draw_position),
        after: formatValue(after?.scheduled_draw_position),
      },
    ];
  }
  if (entityType === "short_round_field_changes" && action === "insert") {
    return [
      { field: "Change", before: "", after: formatValue(after?.action) },
      { field: "Reason", before: "", after: formatValue(after?.reason) },
    ];
  }
  if (entityType === "event_roping_removals" && action === "insert") {
    return [
      { field: "Roping", before: "", after: formatValue(after?.roping_name) },
      {
        field: "Entries removed",
        before: "",
        after: formatValue(after?.entry_count),
      },
      { field: "Reason", before: "", after: formatValue(after?.reason) },
    ];
  }
  if (
    entityType === "roping_entries" &&
    action === "insert" &&
    after?.eligibility_overridden === true
  ) {
    return [
      {
        field: "Eligibility issue",
        before: "",
        after: formatValue(after.eligibility_note),
      },
      {
        field: "Override reason",
        before: "",
        after: formatValue(after.eligibility_override_reason),
      },
      {
        field: "Entry number",
        before: "",
        after: formatValue(after.entry_number),
      },
    ];
  }
  if (action === "insert")
    return [{ field: "Record", before: "", after: "Created" }];
  if (action === "delete")
    return [{ field: "Record", before: "Active", after: "Deleted" }];
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  return Array.from(keys)
    .filter(
      (key) =>
        !ignoredFields.has(key) &&
        JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]),
    )
    .slice(0, 8)
    .map((key) => ({
      field: key.replaceAll("_", " "),
      before: formatValue(before?.[key]),
      after: formatValue(after?.[key]),
    }));
}

export default async function ChangelogPage({
  searchParams,
}: PageProps<"/settings/changelog">) {
  const filters = await searchParams;
  const producer = await getActiveProducer();
  if (!producer) return null;
  const entityFilter = typeof filters.entity === "string" ? filters.entity : "";
  const actionFilter = typeof filters.action === "string" ? filters.action : "";
  const supabase = await createClient();
  let query = supabase
    .from("producer_audit_history")
    .select(
      "id, actor_label, entity_type, entity_id, action, before_data, after_data, created_at",
    )
    .eq("producer_id", producer.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (entityFilter) query = query.eq("entity_type", entityFilter);
  if (actionFilter) query = query.eq("action", actionFilter);
  const { data, error } = await query;
  if (error) throw new Error(`Unable to load the changelog: ${error.message}`);

  const entities = Object.keys(entityLabels);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accountability"
        title="Producer changelog"
        description="Review data entry and configuration changes, including who made each change and exactly what was modified."
      />
      <form className="flex flex-wrap items-end gap-3 rounded-md border border-[#dfe4e1] bg-white p-4">
        <label className="block max-w-full text-xs font-bold uppercase text-[#66716b]">
          Record type
          <select
            name="entity"
            defaultValue={entityFilter}
            className="mt-2 h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal normal-case"
          >
            <option value="">All record types</option>
            {entities.map((entity) => (
              <option key={entity} value={entity}>
                {entityLabels[entity]}
              </option>
            ))}
          </select>
        </label>
        <label className="block max-w-full text-xs font-bold uppercase text-[#66716b]">
          Action
          <select
            name="action"
            defaultValue={actionFilter}
            className="mt-2 h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal normal-case"
          >
            <option value="">All actions</option>
            <option value="insert">Created</option>
            <option value="update">Updated</option>
            <option value="delete">Deleted</option>
          </select>
        </label>
        <button className="h-10 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white">
          Apply filters
        </button>
      </form>
      <section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
        <header className="flex items-center gap-2 border-b border-[#e7ebe8] px-5 py-4">
          <History size={18} className="text-[var(--brand-accent-strong)]" />
          <h2 className="font-bold">Recent activity</h2>
          <span className="ml-auto text-xs text-[#758078]">
            Latest {data.length} changes
          </span>
        </header>
        <div className="divide-y divide-[#edf0ee]">
          {data.map((item) => {
            const changes = describeChanges(
              item.entity_type,
              item.action,
              item.before_data as Record<string, unknown> | null,
              item.after_data as Record<string, unknown> | null,
            );
            return (
              <article key={item.id} className="p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <span
                    className={`mt-0.5 inline-flex w-fit rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${item.action === "delete" ? "bg-rose-50 text-rose-700" : item.action === "insert" ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700"}`}
                  >
                    {item.action === "insert"
                      ? "Created"
                      : item.action === "delete"
                        ? "Deleted"
                        : "Updated"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">
                      {entityLabels[item.entity_type] ??
                        item.entity_type.replaceAll("_", " ")}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#758078]">
                      <span className="flex items-center gap-1">
                        <UserRound size={13} /> {item.actor_label}
                      </span>
                      <time>
                        {new Intl.DateTimeFormat("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: producer.timezone,
                        }).format(new Date(item.created_at))}
                      </time>
                      {item.entity_id ? (
                        <span className="font-mono text-[10px]">
                          {item.entity_id.slice(0, 8)}
                        </span>
                      ) : null}
                    </div>
                    {changes.length ? (
                      <div className="mt-3 space-y-1.5">
                        {changes.map((change) => (
                          <div
                            key={change.field}
                            className="grid gap-1 rounded bg-[#f7f8f7] px-3 py-2 text-xs sm:grid-cols-[150px_1fr]"
                          >
                            <span className="font-semibold capitalize text-[#58645d]">
                              {change.field}
                            </span>
                            <span className="min-w-0 break-words text-[#66716b]">
                              {change.before ? (
                                <>
                                  <span className="line-through opacity-70">
                                    {change.before}
                                  </span>
                                  <span className="mx-2">→</span>
                                </>
                              ) : null}
                              <span className="font-medium text-[#17201c]">
                                {change.after}
                              </span>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
          {!data.length ? (
            <div className="p-12 text-center">
              <p className="font-semibold">No changes match these filters</p>
              <p className="mt-2 text-sm text-[#758078]">
                New producer activity will appear here automatically.
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
