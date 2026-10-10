export const producerFeatures = [
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
export function featureEnabled(features: ProducerFeatures, key: string): boolean {
  return features[key as ProducerFeature] !== false;
}
