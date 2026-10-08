import { EventWorkflowNav } from "@/components/events/event-workflow-nav";
import { notFound } from "next/navigation";
import { Banknote, Users } from "lucide-react";
import { initializePayoutPlans } from "./actions";
import { PayoutRegisterData } from "@/components/events/payout-register-data";
import { RopingFundingData } from "@/components/events/roping-funding-data";
import { PageHeader } from "@/components/ui/page-header";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

type PayoutStage = "go_round" | "aggregate" | "short_round";
type PayoutPlace = { place: number; percentage: number; amountCents: number };

interface PayoutPlan {
  id: string;
  ropingDivisionId: string;
  name: string;
  poolType: string;
  feeKind: string | null;
  division: string;
  numberOfRuns: number;
  shortRoundEnabled: boolean;
  competitionFormat: "standard" | "handicap" | "four_d";
  paybackPercent: number;
  goRoundsPercent: number;
  aggregatePercent: number;
  shortRoundPercent: number;
  entryCount: number;
  poolCents: number;
  placesByStage: Record<PayoutStage, PayoutPlace[]>;
  fourDBreakdown: Array<{
    dNumber: number;
    poolCents: number;
    place: number;
    percentage: number;
    amountCents: number;
  }>;
  results: Array<{
    entryId: string;
    sectionType: string;
    roundNumber: number | null;
    place: number;
    contestantName: string;
    performanceSeconds: number;
    payoutCents: number;
    dNumber: number | null;
  }>;
}

interface PayoutResultRow {
  section_type: string;
  round_number: number | null;
  place_number: number;
  entry_id: string;
  contestant_name: string;
  performance_seconds: number;
  payout_cents: number;
}

interface FourDBreakdownRow {
  d_number: number;
  d_pool_cents: number;
  place_number: number;
  place_percentage_basis_points: number;
  payout_cents: number;
}

interface FourDPayoutResultRow {
  d_number: number;
  place_number: number;
  entry_id: string;
  contestant_name: string;
  performance_seconds: number;
  payout_cents: number;
}

