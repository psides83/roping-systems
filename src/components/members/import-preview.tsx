"use client";

import { useState } from "react";
import { importFields, type ImportDivision, type ImportPreview } from "@/lib/member-import";

export function ImportPreviewTable({ rows, selected, toggle, outcomes, divisions }: {
  rows: ImportPreview[]; selected: Set<number>; toggle: (row: number) => void;
  outcomes: Record<number, { error?: string; membershipId?: string }>;
  divisions: ImportDivision[];
}) {
  const [page, setPage] = useState(0);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 50) - 1));
  const display = (key: string, value: unknown) => {
    if (key === "classifications" && Array.isArray(value)) return value.map((item) => {
      const division = divisions.find((division) => division.id === item.divisionId);
      return `${division?.name ?? "Division"}: ${division?.classifications.find((choice) => choice.id === item.classificationId)?.name ?? "Previous classification"}`;
    }).join(", ") || "No changes";
    return value === null || value === undefined ? "Not set" : String(value);
  };
  return <div><div className="mb-3 flex items-center gap-3 text-sm"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} className="rounded-md border px-3 py-2 disabled:opacity-40">Previous</button><span>{currentPage * 50 + 1}–{Math.min((currentPage + 1) * 50, rows.length)} of {rows.length}</span><button type="button" disabled={(currentPage + 1) * 50 >= rows.length} onClick={() => setPage(currentPage + 1)} className="rounded-md border px-3 py-2 disabled:opacity-40">Next</button></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f2f5f3]"><tr>{["Approve", "Row", "Member", "Action", "Review"].map((label) => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{rows.slice(currentPage * 50, (currentPage + 1) * 50).map((row) => {
    const error = row.errors.join("; ") || row.error || outcomes[row.row]?.error;
    const saved = Boolean(outcomes[row.row]?.membershipId);
    return <tr key={row.row} className="border-b align-top"><td className="p-3"><input type="checkbox" aria-label={`Approve row ${row.row}`} checked={selected.has(row.row)} disabled={Boolean(row.errors.length || row.error || saved)} onChange={() => toggle(row.row)} /></td><td className="p-3">{row.row}</td><td className="p-3 font-semibold">{row.member.firstName} {row.member.lastName}<span className="block font-normal text-[#66716b]">#{row.member.memberNumber}</span></td><td className="p-3">{saved ? "Imported" : row.operation === "update" ? "Approve update" : row.operation === "link" ? "Approve shared profile" : row.operation === "create" ? "New member" : "Needs attention"}</td><td className="p-3">{error && <p className="text-red-700">{error}</p>}{row.warning && <p>{row.warning}</p>}<details><summary className="cursor-pointer font-semibold">Values</summary><dl className="mt-2 space-y-2">{Object.entries(row.member).map(([key, value]) => <div key={key}><dt className="font-semibold">{importFields.find(([field]) => field === key)?.[1] ?? "Classifications"}</dt><dd>{row.operation === "update" && <span className="text-[#66716b]">Current: {display(key, row.before?.[key] ?? (row.before?.profile as Record<string, unknown> | undefined)?.[key === "address" ? "street_address" : key === "zip" ? "postal_code" : key])} → </span>}{display(key, value)}</dd></div>)}</dl></details></td></tr>;
  })}</tbody></table></div></div>;
}
