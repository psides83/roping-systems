export interface EntryOption {
  id: string;
  title: string;
  amountCents: number;
  scope: string;
}

interface SelectedRoping {
  id: string;
  name: string;
  options: EntryOption[];
  requiredFees?: EntryOption[];
}

export function summarizeOnlineEntryOptions(
  ropings: SelectedRoping[],
  selected: Record<string, boolean>,
  quantities: Record<string, number>,
  selectedOptions: Record<string, boolean>,
  coveredFeeKeys: string[] = [],
) {
  const covered = new Set(coveredFeeKeys);
  const charged = new Set(coveredFeeKeys);
  return ropings.filter((roping) => selected[roping.id]).map((roping) => {
    const quantity = quantities[roping.id] ?? 1;
    const price = (option: EntryOption) => {
      const key = option.scope === "contestant_division" ? `${roping.id}:${option.id}` : option.id;
      const units = option.scope === "entry" ? quantity : charged.has(key) ? 0 : 1;
      charged.add(key);
      return { title: option.title, units, amountCents: option.amountCents * units, alreadyApplied: option.scope !== "entry" && covered.has(key) };
    };
    const requiredFees = (roping.requiredFees ?? []).map(price);
    const options = roping.options.filter((option) => selectedOptions[`${roping.id}:${option.id}`]).map(price);
    return { id: roping.id, name: roping.name, quantity, requiredFees, options };
  });
}
