"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Upload } from "lucide-react";
import { importHistory, reviewHistory } from "@/app/(app)/settings/migration/actions";
import { mapHistoryRows, type HistoryChoice, type HistoryKind, type HistoryMapping, type HistoryPreview, type HistoryRow } from "@/lib/history-import";

type Sheet = { sheet: string; data: string[][] };
interface Season { id: string; name: string; starts_on: string; ends_on: string }
const control = "max-w-full rounded-md border px-3 py-2 text-sm";
const button = `${control} inline-flex items-center gap-2 font-semibold disabled:opacity-50`;
export function HistoryImportWorkspace({ seasons, classes, funds, canStandings }: { seasons: Season[]; classes: HistoryChoice[]; funds: HistoryChoice[]; canStandings: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<HistoryKind>(canStandings ? "standings" : "fund"), [season, setSeason] = useState(seasons[0]?.id ?? "");
  const [sheets, setSheets] = useState<Sheet[]>([]), [sheet, setSheet] = useState(0), [header, setHeader] = useState(0), [file, setFile] = useState("");
  const [columns, setColumns] = useState<HistoryMapping>({}), [targets, setTargets] = useState<HistoryMapping>({}), [dateOrder, setDateOrder] = useState<"mdy" | "dmy">("mdy");
  const [note, setNote] = useState(""), [preview, setPreview] = useState<HistoryPreview | null>(null), [selected, setSelected] = useState(new Set<number>());
  const [prepared, setPrepared] = useState<{ id: string; rows: HistoryRow[]; snapshot: string } | null>(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [success, setSuccess] = useState("");
  const data = sheets[sheet]?.data ?? [], headers = data[header] ?? [], choices = kind === "fund" ? funds : classes;
  const rawTargets = columns.target ? [...new Set(data.slice(header + 1).map((r) => (r[Number(columns.target)] ?? "").trim()).filter(Boolean))] : [];
  function reset() { setPreview(null); setSelected(new Set()); setPrepared(null); setSuccess(""); setError(""); }
  async function upload(f?: File) {
    if (!f) return;
    setBusy("Reading spreadsheet..."); setError("");
    try {
      if (f.size > 5 * 1024 * 1024) throw new Error("Choose a spreadsheet smaller than 5 MB.");
      let parsed: Sheet[];
      if (/\.csv$/i.test(f.name)) {
        const Papa = (await import("papaparse")).default;
        const result = Papa.parse<string[]>(await f.text(), { skipEmptyLines: false });
        if (result.errors.length) throw new Error(result.errors[0].message);
        parsed = [{ sheet: "CSV", data: result.data }];
      } else if (/\.xlsx$/i.test(f.name)) {
        const read = (await import("read-excel-file/browser")).default;
        parsed = (await read(f)).map((s) => ({ sheet: s.sheet, data: s.data.map((r) => r.map((c) => c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ""))) }));
      } else throw new Error("Choose an Excel (.xlsx) or CSV file.");
      if (!parsed.length || parsed.some((s) => s.data.length > 501 || s.data.some((r) => r.length > 100))) throw new Error("Import up to 500 rows and 100 columns per worksheet.");
      reset(); setSheets(parsed); setSheet(0); setHeader(0); setColumns({}); setTargets({}); setFile(f.name);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to read spreadsheet."); }
    finally { setBusy(""); }
  }
  async function review() {
    setBusy("Checking members, classes, and previous imports..."); setError("");
    try {
      const mapped = mapHistoryRows(data, header, columns, targets, kind, dateOrder);
      if (mapped.errors.length) throw new Error(mapped.errors.slice(0, 10).join("\n"));
      if (!mapped.rows.length) throw new Error("No rows found.");
      const result = await reviewHistory(kind, season, mapped.rows);
      setPreview(result); setSelected(new Set(result.rows.filter((r) => !r.error && r.operation === "import").map((r) => r.row))); setPrepared(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to review import."); }
    finally { setBusy(""); }
  }
  async function save() {
    if (!preview) return;
    setBusy("Importing approved history..."); setError("");
    try {
      const rows: HistoryRow[] = preview.rows.filter((r) => selected.has(r.row)).map(({ row, reference, date, memberNumber, target, amountCents, count }) => ({ row, reference, date, memberNumber, target, amountCents, count }));
      let approved = prepared;
      if (!approved) {
        const checked = await reviewHistory(kind, season, rows);
        for (const r of checked.rows) {
          const old = preview.rows.find((p) => p.row === r.row);
          if (JSON.stringify(old) !== JSON.stringify(r)) throw new Error("A member, class, fund, or previous import changed. Review again before importing.");
        }
        approved = { id: crypto.randomUUID(), rows, snapshot: checked.snapshot }; setPrepared(approved);
      }
      await importHistory(kind, season, approved.rows, approved.id, file, note, { columns, targets, dateOrder, sheet: sheets[sheet].sheet, header }, approved.snapshot);
      setSuccess(`${rows.length} historical records imported.`); setPreview(null); setSelected(new Set()); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to import history."); }
    finally { setBusy(""); }
  }
  const fields = [{ id: "reference", label: "Source reference (optional)" }, { id: "date", label: "Effective date" },
    ...(kind !== "fund" ? [{ id: "memberNumber", label: "Member number" }] : []),
    { id: "target", label: kind === "fund" ? "Fund" : "Class" }, { id: "value", label: kind === "attendance" ? "Ropings attended" : "Amount" }];
  return <section className="space-y-5" aria-busy={Boolean(busy)}>
    {busy && <div role="status" aria-live="polite" className="sticky top-0 z-10 flex items-center gap-3 rounded-md border bg-white p-5 shadow-sm"><LoaderCircle className="animate-spin" size={24} /><strong>{busy}</strong></div>}
    {error && <p role="alert" className="whitespace-pre-line rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {success && <p role="status" className="rounded-md bg-emerald-50 p-4 text-emerald-800">{success}</p>}
    <fieldset disabled={Boolean(busy)} className="space-y-5">
      <div className="flex flex-wrap items-end gap-4"><label className="space-y-1 text-sm"><span className="block font-semibold">Import type</span><select className={control} value={kind} onChange={(e) => { setKind(e.target.value as HistoryKind); setTargets({}); reset(); }}>{canStandings && <><option value="standings">Historical winnings</option><option value="attendance">Historical attendance</option></>}<option value="fund">Opening fund balances</option></select></label>
        <label className="space-y-1 text-sm"><span className="block font-semibold">Season</span><select className={control} value={season} onChange={(e) => { setSeason(e.target.value); reset(); }}><option value="">Choose season</option>{seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className={`${button} cursor-pointer`}><Upload size={16} />Choose spreadsheet<input className="sr-only" type="file" accept=".csv,.xlsx" onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
      </div>
      <p className="max-w-2xl text-sm text-[#66716b]">{kind === "fund" ? "Opening balances add money to existing funds. Only import money not already recorded in the ledger." : "Import history not already recorded in the app. Winnings affect standings, not payouts owed. Each row takes effect on its date; summary totals cannot be used for earlier qualification cutoffs. Import dated records when earlier cutoffs matter."}</p>
      {!!sheets.length && <>
        <div className="flex flex-wrap items-center gap-3"><strong className="text-sm">{file}</strong><label className="text-sm">Worksheet <select className={control} value={sheet} onChange={(e) => { setSheet(Number(e.target.value)); setHeader(0); setColumns({}); setTargets({}); reset(); }}>{sheets.map((s, i) => <option key={i} value={i}>{s.sheet}</option>)}</select></label><label className="text-sm">Header row <input className={`${control} w-20`} type="number" min={1} max={data.length} value={header + 1} onChange={(e) => { setHeader(Math.max(0, Math.min(data.length - 1, Number(e.target.value) - 1))); setColumns({}); setTargets({}); reset(); }} /></label></div>
        <div className="flex flex-wrap gap-4">{fields.map((f) => <label key={f.id} className="space-y-1 text-sm"><span className="block font-semibold">{f.label}</span><select className={control} value={columns[f.id] ?? ""} onChange={(e) => { setColumns({ ...columns, [f.id]: e.target.value }); reset(); }}><option value="">Choose column</option>{headers.map((h, i) => <option key={i} value={String(i)}>{h || `Column ${i + 1}`}{data[header + 1]?.[i] ? ` · ${data[header + 1][i]}` : ""}</option>)}</select></label>)}</div>
        {!!rawTargets.length && <details open className="border-t pt-4"><summary className="font-semibold">Match {kind === "fund" ? "funds" : "classes"}</summary><div className="mt-3 flex flex-wrap gap-4">{rawTargets.map((raw) => <label key={raw} className="space-y-1 text-sm"><span className="block font-semibold">{raw}</span><select className={control} value={targets[raw] ?? ""} onChange={(e) => { setTargets({ ...targets, [raw]: e.target.value }); reset(); }}><option value="">Choose {kind === "fund" ? "fund" : "class"}</option>{choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>)}</div></details>}
        <div className="flex flex-wrap items-center gap-4"><label className="text-sm">Date format <select className={control} value={dateOrder} onChange={(e) => { setDateOrder(e.target.value as "mdy" | "dmy"); reset(); }}><option value="mdy">Month / day / year</option><option value="dmy">Day / month / year</option></select></label><label className="text-sm">Source description <input className={`${control} w-72`} value={note} maxLength={1000} onChange={(e) => { setNote(e.target.value); setPrepared(null); }} placeholder="Previous season ledger or spreadsheet" /></label><button className={button} disabled={!season} onClick={() => void review()}>Review import</button></div>
      </>}
      {preview && <section className="space-y-3 border-t pt-5"><div className="flex flex-wrap items-center gap-3"><h2 className="font-semibold">{selected.size} approved records</h2><button className={button} disabled={!selected.size || note.trim().length < 5} onClick={() => void save()}>Import approved history</button></div>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Approve", "Row", "Reference", "Member / fund", "Class", "Date", "Value", "Status"].map((h) => <th key={h} className="border-b p-2">{h}</th>)}</tr></thead><tbody>{preview.rows.map((r) => <tr key={r.row}><td className="p-2"><input type="checkbox" aria-label={`Approve row ${r.row}`} disabled={Boolean(r.error) || r.operation !== "import"} checked={selected.has(r.row)} onChange={() => { setSelected((old) => { const next = new Set(old); if (next.has(r.row)) next.delete(r.row); else next.add(r.row); return next; }); setPrepared(null); }} /></td><td className="p-2">{r.row}</td><td className="p-2">{r.reference}</td><td className="p-2">{r.label}</td><td className="p-2">{r.targetLabel}</td><td className="whitespace-nowrap p-2">{r.date}</td><td className="p-2">{kind === "attendance" ? r.count : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(r.amountCents / 100)}</td><td className="p-2">{r.error || (r.operation === "duplicate" ? "Already imported" : "Ready")}</td></tr>)}</tbody></table></div>
      </section>}
    </fieldset>
  </section>;
}
