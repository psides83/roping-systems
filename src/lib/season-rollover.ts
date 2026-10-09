import { z } from "zod";

export const rolloverSchema = z.object({
  reference: z.uuid(), sourceSeason: z.uuid(), name: z.string().trim().min(1).max(80),
  startsOn: z.iso.date(), endsOn: z.iso.date(), duesEnabled: z.boolean(), assessMembers: z.boolean(), copyQualifications: z.boolean(),
  amountCents: z.number().int().min(0).max(2147483647), installments: z.boolean(),
  allocationMode: z.enum(["fixed", "percent"]), allocationValue: z.number().int().min(0).max(2147483647),
  fundId: z.uuid().nullable(),
}).superRefine((value, context) => {
  if (value.endsOn < value.startsOn) context.addIssue({ code: "custom", message: "The season end must follow its start." });
  if (value.duesEnabled && (value.amountCents <= 0 || value.allocationValue > (value.allocationMode === "fixed" ? value.amountCents : 10000) || (value.allocationValue > 0 && !value.fundId)))
    context.addIssue({ code: "custom", message: "Check the dues amount, contribution and destination fund." });
  if (!value.duesEnabled && value.assessMembers) context.addIssue({ code: "custom", message: "Set up dues before assessing members." });
});

export function nextSeasonDates(startsOn: string, endsOn: string) {
  const advance = (value: string) => {
    const [year, month, day] = value.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year + 1, month, 0)).getUTCDate();
    return `${year + 1}-${String(month).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
  };
  const start = advance(startsOn);
  return { startsOn: start > endsOn ? start : new Date(Date.parse(`${endsOn}T12:00:00Z`) + 86400000).toISOString().slice(0, 10), endsOn: advance(endsOn) };
}
