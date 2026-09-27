import Link from "next/link";
import { CalendarDays, CheckCircle2, Clock3, MapPin, Radio } from "lucide-react";

const results = [
  { place: 1, name: "Jace Holloway", entry: 1, time: "9.42" },
  { place: 2, name: "Wyatt James", entry: 1, time: "9.71" },
  { place: 3, name: "Mason Cole", entry: 2, time: "10.02" },
  { place: 4, name: "Travis Dean", entry: 1, time: "10.31" },
];

export default async function OrganizationPublicPage({ params }: PageProps<"/public/[organizationSlug]">) {
  const { organizationSlug } = await params;

  return (
    <main className="min-h-screen bg-[#f5f6f7]">
      <header className="border-b border-[#dfe4e1] bg-[#17251f] text-white">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href={`/public/${organizationSlug}`} className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md bg-[#bb3e24] text-sm font-black">RR</span><span><span className="block font-bold">Red River Calf Ropers</span><span className="text-xs text-white/55">Official event information</span></span></Link>
          <nav className="flex items-center gap-5 text-sm font-semibold text-white/70"><a href="#schedule" className="hover:text-white">Schedule</a><a href="#results" className="hover:text-white">Results</a></nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-6 sm:py-12">
        <section className="border-b border-[#d7ddda] pb-8"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="flex items-center gap-2 text-xs font-bold uppercase text-[#bb3e24]"><Radio size={14} /> Live event</p><h1 className="mt-3 text-3xl font-bold sm:text-4xl">Fall Classic</h1><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[#66716b]"><span className="flex items-center gap-2"><CalendarDays size={16} /> September 27, 2026</span><span className="flex items-center gap-2"><MapPin size={16} /> Red River Arena, Wichita Falls</span></div></div><div className="w-fit rounded-md border border-amber-200 bg-amber-50 px-4 py-3"><p className="text-xs font-bold uppercase text-amber-700">Results status</p><p className="mt-1 flex items-center gap-2 text-sm font-bold text-amber-900"><Clock3 size={15} /> Unofficial · updating live</p></div></div></section>
        <section id="results"><div className="flex items-end justify-between"><div><h2 className="text-xl font-bold">Open Division</h2><p className="mt-1 text-sm text-[#66716b]">Round 1 · 19 of 34 runs complete</p></div><p className="text-xs text-[#758078]">Updated moments ago</p></div><div className="mt-4 overflow-hidden rounded-md border border-[#dfe4e1] bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left"><thead className="bg-[#f0f2f1] text-[11px] font-bold uppercase text-[#66716b]"><tr><th className="w-20 px-5 py-3">Place</th><th className="px-5 py-3">Contestant</th><th className="px-5 py-3">Entry</th><th className="px-5 py-3 text-right">Time</th></tr></thead><tbody className="divide-y divide-[#e7ebe8]">{results.map((result) => <tr key={`${result.name}-${result.entry}`}><td className="px-5 py-4"><span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-bold ${result.place === 1 ? "bg-[#e0a458] text-[#38220c]" : "bg-[#eef1ef] text-[#526058]"}`}>{result.place}</span></td><td className="px-5 py-4 text-sm font-semibold">{result.name}</td><td className="px-5 py-4 text-sm text-[#66716b]">#{result.entry}</td><td className="px-5 py-4 text-right font-mono text-base font-bold">{result.time}</td></tr>)}</tbody></table></div><div className="border-t border-[#e7ebe8] bg-[#fafbfa] px-5 py-3 text-xs text-[#758078]">Results remain unofficial until finalized by Red River Calf Ropers.</div></div></section>
        <section id="schedule" className="border-t border-[#d7ddda] pt-8"><h2 className="text-xl font-bold">Upcoming ropings</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><article className="rounded-md border border-[#dfe4e1] bg-white p-5"><p className="text-xs font-bold uppercase text-[#bb3e24]">Oct 11, 2026</p><h3 className="mt-2 font-bold">October Series Roping</h3><p className="mt-2 flex items-center gap-2 text-sm text-[#66716b]"><MapPin size={15} /> Circle T Arena, Hamilton</p><p className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} /> Entries open</p></article><article className="rounded-md border border-[#dfe4e1] bg-white p-5"><p className="text-xs font-bold uppercase text-[#bb3e24]">Nov 14, 2026</p><h3 className="mt-2 font-bold">Turkey Run</h3><p className="mt-2 flex items-center gap-2 text-sm text-[#66716b]"><MapPin size={15} /> Red River Arena, Wichita Falls</p><p className="mt-4 text-xs font-semibold text-[#66716b]">Entries open October 20</p></article></div></section>
      </div>
    </main>
  );
}
