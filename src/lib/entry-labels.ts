export type EntryLabelStyle = "number" | "letter";

export function formatEntryLabel(number: number, style: EntryLabelStyle = "number") {
  if (style === "number") return String(number);
  if (!Number.isSafeInteger(number) || number < 1) return String(number);
  let label = "";
  for (let value = number; value > 0; value = Math.floor((value - 1) / 26)) {
    label = String.fromCharCode(65 + ((value - 1) % 26)) + label;
  }
  return label;
}
