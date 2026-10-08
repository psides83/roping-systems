import { importDate } from "./member-import";
import { z } from "zod";

export type HistoryKind = "standings" | "attendance" | "fund";
export interface HistoryRow { row: number; reference: string; date: string; memberNumber: string; target: string; amountCents: number; count: number }
export interface HistoryPreviewRow extends HistoryRow { operation: string; error: string | null; label: string | null; targetLabel: string | null }
export interface HistoryPreview { rows: HistoryPreviewRow[]; snapshot: string }
export interface HistoryChoice { id: string; label: string }
export type HistoryMapping = Record<string, string>;

export function historyMoney(value: string) {
  const clean = value.trim().replace(/^\$/, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(clean)) throw new Error("Money must have at most two decimal places.");
  const cents = Math.round(Number(clean.replaceAll(",", "")) * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 2147483647) throw new Error("Enter a positive money amount.");
  return cents;
}

export function mapHistoryRows(data: string[][], header: number, columns: HistoryMapping, targets: HistoryMapping,
  kind: HistoryKind, dateOrder: "mdy" | "dmy") {
  const rows: HistoryRow[] = [];
  const errors: string[] = [];
  const refs = new Set<string>();
  const funds = new Set<string>();
  data.slice(header + 1).forEach((cells, index) => {
    if (cells.every((cell) => !cell.trim())) return;
    const row = header + index + 2;
    const cell = (name: string) => columns[name] ? (cells[Number(columns[name])] ?? "").trim() : "";
    try {
      const rawTarget = cell("target");
      const target = Object.hasOwn(targets, rawTarget) ? targets[rawTarget] : undefined;
      if (!target) throw new Error("Map the class or fund.");
      if (kind === "fund" && funds.has(target)) throw new Error("Only one opening balance per fund.");
      funds.add(target);
      const date = importDate(cell("date"), dateOrder);
      if (!z.iso.date().safeParse(date).success) throw new Error("Map a valid effective date.");
      const memberNumber = cell("memberNumber");
      if (kind !== "fund" && !memberNumber) throw new Error("Map the producer's member number.");
      const reference = cell("reference") || JSON.stringify([kind, memberNumber, target, date]);
      if (reference.length > 200) throw new Error("Source reference must be at most 200 characters.");
      if (refs.has(reference.toLowerCase())) throw new Error("Duplicate source reference in this sheet. Combine same-day summaries or map distinct source references.");
      refs.add(reference.toLowerCase());
      const count = kind === "attendance" ? Number(cell("value")) : 0;
      if (kind === "attendance" && (!/^\d+$/.test(cell("value")) || count < 1 || count > 10000)) throw new Error("Attendance must be a positive whole number.");
      rows.push({ row, reference, date, memberNumber, target, count, amountCents: kind === "attendance" ? 0 : historyMoney(cell("value")) });
    } catch (error) { errors.push(`Row ${row}: ${error instanceof Error ? error.message : "Invalid row."}`); }
  });
  return { rows, errors };
}
