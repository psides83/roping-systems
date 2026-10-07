import { z } from "zod";

export const importFields = [
  ["memberNumber", "Member number", ["member number", "member #", "membership number", "id"]],
  ["firstName", "First name", ["first name", "first", "firstname"]],
  ["lastName", "Last name", ["last name", "last", "lastname", "surname"]],
  ["email", "Email", ["email", "email address"]],
  ["phone", "Phone", ["phone", "phone number", "cell", "mobile"]],
  ["gender", "Competition gender", ["gender", "sex", "competition gender"]],
  ["birthDate", "Birth date", ["birth date", "dob", "date of birth", "birthday"]],
  ["status", "Membership status", ["status", "membership status"]],
  ["joinedOn", "Joined date", ["joined", "joined date", "joined on"]],
  ["expiresOn", "Expiration date", ["expires", "expiration date", "expires on"]],
  ["city", "City", ["city", "town"]],
  ["state", "State", ["state"]],
  ["address", "Street address", ["address", "street address"]],
  ["zip", "Postal code", ["zip", "zip code", "postal code"]],
  ["notes", "Notes", ["notes", "comments"]],
] as const;

export interface ImportDivision { id: string; name: string; classifications: { id: string; name: string }[] }
export interface ImportMapping { columns: Record<string, string>; values: Record<string, Record<string, string>>; dateOrder: "mdy" | "dmy" }
export const importedMemberSchema = z.object({
  memberNumber: z.string().trim().min(1, "Member number is required").max(100),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().min(1, "Last name is required").max(100),
  email: z.email().optional(), phone: z.string().regex(/^\d{10}$/, "Phone must have ten digits").optional(),
  gender: z.enum(["female", "male"]).optional(),
  birthDate: z.iso.date().optional(), joinedOn: z.iso.date().optional(), expiresOn: z.iso.date().optional(),
  status: z.enum(["active", "pending", "expired", "inactive"]).optional(),
  city: z.string().max(150).optional(), state: z.string().max(100).optional(),
  address: z.string().max(300).optional(), zip: z.string().max(20).optional(), notes: z.string().max(3000).optional(),
  classifications: z.array(z.object({ divisionId: z.uuid(), classificationId: z.uuid() })).max(30),
});
export type ImportedMember = z.infer<typeof importedMemberSchema>;
export interface ImportRow { row: number; member: Partial<ImportedMember>; errors: string[] }
export interface ImportPreview extends ImportRow { operation?: "create" | "update" | "link"; snapshot?: string; before?: Record<string, unknown>; membershipId?: string; warning?: string; error?: string }

export function suggestMapping(headers: string[]): ImportMapping {
  const columns: Record<string, string> = {};
  for (const [field, , aliases] of importFields) {
    const index = headers.findIndex((header) => aliases.some((alias) => alias === header.trim().toLowerCase()));
    if (index >= 0) columns[field] = String(index);
  }
  return { columns, values: {}, dateOrder: "mdy" };
}

export function importDate(value: string, order: "mdy" | "dmy") {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (!match) return value;
  return `${match[3]}-${(order === "mdy" ? match[1] : match[2]).padStart(2, "0")}-${(order === "mdy" ? match[2] : match[1]).padStart(2, "0")}`;
}

export function mapImportRows(rows: string[][], headerRow: number, mapping: ImportMapping, divisions: ImportDivision[]): ImportRow[] {
  const results = rows.slice(headerRow + 1).flatMap((cells, index) => {
    if (!cells.some((cell) => cell.trim())) return [];
    const member: Record<string, unknown> = { classifications: [] };
    const errors: string[] = [];
    for (const [field] of importFields) {
      const column = mapping.columns[field];
      if (column === undefined || column === "") continue;
      let value = cells[Number(column)]?.trim() ?? "";
      if (!value) continue;
      if (field === "phone") { value = value.replace(/\D/g, ""); if (value.length === 11 && value.startsWith("1")) value = value.slice(1); }
      if (field === "email") value = value.toLowerCase();
      if (["birthDate", "joinedOn", "expiresOn"].includes(field)) value = importDate(value, mapping.dateOrder);
      if (field === "gender" || field === "status") {
        const aliases: Record<string, string> = field === "gender" ? { f: "female", female: "female", woman: "female", m: "male", male: "male", man: "male" } : { active: "active", pending: "pending", expired: "expired", inactive: "inactive" };
        value = mapping.values[field]?.[value] || aliases[value.toLowerCase()] || value;
      }
      member[field] = value;
    }
    for (const division of divisions) {
      const key = `class:${division.id}`;
      const column = mapping.columns[key];
      if (column === undefined || column === "") continue;
      const value = cells[Number(column)]?.trim();
      if (!value) continue;
      const classificationId = mapping.values[key]?.[value];
      if (!classificationId || !division.classifications.some((item) => item.id === classificationId)) errors.push(`${division.name}: map "${value}" to a classification`);
      else (member.classifications as ImportedMember["classifications"]).push({ divisionId: division.id, classificationId });
    }
    const parsed = importedMemberSchema.safeParse(member);
    if (!parsed.success) errors.push(...parsed.error.issues.map((issue) => `${String(issue.path[0])}: ${issue.message}`));
    return [{ row: headerRow + index + 2, member: member as Partial<ImportedMember>, errors }];
  });
  const numbers = new Map<string, number>();
  const emails = new Map<string, number>();
  for (const result of results) {
    if (result.member.memberNumber) numbers.set(result.member.memberNumber, (numbers.get(result.member.memberNumber) ?? 0) + 1);
    if (result.member.email) emails.set(result.member.email, (emails.get(result.member.email) ?? 0) + 1);
  }
  for (const result of results) {
    if ((numbers.get(result.member.memberNumber ?? "") ?? 0) > 1) result.errors.push("Duplicate member number in this file");
    if ((emails.get(result.member.email ?? "") ?? 0) > 1) result.errors.push("Shared or duplicate email in this file; resolve the identity before importing");
  }
  return results;
}
