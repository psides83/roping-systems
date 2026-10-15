"use client";
import { SectionNavigation } from "@/components/ui/section-navigation";
import { useProducerFeatures } from "./producer-features-context";
import { featureEnabled } from "@/lib/producer-features";

export const producerSettingsTabs = [
  { id: "setup", label: "Setup checklist", href: "/settings/setup" },
  { id: "general", label: "General", href: "/settings" },
  { id: "features", label: "Features", href: "/settings/features" },
  { id: "appearance", label: "Appearance", href: "/settings?tab=appearance" },
  { id: "sponsors", label: "Sponsors", href: "/settings/sponsors" },
  { id: "seasons", label: "Seasons", href: "/settings?tab=seasons" },
  { id: "membership", label: "Membership", href: "/settings/membership-form" },
  { id: "dues", label: "Membership Dues", href: "/settings/dues" },
  { id: "rules", label: "Public Rules", href: "/settings/rules" },
  { id: "news", label: "News Bulletin", href: "/settings/news" },
  { id: "staff", label: "Staff", href: "/settings/staff" },
  { id: "migration", label: "Migration", href: "/settings/migration" },
  { id: "activity", label: "Activity", href: "/settings/changelog" },
] as const;

export function ProducerSettingsTabs({ active }: { active: (typeof producerSettingsTabs)[number]["id"] }) {
  const features = useProducerFeatures();
  return <SectionNavigation label="Producer settings" active={active} items={producerSettingsTabs.filter(tab => tab.id === active || featureEnabled(features, tab.id))} />;
}
