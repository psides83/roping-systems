import Link from "next/link";
import { ArrowLeft, Banknote, ClipboardList, LayoutDashboard, Radio } from "lucide-react";
import { NavigationPending } from "@/components/ui/navigation-pending";

export function EventWorkflowNav({ eventId, active }: { eventId: string; active: "event" | "entries" | "live" | "payouts" }) {
  const steps = [
    { id: "event", label: "Event", path: "", icon: LayoutDashboard },
    { id: "entries", label: "Entries", path: "/entries", icon: ClipboardList },
    { id: "live", label: "Live desk", path: "/live", icon: Radio },
    { id: "payouts", label: "Payouts", path: "/payouts", icon: Banknote },
  ];
  return <nav aria-label="Event workflow" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#dfe4e1] pb-3 text-sm font-semibold">
    <Link href="/events" className="inline-flex min-h-10 items-center gap-2 text-[#66716b]"><ArrowLeft size={16} />Events</Link>
    <div className="flex max-w-full gap-1 overflow-x-auto">{steps.map(({ id, label, path, icon: Icon }) => <Link key={id} href={`/events/${eventId}${path}`} aria-current={active === id ? "page" : undefined}
      className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 ${active === id ? "bg-[#eef1ef] text-[#17201c]" : "text-[#66716b] hover:bg-[#f5f7f6]"}`}><Icon size={16} /><span>{label}</span><NavigationPending label={`Loading ${label.toLowerCase()}`} /></Link>)}</div>
  </nav>;
}
