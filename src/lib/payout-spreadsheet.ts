import Papa from "papaparse";
import type { EditablePayoutSchedule } from "../components/settings/payout-schedule-dialog";

const headers = ["Schedule", "Description", "Format", "Payback %", "Go rounds %", "Average %", "Short round enabled", "Short round %", "4D split seconds", "Row type", "Stage", "Minimum entries", "Maximum entries", "Place", "Place %", "Active Ds", "1D purse %", "2D purse %", "3D purse %", "4D purse %", "1D places", "2D places", "3D places", "4D places"];
const stages = ["go_round", "aggregate", "short_round"] as const;
export function payoutScheduleCsv(schedule: EditablePayoutSchedule): string {
  const metadata = [schedule.name, schedule.description, schedule.competitionFormat, schedule.paybackPercent, schedule.goRoundsPercent, schedule.aggregatePercent, schedule.shortRoundEnabled ? "Yes" : "No", schedule.shortRoundPercent, schedule.fourDSettings?.splitSeconds ?? ""];
  const rows: unknown[][] = [];
  for (const stage of stages) for (const bracket of schedule.bracketsByStage[stage]) {
    if (!bracket.percentages.length) rows.push([...metadata, "place", stage, bracket.minimumEntries, bracket.maximumEntries ?? "", "", ""]);
    bracket.percentages.forEach((percentage, index) => rows.push([...metadata, "place", stage, bracket.minimumEntries, bracket.maximumEntries ?? "", index + 1, percentage]));
  }
  for (const bracket of schedule.fourDSettings?.brackets ?? []) rows.push([...metadata, "4d", "", bracket.minimumEntries, bracket.maximumEntries ?? "", "", "", bracket.activeDivisions, ...bracket.purseBasisPoints.map(value => value / 100), ...bracket.placesByDivision]);
  if (!rows.length) rows.push([...metadata, "settings"]);
  return Papa.unparse({ fields: headers, data: rows }, { escapeFormulae: true });
}

