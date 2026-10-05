export interface PenaltyOption { id: string; name: string; seconds: number; retained?: boolean }
export interface PenaltyRule {
  id: string; division_id: string; name: string; seconds: number;
  classification_mode: "all" | "only" | "except"; classification_ids: string[];
  age_mode: "all" | "only" | "except"; minimum_age: number | null; maximum_age: number | null; is_active: boolean;
}
export function penaltyTotal(options: PenaltyOption[], selected: string[]) {
  return Math.round(options.filter((option) => selected.includes(option.id)).reduce((total, option) => total + Number(option.seconds), 0) * 100) / 100;
}
export function formatAgeRange(minimum: number | null, maximum: number | null) {
  if (minimum === null && maximum === null) return "All ages";
  if (minimum === null) return `${maximum} and under`;
  if (maximum === null) return `${minimum} and over`;
  return minimum === maximum ? `Age ${minimum}` : `Ages ${minimum}-${maximum}`;
}
