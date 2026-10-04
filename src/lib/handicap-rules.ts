import { z } from "zod";

export const handicapRulesSchema = z.array(
  z.object({
    classificationId: z.uuid(),
    adjustmentSeconds: z.number().min(-60).max(60),
  }),
);

export function parseHandicapRules(value: string) {
  try {
    return handicapRulesSchema.safeParse(JSON.parse(value));
  } catch {
    return handicapRulesSchema.safeParse(null);
  }
}
