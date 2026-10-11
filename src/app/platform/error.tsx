"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section role="alert" className="space-y-4 py-8"><h1 className="text-xl font-bold">Unable to load platform administration</h1><p>Your account information was not changed. Try again.</p><button onClick={reset} className="rounded-md bg-[#3146a8] px-4 py-2 font-semibold text-white">Try again</button></section>;
}