export function parsePayoutSpreadsheet(data: string[][]): EditablePayoutSchedule {
  if (data.length > 5001 || data.some(row => row.length > 100)) throw new Error("Use at most 5,000 rows and 100 columns.");
  const rows = data.filter(row => row.some(cell => String(cell ?? "").trim()));
  if (rows.length < 2) throw new Error("Include a header and at least one schedule row.");
  const normalize = (value: string) => value.toLowerCase().replace(/%/g, "percent").replace(/[^a-z0-9]/g, "");
  const columns = rows[0].map(normalize);
  if (new Set(columns.filter(Boolean)).size !== columns.filter(Boolean).length) throw new Error("Remove duplicate column headings.");
  for (const name of ["Schedule", "Stage", "Minimum entries", "Maximum entries", "Place", "Place %"]) if (!columns.includes(normalize(name))) throw new Error(`Missing column: ${name}. Download the sample CSV for the expected layout.`);
  const get = (row: string[], name: string) => String(row[columns.indexOf(normalize(name))] ?? "").trim();
  // CSV formula protection prefixes text with an apostrophe; remove only that export prefix.
  const text = (value: string) => /^'[=+@\-\t\r]/.test(value) ? value.slice(1) : value;
  function number(row: string[], name: string, fallback?: number, integer = false, max = 100) {
    const raw = get(row, name).replace(/%$/, "").trim();
    if (!raw && fallback !== undefined) return fallback;
    const value = raw ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isSafeInteger(value)) || (!integer && Math.abs(value * 100 - Math.round(value * 100)) > 0.000001)) throw new Error(`${name} must be ${integer ? "a whole number" : "a number with at most two decimals"} between 0 and ${max}.`);
    return value;
  }
  const first = rows[1];
  const name = text(get(first, "Schedule"));
  if (!name) throw new Error("Enter a schedule name.");
  const format = get(first, "Format").toLowerCase() || "standard";
  if (!["standard", "four_d"].includes(format)) throw new Error("Format must be standard or four_d.");
  const enabled = get(first, "Short round enabled").toLowerCase() || "no";
  if (!["yes", "no", "true", "false"].includes(enabled)) throw new Error("Short round enabled must be Yes or No.");
  const result: EditablePayoutSchedule = {
    id: "", name, description: text(get(first, "Description")), competitionFormat: format as "standard" | "four_d",
    paybackPercent: number(first, "Payback %", 100), goRoundsPercent: number(first, "Go rounds %", 50), aggregatePercent: number(first, "Average %", 50),
    shortRoundEnabled: enabled === "yes" || enabled === "true", shortRoundPercent: number(first, "Short round %", 0),
    fourDSettings: format === "four_d" ? { splitSeconds: number(first, "4D split seconds", undefined, false, 60), brackets: [] } : null,
    bracketsByStage: { go_round: [], aggregate: [], short_round: [] },
  };
  if (!result.paybackPercent || result.fourDSettings?.splitSeconds === 0) throw new Error("Payback and 4D split seconds must be greater than zero.");
  for (const [index, row] of rows.slice(1).entries()) {
    try {
      for (const field of headers.slice(0, 9)) if (get(row, field) && get(row, field) !== get(first, field)) throw new Error(`Keep ${field} consistent throughout a single schedule.`);
      const type = get(row, "Row type").toLowerCase() || "place";
      if (type === "settings") continue;
      if (!["place", "4d"].includes(type)) throw new Error("Row type must be place, 4d, or settings.");
      const minimumEntries = number(row, "Minimum entries", undefined, true, 1000000);
      const maximumEntries = get(row, "Maximum entries") ? number(row, "Maximum entries", undefined, true, 1000000) : null;
      if (!minimumEntries || (maximumEntries !== null && maximumEntries < minimumEntries)) throw new Error("Check the minimum and maximum entry counts.");
      if (type === "4d") {
        if (!result.fourDSettings) throw new Error("4D rows require the four_d format.");
        if (result.fourDSettings.brackets.some(b => b.minimumEntries === minimumEntries)) throw new Error("Duplicate 4D entry range.");
        const activeDivisions = number(row, "Active Ds", undefined, true, 4);
        if (!activeDivisions) throw new Error("Choose at least one active D.");
        result.fourDSettings.brackets.push({ minimumEntries, maximumEntries, activeDivisions,
          purseBasisPoints: [1, 2, 3, 4].map(d => Math.round(number(row, `${d}D purse %`, 0) * 100)) as [number, number, number, number],
          placesByDivision: [1, 2, 3, 4].map(d => number(row, `${d}D places`, 0, true, 100)) as [number, number, number, number],
        });
      } else {
        const rawStage = normalize(get(row, "Stage"));
        const stage = ({ goround: "go_round", gorounds: "go_round", average: "aggregate", aggregate: "aggregate", shortround: "short_round" } as Record<string, typeof stages[number]>)[rawStage];
        if (!stage) throw new Error("Stage must be go_round, average, or short_round.");
        if (stage === "short_round" && !result.shortRoundEnabled) throw new Error("Enable short rounds before importing short-round rows.");
        let bracket = result.bracketsByStage[stage].find(b => b.minimumEntries === minimumEntries);
        if (bracket && bracket.maximumEntries !== maximumEntries) throw new Error("Conflicting maximum entries for the same range.");
        if (!bracket) { bracket = { minimumEntries, maximumEntries, percentages: [] }; result.bracketsByStage[stage].push(bracket); }
        if (!get(row, "Place") && !get(row, "Place %")) continue;
        const place = number(row, "Place", undefined, true, 100);
        if (!place || bracket.percentages[place - 1] !== undefined) throw new Error("Place must be positive and cannot be duplicated in a range.");
        bracket.percentages[place - 1] = number(row, "Place %");
      }
    } catch (error) { throw new Error(`Row ${index + 2}: ${(error as Error).message}`); }
  }
  for (const stage of stages) {
    result.bracketsByStage[stage].sort((a, b) => a.minimumEntries - b.minimumEntries);
    for (const bracket of result.bracketsByStage[stage]) for (let i = 0; i < bracket.percentages.length; i++) if (bracket.percentages[i] === undefined) throw new Error("Paid places must be consecutive, starting at 1.");
  }
  return result;
}

export const samplePayoutSchedule: EditablePayoutSchedule = {
  id: "", name: "Sample payout schedule", description: "", competitionFormat: "standard", paybackPercent: 100,
  goRoundsPercent: 50, aggregatePercent: 50, shortRoundEnabled: false, shortRoundPercent: 0, fourDSettings: null,
  bracketsByStage: { go_round: [{ minimumEntries: 1, maximumEntries: null, percentages: [60, 40] }], aggregate: [{ minimumEntries: 1, maximumEntries: null, percentages: [60, 40] }], short_round: [] },
};
