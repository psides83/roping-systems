import { notFound } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { DatabaseLiveDesk, type LiveRunRow } from "@/components/ropings/database-live-desk";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveOrganization } from "@/lib/organizations";
import { createClient } from "@/lib/supabase/server";
import { finalizeRoping, startRoping } from "@/app/(app)/ropings/[ropingId]/actions";

export default async function LiveRopingPage({ params, searchParams }: PageProps<"/ropings/[ropingId]/live">) {
  const { ropingId } = await params;
  const query = await searchParams;
  const organization = await getActiveOrganization();
  if (!organization) notFound();
  const supabase = await createClient();
  const { data: roping } = await supabase.from("ropings").select("id, title, status, result_status, roping_divisions!roping_divisions_roping_id_fkey(id, name, sort_order, timer_count, timer_resolution)").eq("id", ropingId).eq("organization_id", organization.id).single();
  if (!roping) notFound();
  const divisions = (roping.roping_divisions as unknown as Array<{ id: string; name: string; sort_order: number; timer_count: number; timer_resolution: "average" | "best" | "longest" }>).sort((a, b) => a.sort_order - b.sort_order);
  const requestedDivision = typeof query.division === "string" ? query.division : undefined;
  const selectedDivisionId = divisions.some((division) => division.id === requestedDivision) ? requestedDivision! : divisions[0]?.id;
  let runs: LiveRunRow[] = [];
  if (selectedDivisionId) {
    const { data: runData, error } = await supabase.from("runs").select("id, draw_position, raw_time_seconds, penalty_seconds, status, entries!runs_entry_id_fkey!inner(entry_number, people!inner(first_name, last_name))").eq("roping_division_id", selectedDivisionId).eq("run_number", 1).order("draw_position", { ascending: true, nullsFirst: false });
    if (error) throw new Error(`Unable to load the event desk: ${error.message}`);
    runs = runData.map((run) => { const entry = run.entries as unknown as { entry_number: number; people: { first_name: string; last_name: string } }; return { id: run.id, drawPosition: run.draw_position, name: `${entry.people.first_name} ${entry.people.last_name}`, entryNumber: entry.entry_number, rawTime: run.raw_time_seconds === null ? null : Number(run.raw_time_seconds), penalty: Number(run.penalty_seconds), status: run.status }; });
  }
  const startAction = startRoping.bind(null, ropingId);
  const finalizeAction = finalizeRoping.bind(null, ropingId);
  const selectedDivision = divisions.find((division) => division.id === selectedDivisionId);

  return <div className="space-y-6"><PageHeader eyebrow={`Event desk · ${roping.status.replaceAll("_", " ")}`} title={roping.title} description="Manage draws and record results. Saved runs are published to the live results page when this event is public." actions={<div className="flex gap-2">{roping.status !== "in_progress" && roping.status !== "completed" ? <form action={startAction}><button className="h-10 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white">Start event</button></form> : null}{roping.status === "in_progress" ? <form action={finalizeAction}><button className="flex h-10 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold"><LockKeyhole size={16} /> Finalize</button></form> : null}</div>} />{selectedDivisionId && selectedDivision ? <DatabaseLiveDesk ropingId={ropingId} divisions={divisions} selectedDivisionId={selectedDivisionId} runs={runs} timerCount={selectedDivision.timer_count} timerResolution={selectedDivision.timer_resolution} /> : <div className="rounded-md border border-dashed border-[#cbd2ce] bg-white p-12 text-center"><p className="font-semibold">This event has no divisions.</p></div>}</div>;
}
