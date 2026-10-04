import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[minmax(420px,560px)_1fr]">
      <section className="flex min-h-screen flex-col px-6 py-7 sm:px-12 lg:px-16">
        <Link href="/" className="flex w-fit items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-md brand-accent-fill text-sm font-black text-white">RS</span><span><span className="block text-sm font-bold">Roping Systems</span><span className="block text-[11px] text-[#758078]">Event operations</span></span></Link>
        <div className="my-auto py-12">{children}</div>
        <p className="text-xs text-[#8a938e]">Built for producers that keep the sport moving.</p>
      </section>
      <aside className="relative hidden overflow-hidden brand-primary-fill lg:block">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(#ffffff12 1px, transparent 1px), linear-gradient(90deg, #ffffff12 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
        <div className="relative flex h-full flex-col justify-end p-16 text-white"><p className="max-w-xl text-4xl font-bold leading-tight">Entries, draws, times, and results in one dependable event desk.</p><div className="mt-8 flex gap-8 border-t border-white/15 pt-6 text-sm brand-muted"><span>Producer-based access</span><span>Live public results</span><span>Flexible divisions</span></div></div>
      </aside>
    </main>
  );
}
