import Link from "next/link";

export const producerSettingsTabs = [
  { id: "setup", label: "Setup checklist", href: "/settings/setup" },
  { id: "general", label: "General", href: "/settings" },
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
  return <nav aria-label="Producer settings" className="flex min-w-0 gap-1 overflow-x-auto border-b border-[#d7ddda]">
    {producerSettingsTabs.map((tab) => <Link key={tab.id} href={tab.href} aria-current={active === tab.id ? "page" : undefined}
      className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--brand-accent)] ${active === tab.id ? "border-[var(--brand-accent)] text-[#17201c]" : "border-transparent text-[#66716b] hover:border-[#ccd4d0] hover:text-[#17201c]"}`}>
      {tab.label}
    </Link>)}
  </nav>;
}
