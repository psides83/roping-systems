import { z } from "zod";

const webLink = z.string().trim().max(2000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, "Use a full http or https link.");

export const eventInformationSchema = z.object({
  flyer_url: webLink,
  directions: z.string().trim().max(4000),
  venue_information: z.string().trim().max(4000),
  contact_name: z.string().trim().max(120),
  contact_phone: z.string().trim().refine(value => !value || /^\(\d{3}\) \d{3}-\d{4}$/.test(value), "Enter a 10-digit phone number."),
  contact_email: z.union([z.literal(""), z.email()]),
  entry_information: z.string().trim().max(4000),
});
export type EventInformation = z.infer<typeof eventInformationSchema>;
export const emptyEventInformation: EventInformation = { flyer_url: "", directions: "", venue_information: "", contact_name: "", contact_phone: "", contact_email: "", entry_information: "" };
export function eventMapLinks(address: string) {
  if (!address.trim()) return null;
  return { google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, apple: `https://maps.apple.com/?daddr=${encodeURIComponent(address)}` };
}
