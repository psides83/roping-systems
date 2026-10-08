import { z } from "zod";
import { formatProperNoun } from "./utils";

export interface RoperProfile {
  membershipId: string; name: string; email: string; phone: string; city: string; state: string;
  birthDate: string | null; gender: "male" | "female" | null;
  profileRevision: string; membershipRevision: string;
  corrections: { id: string; status: string; birthDate: string | null; gender: string | null; reason: string; reviewReason: string | null }[];
}
export const roperContactSchema = z.object({
  membership: z.uuid(), profileRevision: z.string().min(1), membershipRevision: z.string().min(1),
  email: z.union([z.literal(""), z.email()]).transform((s) => s.toLowerCase()),
  phone: z.string().regex(/^(?:|\(\d{3}\) \d{3}-\d{4})$/, "Enter a 10-digit phone number."),
  city: z.string().trim().max(100).transform(formatProperNoun),
  state: z.string().trim().max(100).transform(formatProperNoun),
});
