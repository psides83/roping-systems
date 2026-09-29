import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Banknote, Users } from "lucide-react";
import { initializePayoutPlans } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveOrganization } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

type PayoutStage = "go_round" | "aggregate" | "short_round";
type PayoutPlace = { place: number; percentage: number; amountCents: number };

interface PayoutPlan {
  id: string;
  name: string;
  poolType: string;
  feeKind: string | null;
  division: string;
  numberOfRuns: number;
  shortRoundEnabled: boolean;
  paybackPercent: number;
  goRoundsPercent: number;
  aggregatePercent: number;
  shortRoundPercent: number;
  entryCount: number;
  poolCents: number;
  placesByStage: Record<PayoutStage, PayoutPlace[]>;
  results: Array<{
    entryId: string;
    sectionType: string;
    roundNumber: number | null;
    place: number;
    contestantName: string;
    performanceSeconds: number;
    payoutCents: number;
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

export default async function EventPayoutsPage({
  params,
}: PageProps<"/ropings/[ropingId]/payouts">) {
  const { ropingId } = await params;
  const organization = await getActiveOrganization();
  if (!organization) notFound();
  const supabase = await createClient();
  const [{ data: roping }, { data: plans, error }] = await Promise.all([
    supabase
      .from("ropings")
      .select("id, title")
      .eq("id", ropingId)
      .eq("organization_id", organization.id)
      .single(),
    supabase
      .from("roping_payout_plans")
      .select(
        "id, name, pool_type, payback_basis_points, go_rounds_basis_points, aggregate_basis_points, short_round_basis_points, roping_divisions!inner(name, scheduled_date, number_of_runs, short_round_enabled), roping_fees(kind)",
      )
      .eq("roping_id", ropingId)
      .eq("organization_id", organization.id)
      .order("created_at"),
  ]);
  if (!roping) notFound();
  if (error) throw new Error(`Unable to load payout plans: ${error.message}`);

  const calculated = await Promise.all(
    (plans ?? []).map(async (plan): Promise<PayoutPlan> => {
      const [{ data, error: calculationError }, resultCalculation] =
        await Promise.all([
          supabase.rpc("calculate_roping_payouts", {
            target_plan_id: plan.id,
          }),
          supabase.rpc("calculate_roping_payout_results", {
            target_plan_id: plan.id,
          }),
        ]);
      if (calculationError)
        throw new Error(
          `Unable to calculate ${plan.name}: ${calculationError.message}`,
        );
      if (resultCalculation.error)
        throw new Error(
          `Unable to rank ${plan.name}: ${resultCalculation.error.message}`,
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
        name: plan.name,
        poolType: plan.pool_type,
        feeKind:
          (plan.roping_fees as unknown as { kind: string } | null)?.kind ??
          null,
        division: (() => {
          const division = plan.roping_divisions as unknown as {
            name: string;
            scheduled_date: string;
            number_of_runs: number;
            short_round_enabled: boolean;
          };
          return `${division.name} · ${new Intl.DateTimeFormat("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          }).format(new Date(`${division.scheduled_date}T12:00:00Z`))}`;
        })(),
        numberOfRuns: (
          plan.roping_divisions as unknown as { number_of_runs: number }
        ).number_of_runs,
        shortRoundEnabled: (
          plan.roping_divisions as unknown as { short_round_enabled: boolean }
        ).short_round_enabled,
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
        results: ((resultCalculation.data ?? []) as PayoutResultRow[]).map(
          (result) => ({
            entryId: result.entry_id,
            sectionType: result.section_type,
            roundNumber: result.round_number,
            place: result.place_number,
            contestantName: result.contestant_name,
            performanceSeconds: Number(result.performance_seconds),
            payoutCents: Number(result.payout_cents),
          }),
        ),
      };
    }),
  );

  const initAction = initializePayoutPlans.bind(null, ropingId);
  return (
    <div className="space-y-6">
      <Link
        href={`/ropings/${ropingId}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#66716b]"
      >
        <ArrowLeft size={16} /> Back to event
      </Link>
      <PageHeader
        eyebrow="Event payouts"
        title={roping.title}
        description="Live projections use paid entries, separately selected side pots and insurance, payout-contributing charges, and added money."
      />
      {calculated.length ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {calculated.map((plan) => (
            <article
              key={plan.id}
              className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white"
            >
              <header className="border-b border-[#e7ebe8] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">
                      {plan.poolType === "side_pot"
                        ? plan.feeKind === "insurance"
                          ? "Insurance pool"
                          : "Side pot"
                        : plan.division}
                    </p>
                    <h2 className="mt-1 text-lg font-bold">{plan.name}</h2>
                  </div>
                  <Banknote size={20} className="text-[#758078]" />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-[#f7f8f7] p-3">
                    <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-[#758078]">
                      <Users size={13} /> Entries
                    </p>
                    <p className="mt-1 text-xl font-bold">{plan.entryCount}</p>
                  </div>
                  <div className="rounded-md bg-[#f7f8f7] p-3">
                    <p className="text-[10px] font-bold uppercase text-[#758078]">
                      Payout pool
                    </p>
                    <p className="mt-1 text-xl font-bold">
                      {formatCurrency(plan.poolCents)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs font-semibold text-[#66716b]">
                  {plan.paybackPercent}% payback · {plan.goRoundsPercent}%
                  across {plan.numberOfRuns}{" "}
                  {plan.numberOfRuns === 1 ? "go" : "goes"} ·{" "}
                  {plan.aggregatePercent}% aggregate
                  {plan.shortRoundEnabled && plan.shortRoundPercent
                    ? ` · ${plan.shortRoundPercent}% short round`
                    : ""}
                </p>
              </header>
              {plan.placesByStage.go_round.length ? (
                <>
                  <PayoutBreakdown plan={plan} />
                  {plan.results.length ? <PayoutResults plan={plan} /> : null}
                </>
              ) : (
                <div className="p-6 text-center">
                  <p className="text-sm font-semibold">
                    No payout bracket applies yet
                  </p>
                  <p className="mt-1 text-xs text-[#758078]">
                    The current entry count is below the first configured
                    bracket.
                  </p>
                </div>
              )}
            </article>
          ))}
        </section>
      ) : (
        <section className="rounded-md border border-dashed border-[#cbd2ce] bg-white p-10 text-center">
          <p className="font-semibold">
            No payout plans are attached to this roping
          </p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#758078]">
            Assign payout schedules to class templates, side pots, and insurance
            pools. Existing ropings can then copy those rules without changing
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

function allocatePlaces(poolCents: number, places: PayoutPlace[]) {
  const amounts = places.map((place) =>
    Math.floor((poolCents * place.percentage) / 100),
  );
  const remainder =
    poolCents - amounts.reduce((sum, amount) => sum + amount, 0);
  if (amounts.length) amounts[0] += remainder;
  return amounts;
}

function PayoutResults({ plan }: { plan: PayoutPlan }) {
  const sections = Map.groupBy(plan.results, (result) =>
    result.sectionType === "aggregate"
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
                      {result.performanceSeconds.toFixed(3)} sec
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
