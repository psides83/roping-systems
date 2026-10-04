import { Download, Eye, LockKeyhole } from "lucide-react";
import { LiveEventDesk } from "@/components/live-event-desk";
import { PageHeader } from "@/components/ui/page-header";

export default function CurrentRopingPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Live · Fall Classic" title="Event desk" description="Enter times, manage the draw, and publish live unofficial results as the roping progresses." actions={<><button aria-label="Preview public results" className="grid h-10 w-10 place-items-center rounded-md border border-[#d7ddda] bg-white"><Eye size={17} /></button><button aria-label="Export event" className="grid h-10 w-10 place-items-center rounded-md border border-[#d7ddda] bg-white"><Download size={17} /></button><button className="flex h-10 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold"><LockKeyhole size={16} /> Finalize</button></>} />
      <LiveEventDesk />
    </div>
  );
}