export default async function EventPayoutsPage({
  params,
}: PageProps<"/events/[eventId]/payouts">) {
  const { eventId } = await params;
  const producer = await getActiveProducer();
  if (!producer) notFound();
  const supabase = await createClient();
  const [
    { data: roping },
    { data: plans, error },
  ] = await Promise.all([
    supabase
      .from("events")
      .select("id, title")
      .eq("id", eventId)
      .eq("producer_id", producer.id)
      .single(),
    supabase
      .from("event_roping_payout_plans")
      .select(
        "id, event_roping_id, name, pool_type, payback_basis_points, go_rounds_basis_points, aggregate_basis_points, short_round_basis_points, event_ropings!inner(name, scheduled_date, main_round_count, short_round_enabled, competition_format), event_fees(kind)",
      )
      .eq("event_id", eventId)
      .eq("producer_id", producer.id)
      .order("created_at"),
  ]);
  if (!roping) notFound();
  if (error) throw new Error(`Unable to load payout plans: ${error.message}`);

  const calculated = await Promise.all(
    (plans ?? []).map(async (plan): Promise<PayoutPlan> => {
      const division = plan.event_ropings as unknown as {
        name: string;
        scheduled_date: string;
        main_round_count: number;
        short_round_enabled: boolean;
        competition_format: "standard" | "handicap" | "four_d";
      };
      const isFourD =
        division.competition_format === "four_d" && plan.pool_type === "main";
      const [
        { data, error: calculationError },
        resultCalculation,
        fourDBreakdownCalculation,
      ] = await Promise.all([
        supabase.rpc("calculate_roping_payouts", {
          target_plan_id: plan.id,
        }),
        supabase.rpc(
          isFourD
            ? "calculate_four_d_payout_results"
            : "calculate_roping_payout_results",
          { target_plan_id: plan.id },
        ),
        isFourD
          ? supabase.rpc("calculate_four_d_payout_breakdown", {
              target_plan_id: plan.id,
            })
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (calculationError)
        throw new Error(
          `Unable to calculate ${plan.name}: ${calculationError.message}`,
        );
      if (resultCalculation.error)
        throw new Error(
          `Unable to rank ${plan.name}: ${resultCalculation.error.message}`,
        );
      if (fourDBreakdownCalculation.error)
        throw new Error(
          `Unable to calculate ${plan.name} D purses: ${fourDBreakdownCalculation.error.message}`,
        );
      const rows = (data ?? []) as Array<{
        entry_count: number;
        pool_cents: number;
        stage_type: PayoutStage | null;
        place_number: number | null;
        percentage_basis_points: number | null;
        payout_cents: number | null;
      }>;
      const summary = rows[0] ?? { entry_count: 0, pool_cents: 0 };
      return {
        id: plan.id,
        ropingDivisionId: plan.event_roping_id,
        name: plan.name,
        poolType: plan.pool_type,
        feeKind:
          (plan.event_fees as unknown as { kind: string } | null)?.kind ??
          null,
        division: (() => {
          return `${division.name} · ${new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${division.scheduled_date}T12:00:00Z`))}`;
        })(),
        numberOfRuns: division.main_round_count,
        shortRoundEnabled: division.short_round_enabled,
        competitionFormat: division.competition_format,
        paybackPercent: plan.payback_basis_points / 100,
        goRoundsPercent: plan.go_rounds_basis_points / 100,
        aggregatePercent: plan.aggregate_basis_points / 100,
        shortRoundPercent: plan.short_round_basis_points / 100,
        entryCount: summary.entry_count,
        poolCents: Number(summary.pool_cents),
        placesByStage: Object.fromEntries(
          (["go_round", "aggregate", "short_round"] as const).map((stage) => [
            stage,
            rows
              .filter(
                (row) => row.stage_type === stage && row.place_number !== null,
              )
              .map((row) => ({
                place: row.place_number as number,
                percentage: Number(row.percentage_basis_points) / 100,
                amountCents: Number(row.payout_cents),
              })),
          ]),
        ) as Record<PayoutStage, PayoutPlace[]>,
        fourDBreakdown: (
          (fourDBreakdownCalculation.data ?? []) as FourDBreakdownRow[]
        ).map((row) => ({
          dNumber: row.d_number,
          poolCents: Number(row.d_pool_cents),
          place: row.place_number,
          percentage: Number(row.place_percentage_basis_points) / 100,
          amountCents: Number(row.payout_cents),
        })),
        results: (isFourD
          ? ((resultCalculation.data ?? []) as FourDPayoutResultRow[]).map(
              (result) => ({
                entryId: result.entry_id,
                sectionType: "four_d",
                roundNumber: null,
                place: result.place_number,
                contestantName: result.contestant_name,
                performanceSeconds: Number(result.performance_seconds),
                payoutCents: Number(result.payout_cents),
                dNumber: result.d_number,
              }),
            )
          : ((resultCalculation.data ?? []) as PayoutResultRow[]).map(
              (result) => ({
                entryId: result.entry_id,
                sectionType: result.section_type,
                roundNumber: result.round_number,
                place: result.place_number,
                contestantName: result.contestant_name,
                performanceSeconds: Number(result.performance_seconds),
                payoutCents: Number(result.payout_cents),
                dNumber: null,
              }),
            )
        ),
      };
    }),
  );

  const payoutGroups = Array.from(
    Map.groupBy(calculated, (plan) => plan.ropingDivisionId).values(),
  ).map((group) =>
    group.toSorted((first, second) => {
      const poolOrder = (plan: PayoutPlan) =>
        plan.poolType === "main" ? 0 : plan.feeKind === "insurance" ? 2 : 1;
      return poolOrder(first) - poolOrder(second);
    }),
  );
  const initAction = initializePayoutPlans.bind(null, eventId);
  return (
    <div className="space-y-6">
      <EventWorkflowNav eventId={eventId} active="payouts" />
      <PageHeader
        eyebrow="Event payouts"
        title={roping.title}
        description="Live projections use paid entries, separately selected side pots and insurance, payout-contributing charges, and added money."
      />
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Finalize Roping Payouts</h2>
        {payoutGroups.map(group => <details key={group[0].ropingDivisionId} className="rounded-md border border-[#dfe4e1]"><summary className="cursor-pointer p-4 font-semibold">{group[0].division}</summary><RopingFundingData ropingId={group[0].ropingDivisionId} canManage={producer.role !== "viewer" || Boolean(producer.treasurer)}/></details>)}
      </section>
      <PayoutRegisterData eventId={eventId} producerId={producer.id} canManage={producer.role !== "viewer" || Boolean(producer.treasurer)} />
      {calculated.length ? (
        <section className="space-y-5">
          {payoutGroups.map((group) => {
            const primaryPlan = group[0];
            const combinedPoolCents = group.reduce(
              (total, plan) => total + plan.poolCents,
              0,
            );
            return (
              <CollapsibleCard
                key={primaryPlan.ropingDivisionId}
                defaultOpen={false}
                label={`${primaryPlan.division} payouts`}
                summary={
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase text-[var(--brand-accent-strong)]">
                      Scheduled roping
                    </p>
                    <h2 className="mt-1 text-lg font-bold">
                      {primaryPlan.division}
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    <span>
                      <strong>{group.length}</strong>{" "}
                      {group.length === 1 ? "payout pool" : "payout pools"}
                    </span>
                    <span>
                      <strong>{formatCurrency(combinedPoolCents)}</strong>{" "}
                      combined
                    </span>
                  </div>
                </div>
                }
              >
                <div className="divide-y divide-[#dfe4e1]">
                  {group.map((plan) => (
                    <PayoutPlanSection
                      key={plan.id}
                      plan={plan}
                    />
                  ))}
                </div>
              </CollapsibleCard>
            );
          })}
        </section>
      ) : (
        <section className="rounded-md border border-dashed border-[#cbd2ce] bg-white p-10 text-center">
          <p className="font-semibold">
            No payout plans are attached to this roping
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#758078]">
            Assign payout schedules to class templates, side pots, and insurance
            pools. Existing events can then copy those rules without changing
            prior results.
          </p>
          <form action={initAction}>
            <button className="mt-4 h-10 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white">
              Load configured payout plans
            </button>
          </form>
        </section>
      )}
    </div>
  );
}

function PayoutPlanSection({
  plan,
}: {
  plan: PayoutPlan;
}) {
  const poolLabel =
    plan.poolType === "main"
      ? "Main purse"
      : plan.feeKind === "insurance"
        ? "Insurance pot"
        : "Side pot";

  return (
    <section>
      <header className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">
              {poolLabel}
            </p>
            <h3 className="mt-1 text-base font-bold">{plan.name}</h3>
          </div>
          <Banknote size={20} className="text-[#758078]" />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#758078]">
              <Users size={13} /> Entries
            </p>
            <p className="mt-1 text-xl font-bold">{plan.entryCount}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-[#758078]">
              Payout pool
            </p>
            <p className="mt-1 text-xl font-bold">
              {formatCurrency(plan.poolCents)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs font-semibold text-[#66716b]">
          {plan.competitionFormat === "four_d" && plan.poolType === "main"
            ? `${plan.paybackPercent}% payback · full purse divided among the active Ds`
            : `${plan.paybackPercent}% payback · ${plan.goRoundsPercent}% across ${plan.numberOfRuns} ${plan.numberOfRuns === 1 ? "go" : "goes"} · ${plan.aggregatePercent}% aggregate${plan.shortRoundEnabled && plan.shortRoundPercent ? ` · ${plan.shortRoundPercent}% short round` : ""}`}
        </p>
      </header>
      {plan.competitionFormat === "four_d" && plan.poolType === "main" ? (
        plan.fourDBreakdown.length ? (
          <>
            <FourDPayoutBreakdown plan={plan} />
            {plan.results.length ? (
              <PayoutResults
                plan={plan}
              />
            ) : null}
          </>
        ) : (
          <PayoutBracketEmpty />
        )
      ) : plan.placesByStage.go_round.length ? (
        <>
          <PayoutBreakdown plan={plan} />
          {plan.results.length ? (
            <PayoutResults
              plan={plan}
            />
          ) : null}
        </>
      ) : (
        <PayoutBracketEmpty />
      )}
    </section>
  );
}

function PayoutBracketEmpty() {
  return (
    <div className="p-6 text-center">
      <p className="text-sm font-semibold">No payout bracket applies yet</p>
      <p className="mt-1 text-xs text-[#758078]">
        The current paid-entry count does not match a configured bracket.
      </p>
    </div>
  );
}

function allocatePlaces(poolCents: number, places: PayoutPlace[]) {
  const amounts = places.map((place) =>
    Math.floor((poolCents * place.percentage) / 100),
  );
  const remainder =
    poolCents - amounts.reduce((sum, amount) => sum + amount, 0);
  if (amounts.length) amounts[0] += remainder;
  return amounts;
}

function PayoutResults({
  plan,
}: {
  plan: PayoutPlan;
}) {
  const sections = Map.groupBy(plan.results, (result) =>
    result.dNumber
      ? `${result.dNumber}D`
      : result.sectionType === "aggregate"
        ? "Aggregate"
        : result.sectionType === "short_round"
          ? "Short round"
          : `Go ${result.roundNumber}`,
  );
  return (
    <section className="border-t border-[#e7ebe8] p-5">
      <h3 className="text-sm font-bold">Current money winners</h3>
      {plan.feeKind === "insurance" ? (
        <p className="mt-1 text-xs leading-5 text-[#758078]">
          Main-money winners are excluded within each go and the aggregate.
          Side-pot winnings do not affect insurance eligibility.
        </p>
      ) : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {Array.from(sections.entries()).map(([section, results]) => (
          <div key={section} className="rounded-md border border-[#e3e7e5]">
            <h4 className="border-b border-[#e7ebe8] px-3 py-2 text-xs font-bold uppercase text-[#66716b]">
              {section}
            </h4>
            <div className="divide-y divide-[#edf0ee]">
              {results.map((result) => (
                <div
                  key={`${section}-${result.entryId}`}
                  className="grid grid-cols-[28px_1fr_auto] items-center gap-2 px-3 py-2.5 text-sm"
                >
                  <span className="font-bold">{result.place}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {result.contestantName}
                    </span>
                    <span className="text-xs text-[#758078]">
                      {result.performanceSeconds.toFixed(2)} sec
                    </span>
                  </span>
                  <span className="font-bold">
                    {formatCurrency(result.payoutCents)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function FourDPayoutBreakdown({ plan }: { plan: PayoutPlan }) {
  const divisions = Map.groupBy(
    plan.fourDBreakdown,
    (breakdown) => breakdown.dNumber,
  );

  return (
    <section className="border-t border-[#e7ebe8] p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold">Purse by D</h3>
        <p className="mt-1 text-xs leading-5 text-[#758078]">
          Each D receives its configured share. Place splits come from this
          class&apos;s attached payout schedule.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from(divisions.entries()).map(([dNumber, places]) => (
          <div key={dNumber} className="rounded-md border border-[#e3e7e5]">
            <div className="flex items-center justify-between border-b border-[#e7ebe8] px-3 py-2.5">
              <h4 className="font-bold">{dNumber}D</h4>
              <span className="text-sm font-bold">
                {formatCurrency(places[0].poolCents)}
              </span>
            </div>
            <div className="divide-y divide-[#edf0ee]">
              {places.map((place) => (
                <div
                  key={place.place}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-sm"
                >
                  <span className="font-semibold">Place {place.place}</span>
                  <span className="text-xs text-[#66716b]">
                    {place.percentage}%
                  </span>
                  <span className="min-w-20 text-right font-bold">
                    {formatCurrency(place.amountCents)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PayoutBreakdown({ plan }: { plan: PayoutPlan }) {
  const goRoundsTotal = Math.floor(
    (plan.poolCents * plan.goRoundsPercent) / 100,
  );
  const shortRoundPool = Math.floor(
    (plan.poolCents * plan.shortRoundPercent) / 100,
  );
  const aggregatePool = plan.poolCents - goRoundsTotal - shortRoundPool;
  const goPools = Array.from(
    { length: plan.numberOfRuns },
    (_, index) =>
      Math.floor(goRoundsTotal / plan.numberOfRuns) +
      (index < goRoundsTotal % plan.numberOfRuns ? 1 : 0),
  );
  const goPlaces = plan.placesByStage.go_round;
  const goPayouts = goPools.map((pool) => allocatePlaces(pool, goPlaces));

  return (
    <div className="divide-y divide-[#e7ebe8]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="bg-[#f7f8f7] text-[10px] font-bold uppercase text-[#758078]">
            <tr>
              <th className="px-5 py-3">Go-round place</th>
              <th className="px-3 py-3">Split</th>
              {goPools.map((_, index) => (
                <th key={index} className="px-3 py-3 text-right">
                  Go {index + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf0ee]">
            {goPlaces.map((place, placeIndex) => (
              <tr key={place.place}>
                <td className="px-5 py-3 font-bold">Place {place.place}</td>
                <td className="px-3 py-3 text-[#66716b]">
                  {place.percentage}%
                </td>
                {goPayouts.map((payouts, goIndex) => (
                  <td
                    key={goIndex}
                    className="px-3 py-3 text-right font-semibold"
                  >
                    {formatCurrency(payouts[placeIndex])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StagePayoutTable
        title="Aggregate"
        poolCents={aggregatePool}
        places={plan.placesByStage.aggregate}
      />
      {plan.shortRoundEnabled && shortRoundPool > 0 ? (
        <StagePayoutTable
          title="Short round"
          poolCents={shortRoundPool}
          places={plan.placesByStage.short_round}
        />
      ) : null}
    </div>
  );
}

function StagePayoutTable({
  title,
  poolCents,
  places,
}: {
  title: string;
  poolCents: number;
  places: PayoutPlace[];
}) {
  const payouts = allocatePlaces(poolCents, places);
  return (
    <section className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold">{title}</h3>
        <span className="text-sm font-bold">{formatCurrency(poolCents)}</span>
      </div>
      <div className="divide-y divide-[#edf0ee] rounded-md border border-[#e3e7e5]">
        {places.map((place, index) => (
          <div
            key={place.place}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-sm"
          >
            <span className="font-semibold">Place {place.place}</span>
            <span className="text-[#66716b]">{place.percentage}%</span>
            <span className="min-w-20 text-right font-bold">
              {formatCurrency(payouts[index])}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
