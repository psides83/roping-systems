"use client";

import { CreateClassificationDialog } from "@/components/settings/classification-dialogs";
import { importFields, type ImportDivision, type ImportMapping } from "@/lib/member-import";

export function ImportMappingEditor({ headers, rows, mapping, divisions, onChange, refresh }: {
  headers: string[]; rows: string[][]; mapping: ImportMapping; divisions: ImportDivision[];
  onChange: (mapping: ImportMapping) => void; refresh: () => void;
}) {
  const column = (key: string) => <select aria-label={`${key} source column`} value={mapping.columns[key] ?? ""} onChange={(e) => onChange({ ...mapping, columns: { ...mapping.columns, [key]: e.target.value } })} className="max-w-full rounded-md border px-3 py-2 text-sm">
    <option value="">Not imported</option>{headers.map((header, index) => <option key={index} value={index}>{header || `Column ${index + 1}`}</option>)}
  </select>;
  const values = (key: string, choices: { id: string; name: string }[]) => {
    const source = mapping.columns[key];
    if (source === undefined || source === "") return null;
    const distinct = [...new Set(rows.map((row) => row[Number(source)]?.trim()).filter(Boolean))];
    return <div className="mt-3 flex flex-wrap gap-3">{distinct.map((value) => <label key={value} className="flex items-center gap-2 text-sm"><span>{value}</span><select aria-label={`Map ${value}`} className="rounded-md border px-3 py-2" value={mapping.values[key]?.[value] ?? ""} onChange={(e) => onChange({ ...mapping, values: { ...mapping.values, [key]: { ...mapping.values[key], [value]: e.target.value } } })}><option value="">Choose value</option>{choices.map((choice) => <option value={choice.id} key={choice.id}>{choice.name}</option>)}</select></label>)}</div>;
  };
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{importFields.map(([key, label]) => <label key={key} className="flex flex-col items-start gap-2 text-sm font-semibold">{label}{column(key)}</label>)}</div>
    <div className="flex flex-wrap gap-4">{values("gender", [{ id: "female", name: "Female" }, { id: "male", name: "Male" }])}{values("status", ["active", "pending", "expired", "inactive"].map((id) => ({ id, name: id })))}</div>
    {divisions.map((division) => <section key={division.id} className="border-t pt-4"><div className="flex flex-wrap items-center gap-3"><h3 className="text-sm font-semibold">{division.name} classification</h3>{column(`class:${division.id}`)}<CreateClassificationDialog disciplineId={division.id} disciplineName={division.name} enabled /><button type="button" onClick={refresh} className="text-sm font-semibold underline">Refresh classifications</button></div>{values(`class:${division.id}`, division.classifications)}</section>)}
  </div>;
}
