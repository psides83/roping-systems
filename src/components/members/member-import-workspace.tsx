"use client";

import { useState } from "react";
import { LoaderCircle, Upload, Download } from "lucide-react";
import { applyImportRows, beginImport, loadImportChoices, reviewImportRows } from "@/app/(app)/members/import/actions";
import { mapImportRows, suggestMapping, type ImportDivision, type ImportMapping, type ImportPreview } from "@/lib/member-import";
import { ImportMappingEditor } from "./import-mapping";
import { ImportPreviewTable } from "./import-preview";

type Sheet = { sheet: string; data: string[][] };
export function MemberImportWorkspace({ initialDivisions, today }: { initialDivisions: ImportDivision[]; today: string }) {
  const [divisions, setDivisions] = useState(initialDivisions);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<ImportMapping>({ columns: {}, values: {}, dateOrder: "mdy" });
  const [effectiveOn, setEffectiveOn] = useState(today);
  const [preview, setPreview] = useState<ImportPreview[]>([]);
  const [selected, setSelected] = useState(new Set<number>());
  const [batch, setBatch] = useState<string>();
  const [outcomes, setOutcomes] = useState<Record<number, { error?: string; membershipId?: string }>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const data = sheets[sheetIndex]?.data ?? [];
  const headers = data[headerRow] ?? [];
  function resetReview() { setPreview([]); setSelected(new Set()); setBatch(undefined); setOutcomes({}); }
  async function upload(file?: File) {
    if (!file) return;
    setBusy("Reading spreadsheet…"); setError("");
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file smaller than 5 MB.");
      let parsed: Sheet[];
      if (/\.csv$/i.test(file.name)) {
        const Papa = (await import("papaparse")).default;
        const result = Papa.parse<string[]>(await file.text(), { skipEmptyLines: false });
        if (result.errors.length) throw new Error(`Unable to read CSV: ${result.errors[0].message}`);
        parsed = [{ sheet: "CSV", data: result.data }];
      } else if (/\.xlsx$/i.test(file.name)) {
        const read = (await import("read-excel-file/browser")).default;
        parsed = (await read(file)).map((sheet) => ({ sheet: sheet.sheet, data: sheet.data.map((row) => row.map((cell) => cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? ""))) }));
      } else throw new Error("Choose an Excel (.xlsx) or CSV file.");
      if (!parsed.length || parsed.some((sheet) => sheet.data.length > 2001 || sheet.data.some((row) => row.length > 100))) throw new Error("Each worksheet must contain at most 2,000 member rows and 100 columns.");
      resetReview(); setSheets(parsed); setSheetIndex(0); setHeaderRow(0); setFileName(file.name); setMapping(suggestMapping(parsed[0].data[0] ?? []));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to read file."); }
    finally { setBusy(""); }
  }
  async function review() {
    setBusy("Reviewing members…"); setError("");
    try {
      const rows = mapImportRows(data, headerRow, mapping, divisions);
      if (!rows.length) throw new Error("No member rows found.");
      const results: ImportPreview[] = [];
      for (let index = 0; index < rows.length; index += 100) {
        setBusy(`Reviewing ${Math.min(index + 100, rows.length)} of ${rows.length} members…`);
        results.push(...await reviewImportRows(rows.slice(index, index + 100), effectiveOn));
      }
      setPreview(results); setSelected(new Set(results.filter((row) => row.operation === "create" && !row.error && !row.errors.length).map((row) => row.row)));
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to review members."); }
    finally { setBusy(""); }
  }
  async function save() {
    setBusy("Importing approved members…"); setError("");
    try {
      const id = batch ?? await beginImport(fileName, { headers, mapping }); setBatch(id);
      const approved = preview.filter((row) => selected.has(row.row) && !outcomes[row.row]?.membershipId);
      for (let index = 0; index < approved.length; index += 25) {
        setBusy(`Importing ${Math.min(index + 25, approved.length)} of ${approved.length} approved members…`);
        const results = await applyImportRows(id, approved.slice(index, index + 25), effectiveOn);
        setOutcomes((current) => ({ ...current, ...Object.fromEntries(results.map((row) => [row.row, row])) }));
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Import interrupted. Saved rows are retained; retry is safe."); }
    finally { setBusy(""); }
  }
  async function report() {
    const Papa = (await import("papaparse")).default;
    const csv = Papa.unparse(preview.map((row) => ({ row: row.row, memberNumber: row.member.memberNumber, name: `${row.member.firstName ?? ""} ${row.member.lastName ?? ""}`, action: row.operation, result: outcomes[row.row]?.membershipId ? "Imported" : "Not imported", error: outcomes[row.row]?.error || row.error || row.errors.join("; ") })), { escapeFormulae: true });
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); const link = document.createElement("a"); link.href = url; link.download = "member-import-report.csv"; link.click(); URL.revokeObjectURL(url);
  }
  const button = "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold";
  return <div className="space-y-5">
    {busy && <div role="status" aria-live="polite" className="sticky top-0 z-10 flex items-center gap-3 rounded-md border bg-white p-5 shadow-sm"><LoaderCircle className="animate-spin" size={24} /><p className="font-semibold">{busy}</p></div>}
    {error && <p role="alert" className="rounded-md bg-red-50 p-4 text-red-700">{error}</p>}
    <fieldset disabled={Boolean(busy)} className="space-y-5 disabled:opacity-60">
      <label className={`${button} cursor-pointer`}><Upload size={16} />Choose spreadsheet<input type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
      {sheets.length > 0 && <>
        <div className="flex flex-wrap items-end gap-4"><span className="text-sm font-semibold">{fileName}</span><label className="text-sm">Worksheet<select className="ml-2 rounded-md border px-3 py-2" value={sheetIndex} onChange={(e) => { const index = Number(e.target.value); setSheetIndex(index); setHeaderRow(0); setMapping(suggestMapping(sheets[index].data[0] ?? [])); resetReview(); }}>{sheets.map((sheet, index) => <option key={index} value={index}>{sheet.sheet}</option>)}</select></label><label className="text-sm">Header row<input className="ml-2 w-20 rounded-md border px-3 py-2" type="number" min={1} max={data.length} value={headerRow + 1} onChange={(e) => { const row = Math.max(0, Math.min(data.length - 1, Number(e.target.value) - 1)); setHeaderRow(row); setMapping(suggestMapping(data[row] ?? [])); resetReview(); }} /></label></div>
        <div className="overflow-x-auto"><table className="text-left text-xs"><thead><tr>{headers.map((header, i) => <th key={i} className="border-b p-2">{header || `Column ${i + 1}`}</th>)}</tr></thead><tbody>{data.slice(headerRow + 1, headerRow + 4).map((row, i) => <tr key={i}>{headers.map((_, j) => <td key={j} className="p-2">{row[j]}</td>)}</tr>)}</tbody></table></div>
        <ImportMappingEditor headers={headers} rows={data.slice(headerRow + 1)} mapping={mapping} divisions={divisions} onChange={(next) => { setMapping(next); resetReview(); }} refresh={() => { void loadImportChoices().then((items) => { setDivisions(items); resetReview(); }).catch(() => setError("Unable to refresh classifications.")); }} />
        <div className="flex flex-wrap items-center gap-4"><label className="text-sm">Spreadsheet dates<select className="ml-2 rounded-md border px-3 py-2" value={mapping.dateOrder} onChange={(e) => { setMapping({ ...mapping, dateOrder: e.target.value as "mdy" | "dmy" }); resetReview(); }}><option value="mdy">Month / day / year</option><option value="dmy">Day / month / year</option></select></label><label className="text-sm">Classification effective date<input className="ml-2 rounded-md border px-3 py-2" type="date" value={effectiveOn} onChange={(e) => { setEffectiveOn(e.target.value); resetReview(); }} /></label><button className={button} onClick={() => void review()}>Review members</button></div>
      </>}
      {preview.length > 0 && <section className="space-y-4 border-t pt-5"><div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">Review · {preview.length} rows</h2><span className="text-sm">{selected.size} approved · {Object.values(outcomes).filter((row) => row.membershipId).length} imported</span><button className={button} disabled={!selected.size} onClick={() => void save()}>Import approved members</button><button className={button} onClick={() => void report()}><Download size={16} />Report</button></div><ImportPreviewTable divisions={divisions} rows={preview} selected={selected} outcomes={outcomes} toggle={(row) => setSelected((current) => { const next = new Set(current); if (next.has(row)) next.delete(row); else next.add(row); return next; })} /></section>}
    </fieldset>
  </div>;
}
