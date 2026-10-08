interface EntryOption {
  id: string;
  title: string;
  amountCents: number;
  scope: string;
}

interface SelectedRoping {
  id: string;
  name: string;
  options: EntryOption[];
}

export function summarizeOnlineEntryOptions(
  ropings: SelectedRoping[],
  selected: Record<string, boolean>,
  quantities: Record<string, number>,
  selectedOptions: Record<string, boolean>,
) {
  const charged = new Set<string>();
  return ropings.filter((roping) => selected[roping.id]).map((roping) => {
    const quantity = quantities[roping.id] ?? 1;
    const options = roping.options.filter((option) => selectedOptions[`${roping.id}:${option.id}`]).map((option) => {
      const units = option.scope === "entry" ? quantity : charged.has(option.id) ? 0 : 1;
      charged.add(option.id);
      return { title: option.title, units, amountCents: option.amountCents * units };
    });
    return { id: roping.id, name: roping.name, quantity, options };
  });
}
