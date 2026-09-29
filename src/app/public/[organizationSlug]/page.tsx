import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  MapPin,
  Radio,
} from "lucide-react";
import { PublicResultsRefresh } from "@/components/public-results-refresh";
import { ropings as demoRopings } from "@/data/demo";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { getBrandStyle } from "@/lib/branding";

interface PublicEvent {
  id: string;
  title: string;
  slug: string;
  startsAt: string;
  venue: string;
  address: string;
  status: string;
  resultStatus: string;
  entriesOpenAt: string | null;
  entriesCloseAt: string | null;
}

interface PublicResult {
  resultId: string;
  divisionId: string;
  divisionName: string;
  resultStatus: string;
  name: string;
  entryNumber: number;
  totalTime: number | null;
  incentiveAdjustment: number;
  status: string;
  roundsCompleted: number;
  mainRoundCount: number;
  shortRoundQualifier: boolean;
}

function getAggregatePlace(results: PublicResult[], result: PublicResult) {
  const hasShortRound = results.some((row) => row.shortRoundQualifier);
  const placed = results.filter(
    (row) =>
      row.status === "complete" && (!hasShortRound || row.shortRoundQualifier),
  );
  const index = placed.findIndex((row) => row.resultId === result.resultId);
  return index < 0 ? null : index + 1;
}

async function getPublicData(organizationSlug: string) {
  if (!isSupabaseConfigured()) {
    const events: PublicEvent[] = demoRopings.map((event) => ({
      id: event.id,
      title: event.title,
      slug: event.id,
      startsAt: event.date,
      venue: event.location.split(",")[0],
      address: event.location.split(",").slice(1).join(",").trim(),
      status: event.status,
      resultStatus: event.resultStatus ?? "unofficial",
      entriesOpenAt: null,
      entriesCloseAt: null,
    }));
    return {
      organization: {
        name: "Red River Calf Ropers",
        slug: organizationSlug,
        logoUrl: null as string | null,
        brandPrimary: "#17251F",
        brandAccent: "#BB3E24",
      },
      events,
      results: [
        {
          resultId: "1",
          divisionId: "calf-open",
          divisionName: "Calf roping · Open",
          resultStatus: "unofficial",
          name: "Jace Holloway",
          entryNumber: 1,
          totalTime: 19.42,
          incentiveAdjustment: 0,
          status: "complete",
          roundsCompleted: 2,
          mainRoundCount: 2,
          shortRoundQualifier: true,
        },
        {
          resultId: "2",
          divisionId: "calf-open",
          divisionName: "Calf roping · Open",
          resultStatus: "unofficial",
          name: "Wyatt James",
          entryNumber: 1,
          totalTime: 19.71,
          incentiveAdjustment: 1.5,
          status: "complete",
          roundsCompleted: 2,
          mainRoundCount: 2,
          shortRoundQualifier: true,
        },
        {
          resultId: "3",
          divisionId: "calf-open",
          divisionName: "Calf roping · Open",
          resultStatus: "unofficial",
          name: "Mason Cole",
          entryNumber: 2,
          totalTime: 20.02,
          incentiveAdjustment: 1,
          status: "complete",
          roundsCompleted: 2,
          mainRoundCount: 2,
          shortRoundQualifier: false,
        },
        {
          resultId: "4",
          divisionId: "calf-open",
          divisionName: "Calf roping · Open",
          resultStatus: "unofficial",
          name: "Travis Dean",
          entryNumber: 1,
          totalTime: 20.31,
          incentiveAdjustment: 0,
          status: "complete",
          roundsCompleted: 2,
          mainRoundCount: 2,
          shortRoundQualifier: false,
        },
      ] as PublicResult[],
    };
  }

  const supabase = await createClient();
  const { data: organization } = await supabase
    .from("public_organization_pages")
    .select("id, public_name, slug, logo_path, brand_primary, brand_accent")
    .eq("slug", organizationSlug)
    .single();
  if (!organization) return null;
  const { data: schedule, error: scheduleError } = await supabase
    .from("public_roping_schedule")
    .select(
      "id, title, slug, venue_name, address, starts_at, entries_open_at, entries_close_at, status, result_status",
    )
    .eq("organization_id", organization.id)
    .order("starts_at", { ascending: false });
  if (scheduleError)
    throw new Error(
      `Unable to load the public schedule: ${scheduleError.message}`,
    );
  const liveEvent =
    schedule.find((event) => event.status === "in_progress") ??
    schedule.find((event) => event.status === "completed");
  let results: PublicResult[] = [];
  if (liveEvent) {
    const { data: resultRows, error: resultError } = await supabase
      .from("public_aggregate_results")
      .select(
        "result_id, division_id, division_name, result_status, first_name, last_name, entry_number, aggregate_time_seconds, incentive_adjustment_seconds, status, main_rounds_completed, main_round_count, is_short_round_qualifier",
      )
      .eq("organization_slug", organizationSlug)
      .eq("roping_slug", liveEvent.slug)
      .order("is_short_round_qualifier", { ascending: false })
      .order("aggregate_time_seconds", { ascending: true, nullsFirst: false });
    if (resultError)
      throw new Error(`Unable to load public results: ${resultError.message}`);
    results = resultRows.map((row) => ({
      resultId: row.result_id,
      divisionId: row.division_id,
      divisionName: row.division_name,
      resultStatus: row.result_status,
      name: `${row.first_name} ${row.last_name}`.trim(),
      entryNumber: row.entry_number,
      totalTime:
        row.aggregate_time_seconds === null
          ? null
          : Number(row.aggregate_time_seconds),
      incentiveAdjustment: Number(row.incentive_adjustment_seconds),
      status: row.status,
      roundsCompleted: row.main_rounds_completed,
      mainRoundCount: row.main_round_count,
      shortRoundQualifier: row.is_short_round_qualifier,
    }));
  }
  const events: PublicEvent[] = schedule.map((event) => ({
    id: event.id,
    title: event.title,
    slug: event.slug,
    startsAt: event.starts_at,
    venue: event.venue_name ?? "Location pending",
    address: event.address ?? "",
    status: event.status,
    resultStatus: event.result_status,
    entriesOpenAt: event.entries_open_at,
    entriesCloseAt: event.entries_close_at,
  }));
  const logoUrl = organization.logo_path
    ? supabase.storage
        .from("organization-logos")
        .getPublicUrl(organization.logo_path).data.publicUrl
    : null;
  return {
    organization: {
      name: organization.public_name,
      slug: organization.slug,
      logoUrl,
      brandPrimary: organization.brand_primary,
      brandAccent: organization.brand_accent,
    },
    events,
    results,
  };
}

