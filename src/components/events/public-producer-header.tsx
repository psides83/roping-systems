"use client";
import Image from "next/image";
import Link from "next/link";
import { NavigationPending } from "@/components/ui/navigation-pending";
import { UserRound } from "lucide-react";
import { useProducerFeatures } from "@/components/settings/producer-features-context";
import { featureEnabled } from "@/lib/producer-features";

export function PublicProducerHeader({ slug, name, logoUrl, active, membershipPublished = false }: {
  slug: string; name: string; logoUrl?: string | null;
  active: "results" | "schedule" | "standings" | "rules" | "news"; membershipPublished?: boolean;
}) {
  const base = `/public/${slug}`;
  const features = useProducerFeatures();
  const links = [
    { key: "results", label: "Results", href: base },
    { key: "schedule", label: "Schedule", href: `${base}/schedule` },
    { key: "standings", label: "Standings", href: `${base}/standings` },
    { key: "rules", label: "Rules", href: `${base}/rules` },
    { key: "news", label: "News", href: `${base}/news` },
    ...(membershipPublished ? [{ key: "membership", label: "Membership", href: `${base}/membership` }] : []),
  ];
  return <header className="border-b border-[#dfe4e1] brand-primary-fill text-white">
    <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6 lg:flex lg:items-center lg:justify-between lg:gap-6 lg:py-3">
      <div className="flex min-w-0 items-center justify-between gap-3 pb-3 lg:pb-0">
      <Link href={base} className="flex min-w-0 items-center gap-3">
        {logoUrl ? <span className="grid h-11 w-14 shrink-0 place-items-center overflow-hidden rounded-md bg-white p-1"><Image src={logoUrl} alt={`${name} logo`} width={48} height={36} unoptimized className="h-full w-full object-contain" /></span> : null}
        <span className="min-w-0 break-words text-lg font-bold sm:text-xl">{name}</span>
      </Link>
      {featureEnabled(features, "portal") && <Link href="/roper" title="Roper portal" aria-label="Roper portal" className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-white/30 hover:bg-white/10"><UserRound size={19} /></Link>}
      </div>
      <nav aria-label="Producer public pages" className="flex flex-wrap gap-x-4 text-sm font-semibold sm:gap-x-5">
        {links.filter(link => link.key === active || featureEnabled(features, link.key)).map((link) => <Link key={link.key} href={link.href} aria-current={active === link.key ? "page" : undefined}
          className={`relative inline-flex min-h-11 items-center border-b-2 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 ${active === link.key ? "border-white text-white" : "border-transparent brand-muted brand-hover"}`}>
          {link.label}<NavigationPending label={`Loading ${link.label.toLowerCase()}`} className="ml-1" />
        </Link>)}
      </nav>
    </div>
  </header>;
}
