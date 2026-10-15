import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { HelpLibrary } from "@/components/help/help-library";

export const metadata = { title: "Help & guides" };
export default function HelpPage() {
  return <div className="space-y-6">
    <PageHeader title="Help & guides" eyebrow="Producer workspace" description="Practical steps for setup, event day, and wrapping up. Find the task you need, then return to your work." />
    <section className="flex flex-col gap-4 rounded-lg border border-[#dfe4e1] bg-white p-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold">Setting up your first event?</h2><p className="mt-1 text-sm leading-6 text-[#66716b]">Start with the basics, then use the setup checklist to review your saved settings.</p></div><Link href="/help/first-setup" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white">Start here<ArrowRight size={16} /></Link></section>
    <HelpLibrary />
  </div>;
}
