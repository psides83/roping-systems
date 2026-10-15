"use client";
import { SectionNavigation } from "@/components/ui/section-navigation";
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
  { id: "qualifications", label: "Qualification rules", href: "/settings/qualifications" },
] as const;

export function RopingSetupTabs({
  active,
}: {
  active: (typeof tabs)[number]["id"];
}) {
  const features = useProducerFeatures();
  return <SectionNavigation label="Roping setup" active={active} items={tabs.filter(tab => tab.id === active || featureEnabled(features, tab.id))} />;
}
