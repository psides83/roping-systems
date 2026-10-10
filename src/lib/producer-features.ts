export const producerFeatures = [
  { key: "membership", label: "Online membership applications", group: "Membership" },
  { key: "dues", label: "Membership dues", group: "Membership" },
  { key: "watch", label: "Classification watch", group: "Competition" },
  { key: "standings", label: "Season standings", group: "Competition" },
  { key: "qualifications", label: "Qualification requirements", group: "Competition" },
  { key: "finals", label: "Earned bonus positions", group: "Competition" },
  { key: "funds", label: "Added-money funds", group: "Finances" },
  { key: "sponsors", label: "Sponsors", group: "Public pages" },
  { key: "rules", label: "Public rules", group: "Public pages" },
  { key: "news", label: "News bulletins", group: "Public pages" },
] as const;
export type ProducerFeature = (typeof producerFeatures)[number]["key"];
export type ProducerFeatures = Partial<Record<ProducerFeature, boolean>>;
export function featureEnabled(features: ProducerFeatures, key: string): boolean {
  return features[key as ProducerFeature] !== false;
}
