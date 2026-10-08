export function matchesSearch(values: string[], query: string) {
  const text = values.join(" ").toLowerCase();
  const digits = values.join("").replace(/\D/g, "");
  return query.trim().toLowerCase().split(/\s+/).every((term) =>
    text.includes(term) || (/^[\d()-]+$/.test(term) && /\d/.test(term) && digits.includes(term.replace(/\D/g, ""))),
  );
}

export function calendarDays(month: string) {
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((first.getUTCDay() + count) / 7) * 7 }, (_, index) => {
    const day = index - first.getUTCDay() + 1;
    return day < 1 || day > count ? null : `${month}-${String(day).padStart(2, "0")}`;
  });
}

export function shiftMonth(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
}
