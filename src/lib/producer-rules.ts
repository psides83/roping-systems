import { z } from "zod";

const text = z.string().max(20000);
const subsection = z.object({ id: z.uuid(), title: z.string().max(150), content: text });
export function isRulesPdfUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /\.pdf$/i.test(url.pathname) && !url.username && !url.password;
  } catch { return false; }
}
export const rulesDocumentSchema = z.object({
  title: z.string().max(150), introduction: text,
  effectiveOn: z.union([z.literal(""), z.iso.date()]),
  sections: z.array(subsection.extend({ subsections: z.array(subsection).max(30) })).max(50),
  attachments: z.array(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(150),
    url: z.url().max(2048).refine(isRulesPdfUrl, "Use an HTTPS link to a PDF document.") })).max(10),
}).superRefine((document, context) => {
  const ids = document.sections.flatMap((section) => [section.id, ...section.subsections.map((item) => item.id)]).concat(document.attachments.map((item) => item.id));
  if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Section identifiers must be unique." });
});
export type RulesDocument = z.infer<typeof rulesDocumentSchema>;
export const emptyRules: RulesDocument = { title: "Rules", introduction: "", effectiveOn: "", sections: [], attachments: [] };
export function rulesPublishErrors(document: RulesDocument) {
  const errors: string[] = [];
  if (!document.title.trim()) errors.push("Give the rules page a title.");
  if (!document.sections.length) errors.push("Add at least one section.");
  document.sections.forEach((section, index) => {
    if (!section.title.trim()) errors.push(`Section ${index + 1} needs a heading.`);
    if (!section.content.trim() && !section.subsections.length) errors.push(`Section ${index + 1} needs rule text or a subsection.`);
    section.subsections.forEach((item, child) => { if (!item.title.trim() || !item.content.trim()) errors.push(`Section ${index + 1}, subsection ${child + 1} needs a heading and rule text.`); });
  });
  return errors;
}
