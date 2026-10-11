import { zipSync, strToU8 } from "fflate";
import Papa from "papaparse";

export interface ProducerExportSnapshot {
  version: number; producer_id: string; snapshot_at: string;
  tables: Record<string, Record<string, unknown>[]>;
  counts: Record<string, number>;
  assets: Array<{ bucket: string; path: string; size: number | string | null }>;
  exclusions: string[]; redacted_fields: string;
}
export function safeArchivePath(value: string) {
  return Boolean(value) && !value.startsWith("/") && !value.includes("\\") && !/[\x00-\x1f]/.test(value) && value.split("/").every((part) => Boolean(part) && part !== "." && part !== "..");
}
function cell(value: unknown) {
  const text = typeof value === "object" && value !== null ? JSON.stringify(value) : value;
  return typeof text === "string" && /^[=+@\-\t\r]/.test(text) ? `'${text}` : text ?? "";
}
export function redactExportValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactExportValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/(token|secret|password|session_id|auth_user_id|email_attempt)/i.test(key)).map(([key, nested]) => [key, redactExportValue(nested)]));
  }
  return value;
}
export function buildProducerArchive(snapshot: ProducerExportSnapshot, assets: Record<string, Uint8Array>) {
  const files: Record<string, Uint8Array> = Object.create(null);
  files["manifest.json"] = strToU8(JSON.stringify({ ...snapshot, tables: undefined }, null, 2));
  files["README.txt"] = strToU8("Producer data export\n\nJSON records preserve field names and IDs for a managed migration. CSV copies are provided for spreadsheet review; nested values are JSON text, and formula-like strings are escaped. Amounts ending in _cents are cents.\n\nUploaded producer and sponsor logos are included under uploads. External flyer URLs remain references. Credentials, security state, and private platform records are excluded as listed in manifest.json. Shared roper profiles are included only for ropers linked to this producer. This archive does not automatically restore into the app.\n\nContains personal and financial information: store securely and share only with authorized people.\n");
  for (const [table, rows] of Object.entries(snapshot.tables)) {
    if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error("Invalid export table name.");
    const safeRows = redactExportValue(rows) as Record<string, unknown>[];
    files[`records/${table}.json`] = strToU8(JSON.stringify(safeRows, null, 2));
    if (safeRows.length) {
      const columns = Array.from(new Set(safeRows.flatMap((row) => Object.keys(row))));
      files[`spreadsheets/${table}.csv`] = strToU8(Papa.unparse({ fields: columns, data: safeRows.map((row) => columns.map((column) => cell(row[column]))) }));
    }
  }
  for (const [path, bytes] of Object.entries(assets)) {
    if (!safeArchivePath(path)) throw new Error("Invalid uploaded file path.");
    files[`uploads/${path}`] = bytes;
  }
  const zip = zipSync(files, { level: 1 });
  if (zip.byteLength > 100 * 1024 * 1024) throw new Error("This archive exceeds the interactive export size limit. Arrange a managed export.");
  return zip;
}
