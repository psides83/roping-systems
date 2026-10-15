"use client";

import { SectionNavigation } from "@/components/ui/section-navigation";
import { useProducerFeatures } from "@/components/settings/producer-features-context";
import { featureEnabled } from "@/lib/producer-features";

const tabs = [
  { id: "directory", label: "Directory", href: "/members" },
  { id: "watch", label: "Classification watch", href: "/settings/classification-watch" },
  { id: "finals", label: "Finals positions", href: "/settings/finals" },
] as const;

export function MemberNavigation({ active }: { active: (typeof tabs)[number]["id"] }) {
  const features = useProducerFeatures();
  return <SectionNavigation label="Roper management" active={active} items={tabs.filter(tab => tab.id === "directory" || tab.id === active || featureEnabled(features, tab.id))} />;
}
