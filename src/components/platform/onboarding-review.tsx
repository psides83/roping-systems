import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight, ExternalLink } from "lucide-react";
import type { PlatformDetail } from "@/lib/platform-admin";
import { onboardingReview } from "@/lib/platform-onboarding";
import { OnboardingTaskAction } from "@/components/platform/account-forms";

export function ProducerOnboardingReview({ detail }: { detail: PlatformDetail }) {
  const review = onboardingReview(detail);
  const base = `/platform/producers/${detail.producer.id}`;
  return <section className="space-y-6">
    <header className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Launch readiness</h2><span className="text-sm font-semibold">{review.reviewed} of {review.total} reviewed</span></div>
      <progress value={review.reviewed} max={review.total} aria-label="Onboarding reviews completed" className="block h-2 w-full accent-[#3146a8]" />
      <p className="text-sm leading-6 text-[#66716b]">{review.reviewComplete ? "All setup reviews are complete. Account activation remains a separate decision." : `Next: ${review.next?.label}.`} Configured records do not confirm that settings are correct.</p>
      {detail.account.next_action && <p className="text-sm"><strong>Follow-up:</strong> {detail.account.next_action}{detail.account.follow_up_on && ` · ${detail.account.follow_up_on}`}</p>}
      <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold"><Link href={`${base}?tab=contacts`} className="flex items-center gap-1 underline">Review contacts & access<ArrowRight size={15} /></Link><Link href={`/public/${detail.producer.slug}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline">Preview public page<ExternalLink size={15} /></Link><Link href={`${base}?tab=account`} className="flex items-center gap-1 underline">Account status & follow-up<ArrowRight size={15} /></Link></div>
    </header>
    <ol className="divide-y divide-[#dfe4e1] border-y border-[#dfe4e1]">{review.steps.map((step, index) => <li key={step.key} className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 flex-1 items-start gap-3">{step.reviewedAt ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#00835d]" /> : <Circle size={20} className="mt-0.5 shrink-0 text-[#758078]" />}<div className="min-w-0"><h3 className="text-sm font-semibold">{index + 1}. {step.label}</h3><p className="mt-1 text-sm leading-6 text-[#66716b]">{step.signal}</p>{step.reviewedAt && <p className="mt-1 text-xs text-[#66716b]">Reviewed {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" }).format(new Date(step.reviewedAt))}</p>}</div></div><OnboardingTaskAction producerId={detail.producer.id} taskKey={step.key} completed={Boolean(step.reviewedAt)} /></div>
      <details className="ml-8 mt-2 text-sm"><summary className="cursor-pointer font-semibold text-[#3146a8]">Review details</summary><p className="mt-2 max-w-2xl leading-6 text-[#66716b]">{step.guidance}</p></details>
    </li>)}</ol>
    <div className="border-l-4 border-[#3146a8] pl-4"><h3 className="font-semibold">{review.reviewComplete ? "Ready for an activation decision" : "Setup review still in progress"}</h3><p className="mt-1 text-sm leading-6 text-[#66716b]">{review.reviewComplete ? "Confirm your launch agreement with the producer, then update the account status when appropriate. Completing this checklist does not publish events or change staff permissions." : "Review each applicable step before launch. If a feature is not used, confirm that with the producer before marking its review complete."}</p></div>
  </section>;
}