export default async function OrganizationPublicPage({
  params,
}: PageProps<"/public/[organizationSlug]">) {
  const { organizationSlug } = await params;
  const data = await getPublicData(organizationSlug);
  if (!data) notFound();
  const liveEvent =
    data.events.find((event) => event.status === "in_progress") ??
    data.events.find((event) => event.status === "completed");
  const upcoming = data.events.filter((event) =>
    ["scheduled", "entries_open", "entries_closed"].includes(event.status),
  );
  const groupedResults = Map.groupBy(
    data.results,
    (result) => result.divisionId,
  );
  const displayDate = (value: string) =>
    Number.isNaN(Date.parse(value))
      ? value
      : new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
          new Date(value),
        );
  const entriesAreOpen = (event: PublicEvent) =>
    !["entries_closed", "in_progress", "completed", "cancelled"].includes(
      event.status,
    ) &&
    (!event.entriesOpenAt || new Date(event.entriesOpenAt) <= new Date()) &&
    (!event.entriesCloseAt || new Date(event.entriesCloseAt) > new Date());

  return (
    <main
      style={getBrandStyle(
        data.organization.brandPrimary,
        data.organization.brandAccent,
      )}
      className="min-h-screen bg-[#f5f6f7]"
    >
      {isSupabaseConfigured() ? <PublicResultsRefresh /> : null}
      <header className="border-b border-[#dfe4e1] brand-primary-fill text-white">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href={`/public/${organizationSlug}`}
            className="flex min-w-0 items-center gap-3"
          >
            {data.organization.logoUrl ? (
              <span className="grid h-11 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-white p-1">
                <Image
                  src={data.organization.logoUrl}
                  alt={`${data.organization.name} logo`}
                  width={48}
                  height={36}
                  unoptimized
                  className="h-full w-full object-contain"
                />
              </span>
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md brand-accent-fill text-sm font-black">
                {data.organization.name
                  .split(" ")
                  .slice(0, 2)
                  .map((word: string) => word[0])
                  .join("")}
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate font-bold">
                {data.organization.name}
              </span>
              <span className="hidden text-xs brand-muted sm:block">
                Official event information
              </span>
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-3 text-xs font-semibold brand-muted sm:gap-5 sm:text-sm">
            <a href="#schedule" className="brand-hover">
              Schedule
            </a>
            <a href="#results" className="brand-hover">
              Results
            </a>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 sm:py-12">
        {liveEvent ? (
          <section className="border-b border-[#d7ddda] pb-8">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-xs font-bold uppercase text-[var(--brand-accent-strong)]">
                  <Radio size={14} />{" "}
                  {liveEvent.status === "in_progress"
                    ? "Live event"
                    : "Latest results"}
                </p>
                <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
                  {liveEvent.title}
                </h1>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#66716b]">
                  <span className="flex items-center gap-2">
                    <CalendarDays size={16} /> {displayDate(liveEvent.startsAt)}
                  </span>
                  <span className="flex items-center gap-2">
                    <MapPin size={16} />{" "}
                    {[liveEvent.venue, liveEvent.address]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </div>
              </div>
              <div
                className={`w-fit rounded-md border px-4 py-3 ${liveEvent.resultStatus === "official" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
              >
                <p
                  className={`text-xs font-bold uppercase ${liveEvent.resultStatus === "official" ? "text-emerald-700" : "text-amber-700"}`}
                >
                  Results status
                </p>
                <p className="mt-1 flex items-center gap-2 text-sm font-bold">
                  <Clock3 size={15} />{" "}
                  {liveEvent.resultStatus === "official"
                    ? "Official results"
                    : "Unofficial · updating live"}
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section>
            <h1 className="text-3xl font-bold">{data.organization.name}</h1>
            <p className="mt-3 text-sm text-[#66716b]">
              Schedule and published results
            </p>
          </section>
        )}
        <section id="results">
          <div>
            <h2 className="text-xl font-bold">Results</h2>
            <p className="mt-1 text-sm text-[#66716b]">
              {data.results.length
                ? `${data.results.length} entries in the live aggregate`
                : "No aggregate results yet"}
            </p>
          </div>
          <div className="mt-4 space-y-5">
            {Array.from(groupedResults.values()).map((results) => (
              <div
                key={results[0].divisionId}
                className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white"
              >
                <div className="border-b border-[#e7ebe8] px-4 py-4 sm:px-5">
                  <h3 className="font-bold">{results[0].divisionName}</h3>
                  <p className="mt-1 text-xs font-semibold text-[#758078]">
                    {results[0].resultStatus === "official"
                      ? "Official"
                      : "Unofficial"}
                  </p>
                </div>
                <table className="w-full table-fixed text-left sm:table-auto">
                  <thead className="bg-[#f0f2f1] text-[10px] font-bold uppercase text-[#66716b] sm:text-[11px]">
                    <tr>
                      <th className="w-14 px-3 py-3 sm:w-20 sm:px-5">Place</th>
                      <th className="px-2 py-3 sm:px-5">Contestant</th>
                      <th className="w-14 px-2 py-3 sm:w-auto sm:px-5">
                        Entry
                      </th>
                      <th className="w-16 px-3 py-3 text-right sm:w-auto sm:px-5">
                        Aggregate
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e7ebe8]">
                    {results.map((result) => (
                      <tr key={result.resultId}>
                        <td className="px-3 py-4 sm:px-5">
                          <span
                            className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${getAggregatePlace(results, result) === 1 ? "bg-[#e0a458] text-[#38220c]" : "bg-[#eef1ef] text-[#526058]"}`}
                          >
                            {getAggregatePlace(results, result) ?? "-"}
                          </span>
                        </td>
                        <td className="px-2 py-4 text-sm font-semibold leading-5 sm:px-5">
                          {result.name}
                          {result.incentiveAdjustment ? (
                            <span className="mt-1 block text-[10px] font-bold text-emerald-700">
                              -{result.incentiveAdjustment.toFixed(3)} sec
                              incentive
                            </span>
                          ) : null}
                          <span className="mt-1 block text-[10px] font-semibold text-[#758078]">
                            {result.roundsCompleted}/{result.mainRoundCount}{" "}
                            main rounds
                            {result.shortRoundQualifier
                              ? " · Short round qualifier"
                              : ""}
                          </span>
                        </td>
                        <td className="px-2 py-4 text-sm text-[#66716b] sm:px-5">
                          #{result.entryNumber}
                        </td>
                        <td className="px-3 py-4 text-right font-mono text-sm font-bold sm:px-5 sm:text-base">
                          {result.totalTime !== null
                            ? result.totalTime.toFixed(3)
                            : result.status === "no_time"
                              ? "NT"
                              : result.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
        <section id="schedule" className="border-t border-[#d7ddda] pt-8">
          <h2 className="text-xl font-bold">Upcoming ropings</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {upcoming.map((event) => {
              const open = entriesAreOpen(event);
              return (
                <article
                  key={event.id}
                  className="rounded-md border border-[#dfe4e1] bg-white p-5"
                >
                  <p className="text-xs font-bold uppercase text-[var(--brand-accent-strong)]">
                    {displayDate(event.startsAt)}
                  </p>
                  <h3 className="mt-2 font-bold">{event.title}</h3>
                  <p className="mt-2 flex items-center gap-2 text-sm text-[#66716b]">
                    <MapPin size={15} />{" "}
                    {[event.venue, event.address].filter(Boolean).join(", ")}
                  </p>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p
                      className={`flex items-center gap-2 text-xs font-semibold ${open ? "text-emerald-700" : "text-[#66716b]"}`}
                    >
                      {open ? <CheckCircle2 size={14} /> : null}
                      {open
                        ? "Entries open"
                        : event.status === "entries_closed"
                          ? "Entries closed"
                          : "Scheduled"}
                    </p>
                    {open && isSupabaseConfigured() ? (
                      <Link
                        href={`/public/${organizationSlug}/${event.slug}/enter`}
                        className="flex h-9 items-center gap-2 rounded-md brand-accent-fill px-3 text-xs font-bold text-white"
                      >
                        Enter online <ArrowRight size={14} />
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {!upcoming.length ? (
              <p className="text-sm text-[#758078]">
                No upcoming ropings are published.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
