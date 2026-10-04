import { Clock3 } from "lucide-react";
import { updateDivisionTiming } from "./actions";
import { PageHeader } from "@/components/ui/page-header";
import { RopingSetupTabs } from "@/components/settings/roping-setup-tabs";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export default async function TimingSettingsPage() {
  const configured = isSupabaseConfigured();
  const producer = await getActiveProducer();
  const canEdit =
    configured && Boolean(producer && producer.role !== "viewer");
  let divisions: Array<{
    id: string;
    name: string;
    timer_count: number;
    timer_resolution: "average" | "best" | "longest";
  }> = [
    { id: "open", name: "Open", timer_count: 2, timer_resolution: "average" },
  ];
  if (configured && producer) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("roping_templates")
      .select("id, name, timer_count, timer_resolution")
      .eq("producer_id", producer.id)
      .eq("is_active", true)
      .order("sort_order");
    if (error)
      throw new Error(`Unable to load timing settings: ${error.message}`);
    divisions = data as typeof divisions;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Roping setup"
        title="Timing rules"
        description="Choose how many timer readings are entered for each run and how those readings become the official raw time."
      />
      <RopingSetupTabs active="timing" />
      <section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
        <header className="flex items-center gap-3 border-b border-[#e7ebe8] px-5 py-4">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-[#eef1ef]">
            <Clock3 size={18} />
          </span>
          <div>
            <h2 className="font-bold">Roping template timing defaults</h2>
            <p className="mt-1 text-xs text-[#758078]">
              Copied into new events so historical timing rules stay unchanged
            </p>
          </div>
        </header>
        <div className="divide-y divide-[#edf0ee]">
          {divisions.map((division) => (
            <form
              action={updateDivisionTiming}
              key={division.id}
              className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(180px,1fr)_150px_220px_auto] md:items-end"
            >
              <input type="hidden" name="divisionId" value={division.id} />
              <div>
                <p className="font-bold">{division.name}</p>
                <p className="mt-1 text-xs text-[#758078]">
                  Current: {division.timer_count} timer
                  {division.timer_count === 1 ? "" : "s"},{" "}
                  {division.timer_resolution}
                </p>
              </div>
              <label className="block text-xs font-bold uppercase text-[#66716b]">
                Number of timers
                <input
                  name="timerCount"
                  type="number"
                  min="1"
                  max="10"
                  defaultValue={division.timer_count}
                  disabled={!canEdit}
                  className="mt-2 h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal"
                />
              </label>
              <label className="block text-xs font-bold uppercase text-[#66716b]">
                Official time uses
                <select
                  name="timerResolution"
                  defaultValue={division.timer_resolution}
                  disabled={!canEdit}
                  className="mt-2 h-10 w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-normal normal-case"
                >
                  <option value="average">Average of all timers</option>
                  <option value="best">Best (fastest) timer</option>
                  <option value="longest">Longest timer</option>
                </select>
              </label>
              <button
                disabled={!canEdit}
                className="h-10 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                Save
              </button>
            </form>
          ))}
          {!divisions.length ? (
            <p className="p-8 text-center text-sm text-[#758078]">
              Create a roping template before setting timing rules.
            </p>
          ) : null}
        </div>
      </section>
      <div className="rounded-md border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
        Every individual timer reading is retained in the changelog. The
        resolved official time is what appears in results and receives
        penalties.
      </div>
    </div>
  );
}
