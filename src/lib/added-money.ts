export interface AddedMoneyContribution {
  fund_key: string; fund_label: string; event_id: string; event_title: string;
  roping_date: string; fee_title: string; paid_entries: number; collected_cents: number;
  pending_entries: number; pending_cents: number;
}

export function addedMoneyFunds(rows: AddedMoneyContribution[]) {
  const funds = new Map<string, { key: string; label: string; collected: number; pending: number; entries: number; rows: AddedMoneyContribution[] }>();
  for (const row of rows) {
    const fund = funds.get(row.fund_key) ?? { key: row.fund_key, label: row.fund_label, collected: 0, pending: 0, entries: 0, rows: [] };
    fund.collected += Number(row.collected_cents);
    fund.pending += Number(row.pending_cents);
    fund.entries += Number(row.paid_entries);
    fund.rows.push(row);
    funds.set(row.fund_key, fund);
  }
  return [...funds.values()].sort((a, b) => a.key === "general" ? -1 : b.key === "general" ? 1 : a.label.localeCompare(b.label));
}
