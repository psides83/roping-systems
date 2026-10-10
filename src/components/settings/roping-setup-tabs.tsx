"use client";
import Link from "next/link";
import { useProducerFeatures } from "./producer-features-context";
import { featureEnabled } from "@/lib/producer-features";

const tabs = [
  { id: "setup", label: "Setup checklist", href: "/settings/setup" },
  {
    id: "classifications",
    label: "Divisions & classifications",
    href: "/settings/classifications",
  },
  {
    id: "templates",
    label: "Roping templates",
    href: "/settings/roping-templates",
  },
  { id: "payouts", label: "Payouts", href: "/settings/payouts" },
  { id: "timing", label: "Timing & penalties", href: "/settings/timing" },
  { id: "watch", label: "Classification watch", href: "/settings/classification-watch" },
  { id: "standings", label: "Standings", href: "/settings/standings" },
  { id: "qualifications", label: "Qualification rules", href: "/settings/qualifications" },
  { id: "finals", label: "Finals positions", href: "/settings/finals" },
] as const;

export function RopingSetupTabs({
  active,
}: {
  active: (typeof tabs)[number]["id"];
}) {
  const features = useProducerFeatures();
  return (
    <nav
      aria-label="Roping setup"
      className="flex gap-1 overflow-x-auto border-b border-[#d7ddda]"
    >
      {tabs.filter(tab => tab.id === active || featureEnabled(features, tab.id)).map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          aria-current={active === tab.id ? "page" : undefined}
          className={
            active === tab.id
              ? "shrink-0 border-b-2 border-[var(--brand-accent)] px-4 py-3 text-sm font-bold text-[#17201c]"
              : "shrink-0 px-4 py-3 text-sm font-semibold text-[#66716b]"
          }
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
