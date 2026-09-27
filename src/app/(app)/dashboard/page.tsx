import Link from "next/link";
import { ArrowRight, CalendarDays, CircleDollarSign, Clock3, Plus, UserCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StatusPill } from "@/components/ui/status-pill";
import { ropings } from "@/data/demo";

const stats = [
  { label: "Active members", value: "248", detail: "+12 this season", icon: Users, color: "bg-emerald-50 text-emerald-700" },
  { label: "Upcoming ropings", value: "3", detail: "Next on October 11", icon: CalendarDays, color: "bg-sky-50 text-sky-700" },
  { label: "Open entries", value: "42", detail: "$4,830 expected", icon: UserCheck, color: "bg-amber-50 text-amber-700" },
  { label: "Entries today", value: "86", detail: "Across 3 divisions", icon: CircleDollarSign, color: "bg-rose-50 text-rose-700" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-7">
      <PageHeader eyebrow="Sunday, September 27" title="Good afternoon, Payton" description="Fall Classic is in progress. Open the event desk to manage runs and publish live results." actions={<Link href="/ropings" className="flex h-10 items-center gap-2 rounded-md bg-[#17251f] px-4 text-sm font-semibold text-white hover:bg-[#263c32]"><Plus size={17} /> New roping</Link>} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return <div key={stat.label} className="rounded-md border border-[#dfe4e1] bg-white p-5"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-[#66716b]">{stat.label}</p><p className="mt-2 text-3xl font-bold text-[#17201c]">{stat.value}</p></div><span className={`grid h-10 w-10 place-items-center rounded-md ${stat.color}`}><Icon size={19} /></span></div><p className="mt-3 text-xs text-[#7b857f]">{stat.detail}</p></div>;
        })}
      </section>

      <section className="overflow-hidden rounded-md border border-[#e0c2b9] bg-white">
        <div className="flex flex-col gap-4 border-b border-[#ead7d1] bg-[#fff8f5] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#bb3e24] ring-4 ring-[#f7d9d0]" /><div><p className="text-xs font-bold uppercase text-[#a23a23]">Live now</p><h2 className="mt-1 text-lg font-bold">Fall Classic</h2><p className="mt-1 text-sm text-[#66716b]">Open Division · Run 20 of 34</p></div></div>
          <Link href="/ropings/current" className="flex h-10 items-center justify-center gap-2 rounded-md bg-[#bb3e24] px-4 text-sm font-semibold text-white hover:bg-[#91301c]">Open event desk <ArrowRight size={16} /></Link>
        </div>
        <div className="grid divide-y divide-[#e7ebe8] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <div className="p-5"><p className="text-xs font-semibold uppercase text-[#7b857f]">On deck</p><p className="mt-2 font-semibold">Mason Cole</p><p className="mt-1 text-sm text-[#66716b]">Draw 20 · Entry 1</p></div>
          <div className="p-5"><p className="text-xs font-semibold uppercase text-[#7b857f]">Division leader</p><p className="mt-2 font-semibold">Jace Holloway</p><p className="mt-1 text-sm text-[#66716b]">9.42 seconds</p></div>
          <div className="p-5"><p className="text-xs font-semibold uppercase text-[#7b857f]">Public results</p><p className="mt-2 font-semibold text-amber-700">Unofficial · Live</p><p className="mt-1 text-sm text-[#66716b]">Updated moments ago</p></div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <section className="rounded-md border border-[#dfe4e1] bg-white">
          <div className="flex items-center justify-between border-b border-[#e7ebe8] px-5 py-4"><div><h2 className="font-bold">Roping schedule</h2><p className="mt-1 text-xs text-[#758078]">Recent and upcoming events</p></div><Link href="/ropings" className="text-sm font-semibold text-[#a83720]">View all</Link></div>
          <div className="divide-y divide-[#e7ebe8]">
            {ropings.slice(0, 3).map((roping) => <Link href={roping.status === "in_progress" ? "/ropings/current" : "/ropings"} key={roping.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[#fafbfa]"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-[#f0f2f1] text-center"><span className="text-[10px] font-bold uppercase text-[#7b857f]">{roping.date.split(" ")[0]}</span><span className="-mt-1 text-lg font-bold">{roping.date.split(" ")[1].replace(",", "")}</span></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{roping.title}</p><p className="mt-1 truncate text-xs text-[#758078]">{roping.location}</p></div><StatusPill status={roping.status} /></Link>)}
          </div>
        </section>
        <section className="rounded-md border border-[#dfe4e1] bg-white p-5"><div className="flex items-center gap-2"><Clock3 size={18} className="text-[#bb3e24]" /><h2 className="font-bold">Needs attention</h2></div><div className="mt-4 space-y-4"><div className="border-l-2 border-amber-400 pl-3"><p className="text-sm font-semibold">7 memberships pending</p><p className="mt-1 text-xs leading-5 text-[#758078]">Applications are ready for review.</p></div><div className="border-l-2 border-rose-400 pl-3"><p className="text-sm font-semibold">12 unpaid entries</p><p className="mt-1 text-xs leading-5 text-[#758078]">Fall Classic cash payments need confirmation.</p></div><div className="border-l-2 border-sky-400 pl-3"><p className="text-sm font-semibold">October entries close soon</p><p className="mt-1 text-xs leading-5 text-[#758078]">Online entries close October 8.</p></div></div></section>
      </div>
    </div>
  );
}
