import Link from "next/link";
import { FileQuestion } from "lucide-react";

export function UnavailableRecord({ title = "This record is not available", description = "The link may be out of date, or the record may belong to another producer. Check the producer selected in the sidebar, then reopen the record from its list.", href = "/dashboard", label = "Return to dashboard" }: {
  title?: string; description?: string; href?: string; label?: string;
}) {
  return <section className="mx-auto w-full max-w-2xl space-y-4 rounded-lg border border-[#dfe4e1] bg-white p-5 sm:p-7"><FileQuestion size={28} aria-hidden="true" className="text-[#66716b]" /><h1 className="text-xl font-bold">{title}</h1><p className="text-sm leading-6 text-[#526059]">{description}</p><Link href={href} className="inline-flex min-h-11 items-center rounded-md brand-primary-fill px-4 text-sm font-semibold text-white">{label}</Link></section>;
}
