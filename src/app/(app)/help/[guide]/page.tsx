import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CircleHelp } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { findProducerGuide } from "@/lib/producer-help";

export async function generateMetadata({ params }: PageProps<"/help/[guide]">) {
  const guide = findProducerGuide((await params).guide);
  return { title: guide ? `${guide.title} | Help` : "Guide not found" };
}
export default async function GuidePage({ params }: PageProps<"/help/[guide]">) {
  const guide = findProducerGuide((await params).guide);
  if (!guide) notFound();
  return <article className="mx-auto max-w-4xl space-y-6">
    <Link href="/help" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#66716b]"><ArrowLeft size={16} />All guides</Link>
    <PageHeader eyebrow={guide.category} title={guide.title} description={guide.summary} />
    <section className="rounded-lg border border-[#dfe4e1] bg-white p-5 sm:p-6"><h2 className="font-bold">Before you start</h2><p className="mt-2 text-sm leading-7 text-[#526059]">{guide.before}</p></section>
    <section aria-labelledby="guide-steps" className="rounded-lg border border-[#dfe4e1] bg-white p-5 sm:p-6"><h2 id="guide-steps" className="text-lg font-bold">What to do</h2><ol className="mt-5 list-decimal space-y-5 pl-6 marker:font-bold marker:text-[var(--brand-accent-strong)]">{guide.steps.map(step => <li key={step} className="pl-2 text-sm leading-7 text-[#526059]">{step}</li>)}</ol></section>
    <section className="space-y-3"><h2 className="font-bold">What happens next</h2><p className="text-sm leading-7 text-[#526059]">{guide.outcome}</p><Link href={guide.destination.href} className="inline-flex min-h-11 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white">{guide.destination.label}<ArrowRight size={16} /></Link><p className="text-xs leading-6 text-[#66716b]">Available actions depend on your staff access, enabled features, and the event&apos;s current status.</p></section>
    <section className="rounded-lg border border-[#dfe4e1] bg-[#f7f9f8] p-5"><h2 className="flex items-center gap-2 font-bold"><CircleHelp size={18} />If something is unavailable</h2><p className="mt-2 text-sm leading-7 text-[#526059]">{guide.troubleshooting}</p></section>
    <nav aria-label="Related guides" className="border-t border-[#dfe4e1] pt-5"><h2 className="font-bold">Related guides</h2><div className="mt-3 flex flex-wrap gap-3">{guide.related.map(id => { const related = findProducerGuide(id); return related ? <Link key={id} href={`/help/${id}`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#dfe4e1] bg-white px-3 text-sm font-semibold">{related.title}<ArrowRight size={15} /></Link> : null; })}<Link href="/help#glossary" className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold text-[#66716b]">Useful terms</Link></div></nav>
  </article>;
}
