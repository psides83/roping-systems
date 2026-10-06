export function groupScheduleByArena<T>(items: T[], arenaName: (item: T) => string | null | undefined) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = arenaName(item)?.trim() || "Arena not assigned";
    const label = /^first available$/i.test(name) ? "First Available" : name;
    const group = groups.get(label) ?? [];
    group.push(item);
    groups.set(label, group);
  }
  return Array.from(groups, ([name, ropings]) => ({ name, ropings })).sort((a, b) => {
    if (a.name === "First Available") return 1;
    if (b.name === "First Available") return -1;
    return a.name.localeCompare(b.name, "en", { numeric: true });
  });
}
