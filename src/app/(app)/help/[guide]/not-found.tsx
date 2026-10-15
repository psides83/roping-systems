import Link from "next/link";
export default function GuideNotFound() {
  return <div className="mx-auto max-w-xl space-y-4 py-10"><h1 className="text-2xl font-bold">That guide could not be found</h1><p className="text-sm leading-6 text-[#66716b]">Browse the help library to find the task you need.</p><Link href="/help" className="inline-flex min-h-11 items-center rounded-md brand-primary-fill px-4 text-sm font-semibold text-white">Browse help &amp; guides</Link></div>;
}
