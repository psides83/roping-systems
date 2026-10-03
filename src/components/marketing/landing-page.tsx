import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ClipboardList,
  Clock3,
  LayoutDashboard,
  LogIn,
  Radio,
  Search,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

const operations = [
  {
    icon: UsersRound,
    title: "Memberships that stay useful",
    description:
      "Keep contact details, producer-specific member numbers, classification history, and eligibility together.",
  },
  {
    icon: CalendarDays,
    title: "Flexible roping schedules",
    description:
      "Build multi-day events across arenas with reusable formats, class-level fees, and clear start sequencing.",
  },
  {
    icon: Clock3,
    title: "A dependable live desk",
    description:
      "Take entries, set draws, record timer results, calculate standings, and publish updates while the roping runs.",
  },
];

const eventRows = [
  { draw: "18", name: "Mason Cole", time: "14.72", status: "Qualified" },
  { draw: "19", name: "Levi Grant", time: "15.06", status: "Qualified" },
  { draw: "20", name: "Caleb Ward", time: "NT", status: "No time" },
];

export function LandingPage() {
  return (
    <main className="min-h-screen bg-[#f4f5f3] text-[#17201c]">
      <section className="relative h-[88svh] min-h-[540px] max-h-[760px] overflow-hidden bg-[#17201c] text-white sm:min-h-[620px]">
        <Image
          src="/roping-arena-hero.jpg"
          alt="A calf roping competition underway in a professionally managed arena"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[68%_center]"
        />
        <div className="absolute inset-0 bg-[#101713]/65" />

        <div className="relative z-10 mx-auto flex h-full max-w-[1240px] flex-col px-5 sm:px-8 lg:px-10">
          <header className="flex h-20 shrink-0 items-center justify-between border-b border-white/20">
            <Link href="/" className="text-base font-black text-white">
              Roping Systems
            </Link>
            <nav
              aria-label="Main navigation"
              className="hidden items-center gap-8 text-sm font-semibold text-white/80 md:flex"
            >
              <a href="#operations" className="hover:text-white">
                Operations
              </a>
              <a href="#live-results" className="hover:text-white">
                Live results
              </a>
              <a href="#producers" className="hover:text-white">
                For producers
              </a>
            </nav>
            <Link
              href="/auth/login"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/45 bg-black/15 px-4 text-sm font-bold text-white hover:bg-white hover:text-[#17201c]"
            >
              <LogIn size={16} aria-hidden="true" /> Sign in
            </Link>
          </header>

          <div className="flex flex-1 items-center py-10 sm:py-14">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase text-[#ffd7cd]">
                Built for calf roping producers
              </p>
              <h1 className="mt-4 text-5xl font-black leading-[0.98] sm:text-6xl lg:text-7xl">
                Roping Systems
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-white/85 sm:text-xl">
                Run memberships, entries, draws, timing, payouts, and live
                results from one clear event desk.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/auth/login"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#c5432a] px-5 text-sm font-bold text-white hover:bg-[#ad3823]"
                >
                  Sign in to your account <ArrowRight size={17} />
                </Link>
                <Link
                  href="/auth/signup"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-white/45 bg-black/15 px-5 text-sm font-bold text-white hover:bg-white hover:text-[#17201c]"
                >
                  Create a producer account
                </Link>
              </div>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-3 border-t border-white/20 py-5 text-xs font-semibold text-white/75 sm:text-sm">
            <span>Flexible formats</span>
            <span className="text-center">Event-day control</span>
            <span className="text-right">Live public results</span>
          </div>
        </div>
      </section>

      <section id="producers" className="border-b border-[#d8ded9] bg-white">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10 lg:py-20">
          <div>
            <p className="text-xs font-bold uppercase text-[#a93420]">
              One operating system
            </p>
            <h2 className="mt-3 max-w-md text-3xl font-black leading-tight sm:text-4xl">
              Move the whole production beyond spreadsheets.
            </h2>
          </div>
          <div className="grid gap-6 border-l-0 border-[#d8ded9] lg:grid-cols-2 lg:border-l lg:pl-10">
            <p className="text-base leading-7 text-[#59645e]">
              Roping Systems follows the way producers actually work: an event
              can contain many separate ropings, each with its own class,
              rounds, fees, options, eligibility rules, and payout structure.
            </p>
            <p className="text-base leading-7 text-[#59645e]">
              Staff get a focused administrative workspace. Members get clean
              online entry, schedules, and live unofficial results without
              waiting days for updates.
            </p>
          </div>
        </div>
      </section>

      <section id="operations" className="bg-[#f4f5f3] py-20 lg:py-24">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8 lg:px-10">
          <div className="grid gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase text-[#a93420]">
                From setup to results
              </p>
              <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
                Built around the work at the entry desk.
              </h2>
              <div className="mt-9 divide-y divide-[#d6ddd8] border-y border-[#d6ddd8]">
                {operations.map((operation) => {
                  const Icon = operation.icon;
                  return (
                    <div key={operation.title} className="flex gap-4 py-6">
                      <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#17251f] text-white">
                        <Icon size={19} aria-hidden="true" />
                      </span>
                      <div>
                        <h3 className="font-bold">{operation.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-[#66716b]">
                          {operation.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <LiveDeskPreview />
          </div>
        </div>
      </section>

      <section id="live-results" className="bg-[#17251f] text-white">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:px-10 lg:py-24">
          <div>
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase text-[#ffb6a5]">
              <Radio size={15} /> Published as it happens
            </span>
            <h2 className="mt-4 max-w-lg text-3xl font-black leading-tight sm:text-4xl">
              Keep contestants and spectators current.
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="border-t border-white/25 pt-5">
              <CalendarDays size={21} className="text-[#ff9d87]" />
              <h3 className="mt-4 font-bold">Public event schedules</h3>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Show dates, arenas, set times, tentative times, and the roping
                each class follows.
              </p>
            </div>
            <div className="border-t border-white/25 pt-5">
              <Radio size={21} className="text-[#ff9d87]" />
              <h3 className="mt-4 font-bold">Live unofficial results</h3>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Publish standings immediately, then mark the final results
                official when the producer is ready.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#d8ded9] bg-white">
        <div className="mx-auto grid max-w-[1240px] divide-y divide-[#d8ded9] px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-10">
          <ValueItem
            icon={ShieldCheck}
            title="Producer-based access"
            text="Keep every member, event, and operational record inside the producer that owns it."
          />
          <ValueItem
            icon={ClipboardList}
            title="Rules that fit the roping"
            text="Configure divisions, classifications, incentives, timers, short rounds, fees, and payouts."
          />
          <ValueItem
            icon={Search}
            title="A complete change record"
            text="Review who changed important records and when the update was made."
          />
        </div>
      </section>

      <section className="bg-[#eef0ed]">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <div>
            <p className="text-xs font-bold uppercase text-[#a93420]">
              Producer access
            </p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              Your event desk is ready when you are.
            </h2>
          </div>
          <Link
            href="/auth/login"
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-md bg-[#c5432a] px-5 text-sm font-bold text-white hover:bg-[#ad3823]"
          >
            Sign in <ArrowRight size={17} />
          </Link>
        </div>
      </section>

      <footer className="bg-white">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 px-5 py-7 text-xs text-[#758078] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <span className="font-bold text-[#17201c]">Roping Systems</span>
          <span>Calf roping operations, from entries to official results.</span>
        </div>
      </footer>
    </main>
  );
}

function LiveDeskPreview() {
  return (
    <div className="overflow-hidden rounded-md border border-[#cbd3ce] bg-white shadow-[0_24px_70px_rgba(23,32,28,0.12)]">
      <div className="flex items-center justify-between border-b border-[#dfe4e1] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-md bg-[#17251f] text-white">
            <LayoutDashboard size={17} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase text-[#758078]">
              Live event desk
            </p>
            <p className="text-sm font-bold">Fall Classic · #11</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> Round 2
        </span>
      </div>
      <div className="grid grid-cols-3 border-b border-[#dfe4e1] bg-[#f7f8f7] px-4 py-4 sm:px-5">
        <Metric label="Entries" value="42" />
        <Metric label="Qualified" value="31" />
        <Metric label="Fast time" value="13.84" />
      </div>
      <div className="px-4 py-4 sm:px-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-bold uppercase text-[#758078]">
            Current draw
          </p>
          <span className="text-xs font-semibold text-[#66716b]">Arena 1</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[430px] text-left text-sm">
            <thead className="border-y border-[#dfe4e1] bg-[#fafbfa] text-[10px] font-bold uppercase text-[#758078]">
              <tr>
                <th className="px-3 py-2.5">Draw</th>
                <th className="px-3 py-2.5">Contestant</th>
                <th className="px-3 py-2.5">Time</th>
                <th className="px-3 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e9e6]">
              {eventRows.map((row) => (
                <tr key={row.draw}>
                  <td className="px-3 py-3 font-mono text-xs text-[#66716b]">
                    {row.draw}
                  </td>
                  <td className="px-3 py-3 font-semibold">{row.name}</td>
                  <td className="px-3 py-3 font-mono font-bold">{row.time}</td>
                  <td className="px-3 py-3">
                    <span
                      className={
                        row.status === "Qualified"
                          ? "text-xs font-semibold text-emerald-700"
                          : "text-xs font-semibold text-[#9b3522]"
                      }
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-[#dfe4e1] pt-4 text-xs text-[#66716b]">
          <span>Changes saved automatically</span>
          <span className="inline-flex items-center gap-1 font-bold text-[#17201c]">
            <Check size={13} /> Results live
          </span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase text-[#758078]">{label}</p>
      <p className="mt-1 text-xl font-black">{value}</p>
    </div>
  );
}

function ValueItem({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof ShieldCheck;
  title: string;
  text: string;
}) {
  return (
    <div className="py-10 md:px-8 md:first:pl-0 md:last:pr-0">
      <Icon size={21} className="text-[#a93420]" />
      <h3 className="mt-4 font-bold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#66716b]">{text}</p>
    </div>
  );
}
