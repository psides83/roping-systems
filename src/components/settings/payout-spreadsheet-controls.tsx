"use client";

import { useState } from "react";
import { Download, Upload, LoaderCircle, X } from "lucide-react";
import { parsePayoutSpreadsheet, payoutScheduleCsv, samplePayoutSchedule } from "@/lib/payout-spreadsheet";
import { payoutScheduleIssues } from "@/lib/payout-schedule-validation";
import { PayoutScheduleDialog, type EditablePayoutSchedule } from "./payout-schedule-dialog";
import { useProducerFeatures } from "./producer-features-context";
import { featureEnabled } from "@/lib/producer-features";

const button = "inline-flex min-h-9 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-xs font-semibold disabled:opacity-50";
function download(schedule: EditablePayoutSchedule) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", payoutScheduleCsv(schedule)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `${schedule.name.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80) || "payout-schedule"}.csv`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function PayoutCsvExport({ schedule }: { schedule: EditablePayoutSchedule }) {
  return <button type="button" className={button} onClick={() => download(schedule)}><Download size={15} />Export CSV</button>;
}

export function PayoutSpreadsheetImport({ enabled }: { enabled: boolean }) {
  const features = useProducerFeatures();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sheets, setSheets] = useState<Array<{ sheet: string; data: string[][] }>>([]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<EditablePayoutSchedule>();
  const [version, setVersion] = useState(0);
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setSheets([]); setDraft(undefined);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Choose a spreadsheet smaller than 5 MB.");
      let parsed;
      if (/\.csv$/i.test(file.name)) {
        const Papa = (await import("papaparse")).default;
        const result = Papa.parse<string[]>(await file.text(), { skipEmptyLines: "greedy" });
        if (result.errors.length) throw new Error(result.errors[0].message);
        parsed = [{ sheet: file.name, data: result.data }];
      } else if (/\.xlsx$/i.test(file.name)) {
        const read = (await import("read-excel-file/browser")).default;
        parsed = (await read(file)).map(sheet => ({ sheet: sheet.sheet, data: sheet.data.map(row => row.map(cell => String(cell ?? ""))) }));
      } else throw new Error("Choose an Excel (.xlsx) or CSV file.");
      if (!parsed.length) throw new Error("No worksheets found.");
      setSheets(parsed); setIndex(0);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to read spreadsheet."); }
    finally { setBusy(false); }
  }
  function review() {
    setError("");
    try {
      const schedule = parsePayoutSpreadsheet(sheets[index].data);
      if (schedule.competitionFormat === "four_d" && !featureEnabled(features, "four_d")) throw new Error("Enable 4D payouts in producer settings before importing this schedule.");
      if (schedule.shortRoundEnabled && !featureEnabled(features, "short_rounds")) throw new Error("Enable short rounds in producer settings before importing this schedule.");
      setDraft(schedule); setVersion(v => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Check the spreadsheet."); }
  }
  return <>
    <button type="button" disabled={!enabled} onClick={() => setOpen(true)} className={button}><Upload size={15} />Import spreadsheet</button>
    {open && <div className="fixed inset-0 z-[65] overflow-y-auto bg-black/45 p-4"><section role="dialog" aria-modal="true" aria-labelledby="payout-import-title" className="relative mx-auto my-8 max-w-xl space-y-4 rounded-md bg-white p-5 shadow-xl">
      <header className="flex items-center justify-between gap-3"><h2 id="payout-import-title" className="text-lg font-bold">Import payout schedule</h2><button type="button" aria-label="Close import" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center"><X size={18} /></button></header>
      <p className="text-sm text-[#66716b]">Import one schedule per worksheet. Review it before saving; existing schedules are not replaced.</p>
      <button type="button" className={button} onClick={() => download(samplePayoutSchedule)}><Download size={15} />Download sample CSV</button>
      <p className="text-xs leading-5 text-[#66716b]">Use the sample headings, with one row per paid place and entry range. Percentages use 60 or 60%, not 0.60. Leave the maximum blank for no limit. Export a current 4D schedule for its additional columns.</p>
      <label className="block text-sm font-semibold">Spreadsheet<input type="file" accept=".csv,.xlsx" disabled={busy} className="mt-2 block max-w-full text-sm" onChange={e => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
      {busy && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle size={18} className="animate-spin" />Reading spreadsheet…</p>}
      {sheets.length > 0 && <div className="flex flex-wrap items-end gap-3"><label className="text-sm font-semibold">Worksheet<select value={index} onChange={e => { setIndex(Number(e.target.value)); setDraft(undefined); setError(""); }} className="mt-2 block h-10 max-w-full rounded-md border px-3 text-sm">{sheets.map((sheet, i) => <option key={i} value={i}>{sheet.sheet}</option>)}</select></label><button type="button" className={button} onClick={review}>Review schedule</button></div>}
      {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {draft && <section className="space-y-3 border-t pt-4"><h3 className="font-bold">{draft.name}</h3><p className="text-sm">{Object.values(draft.bracketsByStage).flat().length} paid-place ranges · {draft.competitionFormat === "four_d" ? "4D" : "Standard"}</p>{payoutScheduleIssues(draft).length > 0 && <p className="text-sm text-amber-800">Incomplete: {payoutScheduleIssues(draft).join(" ")} You can save this as a draft.</p>}<PayoutScheduleDialog key={version} schedule={draft} enabled={enabled} importDraft onSaved={() => { setOpen(false); setDraft(undefined); setSheets([]); }} /></section>}
    </section></div>}
  </>;
}
