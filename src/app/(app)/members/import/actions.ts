"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { formatProperNoun } from "@/lib/utils";
import { importedMemberSchema, type ImportDivision, type ImportPreview, type ImportRow } from "@/lib/member-import";

async function manager() {
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") throw new Error("Member management access is required.");
  return { producer, db: await createClient() };
}

export async function loadImportChoices(): Promise<ImportDivision[]> {
  const { producer, db } = await manager();
  const { data, error } = await db.from("divisions").select("id,name,classifications(id,name,is_active,eligibility_type)").eq("producer_id", producer.id).eq("is_active", true).order("sort_order");
  if (error) throw new Error("Unable to load classifications.");
  return (data ?? []).map((division) => ({ id: division.id, name: division.name, classifications: division.classifications.filter((item) => item.is_active && ["skill", "open"].includes(item.eligibility_type)).map(({ id, name }) => ({ id, name })) }));
}

export async function reviewImportRows(rows: ImportRow[], effectiveOn: string): Promise<ImportPreview[]> {
  const { producer, db } = await manager();
  if (!Array.isArray(rows) || rows.length > 100 || !z.iso.date().safeParse(effectiveOn).success) throw new Error("Review up to 100 rows at a time with a valid effective date.");
  const results: ImportPreview[] = [];
  for (const row of rows) {
    if (!row || !Number.isInteger(row.row) || row.row < 1 || !Array.isArray(row.errors) || row.errors.some((error) => typeof error !== "string")) throw new Error("Invalid spreadsheet row.");
    const parsed = importedMemberSchema.safeParse(row.member);
    if (!parsed.success || row.errors.length) { results.push({ ...row, errors: [...row.errors, ...(parsed.success ? [] : parsed.error.issues.map((issue) => issue.message))] }); continue; }
    const member = { ...parsed.data, firstName: formatProperNoun(parsed.data.firstName), lastName: formatProperNoun(parsed.data.lastName), ...(parsed.data.city ? { city: formatProperNoun(parsed.data.city) } : {}), ...(parsed.data.state ? { state: formatProperNoun(parsed.data.state) } : {}) };
    const { data, error } = await db.rpc("import_member_row", { target_producer: producer.id, source_row: row.row, member_data: member, effective_on: effectiveOn });
    results.push({ row: row.row, member, errors: [], ...(error ? { error: "Unable to review this row." } : data) });
  }
  return results;
}

export async function beginImport(fileName: string, mapping: unknown) {
  const { producer, db } = await manager();
  if (!fileName || fileName.length > 250 || !mapping || JSON.stringify(mapping).length > 100000) throw new Error("Invalid import details.");
  const { data, error } = await db.rpc("begin_member_import", { target_producer: producer.id, file_name: fileName, column_mapping: mapping });
  if (error) throw new Error("Unable to start the import.");
  return data as string;
}

export async function applyImportRows(batchId: string, rows: ImportPreview[], effectiveOn: string) {
  const { producer, db } = await manager();
  if (!z.uuid().safeParse(batchId).success || !z.iso.date().safeParse(effectiveOn).success || !Array.isArray(rows) || rows.length > 25) throw new Error("Invalid import batch.");
  const outcomes: { row: number; membershipId?: string; operation?: string; error?: string }[] = [];
  for (const row of rows) {
    const member = importedMemberSchema.safeParse(row.member);
    if (!member.success || !row.snapshot || !Number.isInteger(row.row) || row.row < 1) { outcomes.push({ row: row.row, error: "Review this row before importing." }); continue; }
    const { data, error } = await db.rpc("import_member_row", { target_producer: producer.id, source_row: row.row, member_data: member.data, effective_on: effectiveOn, target_batch: batchId, expected_snapshot: row.snapshot, apply_row: true });
    outcomes.push({ row: row.row, ...(error ? { error: "Unable to save this row. You may safely retry." } : data) });
  }
  revalidatePath("/members");
  revalidatePath("/settings/classifications");
  return outcomes;
}
