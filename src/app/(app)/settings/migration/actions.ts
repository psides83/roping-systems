"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import type { HistoryKind, HistoryRow, HistoryPreview } from "@/lib/history-import";

const rowsSchema = z.array(z.object({ row: z.number().int().positive(), reference: z.string().trim().min(1).max(200),
  date: z.iso.date(), memberNumber: z.string().max(80), target: z.string().min(1).max(100),
  amountCents: z.number().int().min(0).max(2147483647), count: z.number().int().min(0).max(10000) })).min(1).max(500);
async function context(kind: HistoryKind) {
  z.enum(["standings", "attendance", "fund"]).parse(kind);
  const producer = await getActiveProducer();
  if (!producer || (!(kind === "fund" && producer.treasurer) && !["owner", "admin", "operator"].includes(producer.role))) throw new Error("Migration management access is required.");
  return { producer, db: await createClient() };
}
export async function reviewHistory(kind: HistoryKind, season: string, input: HistoryRow[]): Promise<HistoryPreview> {
  const { producer, db } = await context(kind);
  const { data, error } = await db.rpc("review_producer_history", { target_producer: producer.id, target_season: z.uuid().parse(season), target_kind: kind, input_rows: rowsSchema.parse(input) });
  if (error) throw new Error(error.message);
  return data as HistoryPreview;
}
export async function importHistory(kind: HistoryKind, season: string, input: HistoryRow[], batch: string,
  fileName: string, note: string, mapping: unknown, snapshot: string) {
  const { producer, db } = await context(kind);
  if (!mapping || JSON.stringify(mapping).length > 100000) throw new Error("Invalid column mapping.");
  const { error } = await db.rpc("apply_producer_history", { target_producer: producer.id, target_season: z.uuid().parse(season),
    target_kind: kind, input_rows: rowsSchema.parse(input), target_batch: z.uuid().parse(batch),
    file_name: z.string().trim().min(1).max(250).parse(fileName), source_note: z.string().trim().min(5).max(1000).parse(note),
    column_mapping: mapping, expected_snapshot: z.string().length(32).parse(snapshot) });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/migration"); revalidatePath("/public", "layout"); revalidatePath("/roper", "layout"); revalidatePath("/funds", "layout");
}
export async function reverseHistory(batch: string, reason: string) {
  const producer = await getActiveProducer();
  if (!producer) throw new Error("Sign in to manage imports.");
  const db = await createClient();
  const { error } = await db.rpc("reverse_producer_history", { target_batch: z.uuid().parse(batch), reason: z.string().trim().min(5).max(1000).parse(reason) });
  if (error) throw new Error(error.message);
  revalidatePath("/settings/migration"); revalidatePath("/public", "layout"); revalidatePath("/roper", "layout"); revalidatePath("/funds", "layout");
}

export async function historyRecords(batch: string) {
  const producer = await getActiveProducer();
  if (!producer) throw new Error("Producer access is required.");
  const db = await createClient();
  const { data, error } = await db.from("producer_history_rows").select("row_number,source_reference,effective_on,class_key,winnings_cents,attendance_count,ropers(first_name,last_name),producer_funds(name),fund_transactions(amount_cents)")
    .eq("producer_id", producer.id).eq("batch_id", z.uuid().parse(batch)).order("row_number").limit(500);
  if (error) throw new Error("Unable to load imported records.");
  return (data ?? []).map((r) => {
    const person = Array.isArray(r.ropers) ? r.ropers[0] : r.ropers;
    const fund = Array.isArray(r.producer_funds) ? r.producer_funds[0] : r.producer_funds;
    const transaction = Array.isArray(r.fund_transactions) ? r.fund_transactions[0] : r.fund_transactions;
    return { row: r.row_number, reference: r.source_reference, date: r.effective_on,
      name: fund?.name ?? [person?.first_name, person?.last_name].filter(Boolean).join(" "),
      amountCents: Number(transaction?.amount_cents ?? r.winnings_cents), count: r.attendance_count };
  });
}
