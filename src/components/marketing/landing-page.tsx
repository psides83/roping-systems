import Image from "next/image";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
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
    title: "Member management, made simpler",
    description:
      "Keep member profiles, applications, eligibility, and history in one place, so your team can find what it needs.",
  },
  {
    icon: CalendarDays,
    title: "Less work planning each event",
    description:
      "Build schedules, reuse event formats, and accept registrations online or in person without starting from scratch each time.",
  },
  {
    icon: Clock3,
    title: "A more organized event day",
    description:
      "Give staff a shared place to manage participants, record results, and track payments while the event is underway.",
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
      <section className="relative min-h-[540px] overflow-hidden bg-[#17201c] text-white sm:h-[88svh] sm:min-h-[620px] sm:max-h-[760px]">
        <Image
          src="/roping-arena-hero.jpg"
          alt="A calf roping competition underway in a professionally managed arena"
          fill
          priority
          sizes="100vw"
          className="object-cover object-[68%_center]"
        />
        <div className="absolute inset-0 bg-[#101713]/65" />

        <div className="relative z-10 mx-auto flex min-h-[88svh] max-w-[1240px] flex-col px-5 sm:h-full sm:min-h-0 sm:px-8 lg:px-10">
          <header className="flex h-24 shrink-0 items-center justify-between gap-3 border-b border-white/20 sm:h-28">
            <Link href="/" className="shrink-0">
              <BrandLogo className="w-32 sm:w-40" />
            </Link>
            <nav
              aria-label="Main navigation"
              className="hidden items-center gap-8 text-sm font-semibold text-white/80 md:flex"
            >
              <a href="#operations" className="hover:text-white">
                Features
              </a>
              <a href="#live-results" className="hover:text-white">
                Live results
              </a>
              <a href="#producers" className="hover:text-white">
                For organizations
              </a>
            </nav>
            <Link
              href="/auth/login"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-white/45 bg-black/15 px-4 text-sm font-bold text-white hover:bg-white hover:text-[#17201c]"
            >
              <LogIn size={16} aria-hidden="true" /> Sign in
            </Link>
          </header>

          <div className="flex flex-1 items-center py-6 sm:py-14">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase text-[#ffd7cd]">
                For roping organizations and event teams
              </p>
              <h1 className="mt-4">
                <span className="sr-only">Roping Systems</span>
                <BrandLogo className="w-[280px] max-w-full sm:w-[360px]" decorative />
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-white/85 sm:text-xl sm:leading-8">
                Bring your members, events, and results together. Spend less
                time managing spreadsheets and more time running your organization.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/auth/login"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-[#c5432a] px-5 text-sm font-bold text-white hover:bg-[#ad3823]"
                >
                  Sign in to your account <ArrowRight size={17} />
                </Link>
                <a
                  href="#operations"
                  className="inline-flex h-12 items-center justify-center rounded-md border border-white/45 bg-black/15 px-5 text-sm font-bold text-white hover:bg-white hover:text-[#17201c]"
                >
                  Explore the features
                </a>
              </div>
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-3 border-t border-white/20 py-5 text-xs font-semibold text-white/75 sm:text-sm">
            <span>Connected records</span>
            <span className="text-center">Organized events</span>
            <span className="text-right">Live results</span>
          </div>
        </div>
      </section>

      <section id="producers" className="border-b border-[#d8ded9] bg-white">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-10 lg:py-20">
          <div>
            <p className="text-xs font-bold uppercase text-[#a93420]">
              One place for your organization
            </p>
            <h2 className="mt-3 max-w-md text-3xl font-black leading-tight sm:text-4xl">
              Less paperwork. A clearer picture.
            </h2>
          </div>
          <div className="grid gap-6 border-l-0 border-[#d8ded9] lg:grid-cols-2 lg:border-l lg:pl-10">
            <p className="text-base leading-7 text-[#59645e]">
              When member lists, registrations, and results live in separate
              spreadsheets, keeping everything up to date takes extra work.
              Roping Systems brings those records together for your team.
            </p>
            <p className="text-base leading-7 text-[#59645e]">
              Your staff can work from shared information, and your members
              can find schedules, enter events, and follow results online.
              Set things up to suit the way your organization operates.
            </p>
          </div>
        </div>
      </section>

      <section id="operations" className="bg-[#f4f5f3] py-20 lg:py-24">
        <div className="mx-auto max-w-[1240px] px-5 sm:px-8 lg:px-10">
          <div className="grid gap-14 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase text-[#a93420]">
                Members. Events. Results.
              </p>
              <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">
                Keep your team and your events connected.
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
              Keep members and spectators informed.
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="border-t border-white/25 pt-5">
              <CalendarDays size={21} className="text-[#ff9d87]" />
              <h3 className="mt-4 font-bold">Public event schedules</h3>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Make it easy to find upcoming events, locations, and start
                times, with schedule changes reflected online.
              </p>
            </div>
            <div className="border-t border-white/25 pt-5">
              <Radio size={21} className="text-[#ff9d87]" />
              <h3 className="mt-4 font-bold">Results without the wait</h3>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Let participants follow results as the event progresses,
                then publish official results after your team has reviewed them.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-[#d8ded9] bg-white">
        <div className="mx-auto grid max-w-[1240px] divide-y divide-[#d8ded9] px-5 sm:px-8 md:grid-cols-3 md:divide-x md:divide-y-0 lg:px-10">
          <ValueItem
            icon={ShieldCheck}
            title="The right access for your team"
            text="Give staff the permissions they need while keeping your organization's records separate."
          />
          <ValueItem
            icon={ClipboardList}
            title="Flexible enough for your organization"
            text="Adapt event formats, eligibility, fees, and payouts to your rules and requirements."
          />
          <ValueItem
            icon={Search}
            title="Clear records and accountability"
            text="Track payments and payouts, and see who made changes to important records."
          />
        </div>
      </section>

      <section className="bg-[#eef0ed]">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <div>
            <p className="text-xs font-bold uppercase text-[#a93420]">
              Already part of an organization?
            </p>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">
              Your team, members, and events. All together.
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
          <Link href="/"><BrandLogo className="w-36" /></Link>
          <span>Member management, event planning, and live results.</span>
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
            <p className="text-sm font-bold">Fall Classic</p>
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
            Competition order
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
          <span>Results updated during the event</span>
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
