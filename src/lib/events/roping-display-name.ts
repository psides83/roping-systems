export function ropingDisplayName(name: string, divisionName: string) {
  const division = divisionName.trim().replace(/\s+roping$/i, "");
  if (!division) return name;
  let label = name.trim();
  if (/^tie[ -]?down$/i.test(division)) label = label.replace(/\bTD\b/gi, division);
  if (/^breakaway$/i.test(division)) label = label.replace(/\bBA\b/gi, division);
  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (` ${normalize(label)} `.includes(` ${normalize(division)} `)) return label;
  return [label, division].filter(Boolean).join(" ");
}
