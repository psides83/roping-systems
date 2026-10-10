export const producerFeatures = [
  { key: "require_memberships", label: "Require memberships", group: "Membership" },
  { key: "online_entries", label: "Online entries", group: "Membership" },
  { key: "membership", label: "Online membership applications", group: "Membership" },
  { key: "dues", label: "Membership dues", group: "Membership" },
  { key: "fines", label: "Member fines", group: "Membership" },
  { key: "suspensions", label: "Membership suspensions", group: "Membership" },
  { key: "watch", label: "Classification watch", group: "Competition" },
  { key: "standings", label: "Season standings", group: "Competition" },
  { key: "qualifications", label: "Qualification requirements", group: "Competition" },
  { key: "finals", label: "Earned bonus positions", group: "Competition" },
  { key: "handicap", label: "Handicap ropings", group: "Competition" },
  { key: "four_d", label: "4D ropings", group: "Competition" },
  { key: "short_rounds", label: "Short rounds", group: "Competition" },
  { key: "side_pots", label: "Side pots", group: "Competition" },
  { key: "insurance", label: "Insurance pots", group: "Competition" },
  { key: "cattle_draw", label: "Drawn cattle", group: "Competition" },
  { key: "funds", label: "Added-money funds", group: "Finances" },
  { key: "profitability", label: "Event profitability", group: "Finances" },
  { key: "sponsors", label: "Sponsors", group: "Public pages" },
  { key: "rules", label: "Public rules", group: "Public pages" },
  { key: "news", label: "News bulletins", group: "Public pages" },
  { key: "portal", label: "Roper portal shortcut", group: "Public pages" },
] as const;
export type ProducerFeature = (typeof producerFeatures)[number]["key"];
export type ProducerFeatures = Partial<Record<ProducerFeature, boolean>>;
export const producerFeatureDescriptions: Record<ProducerFeature, string> = {
  require_memberships: "Require approved membership before competing. Entries may be accepted while approval is pending. Turn off to keep reusable roper records without formal memberships or dues.",
  online_entries: "Accept new online entries. Turning this off stops new submissions; staff can still review existing requests.",
  membership: "Accept new membership applications. Existing applications remain available for staff review.",
  dues: "Set seasonal dues and collect payments. Existing dues balances remain accessible when disabled.",
  fines: "Issue member fines. Outstanding fines can still be collected or waived when disabled.",
  suspensions: "Issue temporary suspensions. Existing suspensions remain effective and can still be lifted.",
  watch: "Show classification-watch tools. Existing flags remain available for staff review.",
  standings: "Show season standings navigation and historical winnings import options. Previous records are retained.",
  qualifications: "Add qualification requirements to events and copy rules during rollover. Existing requirements still apply.",
  finals: "Set up earned bonus positions. Existing positions remain available for assignment and review.",
  handicap: "Offer Handicap formats and classification offsets. Existing Handicap ropings are unchanged.",
  four_d: "Offer 4D formats and payout schedules. Existing 4D competitions are unchanged.",
  short_rounds: "Offer short rounds in new templates and payout schedules. Existing short rounds are unchanged.",
  side_pots: "Offer side pots in new fee setups. Existing pots, entries, and winnings are retained.",
  insurance: "Offer insurance pots in new fee setups. Existing pots, entries, and winnings are retained.",
  cattle_draw: "Offer drawn cattle in new templates. Existing cattle settings remain editable.",
  funds: "Show added-money fund tools. Existing balances, allocations, and fund-backed contributions remain accessible.",
  profitability: "Show event expense and profitability tools. Events with expense history retain access.",
  sponsors: "Display sponsor placement on public pages. Sponsor records are retained when hidden.",
  rules: "Show public rules navigation. Existing rules remain available through direct links.",
  news: "Show public news navigation. Existing bulletins remain available through direct links.",
  portal: "Show the public roper-portal shortcut. Roper accounts and linked memberships remain accessible.",
};
export function featureEnabled(features: ProducerFeatures, key: string): boolean {
  if ((key === "membership" || key === "dues") && features.require_memberships === false) return false;
  return features[key as ProducerFeature] !== false;
}
