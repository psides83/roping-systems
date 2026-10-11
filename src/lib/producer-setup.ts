export type SetupStatus = "ready" | "attention" | "optional";
export interface ChecklistIssue { message: string; href: string }
export interface ChecklistItem {
  id: string; title: string; group: "competition" | "membership" | "qualification";
  status: SetupStatus; detail: string; href: string; issues: ChecklistIssue[];
}
export interface ProducerSetupSnapshot {
  today: string;
  divisions: { id: string; name: string; active: boolean }[];
  classifications: { id: string; divisionId: string; active: boolean; standalone: boolean; adjustment: number | null }[];
  templates: {
    id: string; name: string; divisionId: string; availableDivisionIds?: string[]; active: boolean; format: string;
    scheduleId: string | null; shortRound: boolean; handicapIds: string[];
    fees: { title: string; kind: string; contributes: boolean; scheduleId: string | null; fundId: string | null }[];
  }[];
  schedules: { id: string; name: string; active: boolean; format: string; shortRound: boolean; issues: string[] }[];
  seasons: { id: string; name: string; first: string; last: string }[];
  dues: { amount: number; allocation: number; installments: boolean; fundId: string | null } | null;
  funds: { id: string; name: string; active: boolean }[];
  qualifications: { id: string; name: string; seasonId: string; standingsCutoff: string | null; attendanceCutoff: string | null }[];
}

const classificationsHref = "/settings/classifications";
const templatesHref = "/settings/roping-templates";
const payoutsHref = "/settings/payouts";
const seasonsHref = "/settings?tab=seasons";
const duesHref = "/settings/dues";
const qualificationsHref = "/settings/qualifications";
const count = (value: number, singular: string) => `${value} ${singular}${value === 1 ? "" : "s"}`;
const dateLabel = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));

export function producerSetupChecklist(data: ProducerSetupSnapshot): ChecklistItem[] {
  const divisions = data.divisions.filter((division) => division.active);
  const divisionIds = new Set(divisions.map((division) => division.id));
  const classes = data.classifications.filter((item) => item.active && divisionIds.has(item.divisionId));
  const templates = data.templates.filter((template) => template.active);
  const schedules = new Map(data.schedules.filter((schedule) => schedule.active).map((schedule) => [schedule.id, schedule]));
  const templateIssues: ChecklistIssue[] = [];
  const payoutIssues: ChecklistIssue[] = [];
  const usedSchedules = new Set<string>();

  for (const division of divisions) {
    if (!templates.some((template) => (template.availableDivisionIds ?? [template.divisionId]).includes(division.id))) templateIssues.push({ message: `${division.name}: add an active roping template.`, href: templatesHref });
  }
  for (const template of templates) {
    const add = (message: string, href = templatesHref) => templateIssues.push({ message: `${template.name}: ${message}`, href });
    if ((template.availableDivisionIds ?? [template.divisionId]).some((id) => !divisionIds.has(id))) add("its division is inactive or missing.", classificationsHref);
    if (template.format === "standard" && !classes.some((item) => (template.availableDivisionIds ?? [template.divisionId]).includes(item.divisionId) && item.standalone)) add("add an active standalone classification for this division.", classificationsHref);
    if (template.format === "handicap") {
      if (!template.handicapIds.length) add("select eligible member classifications.");
      else if (template.handicapIds.some((id) => !classes.some((item) => item.id === id && (template.availableDivisionIds ?? [template.divisionId]).includes(item.divisionId) && item.adjustment !== null))) add("an eligible classification is inactive, missing, or has no Handicap time offset.", classificationsHref);
    }
    function checkSchedule(id: string | null, label: string, required: boolean, main: boolean) {
      if (!id) {
        if (required) payoutIssues.push({ message: `${template.name} · ${label}: choose a payout schedule.`, href: templatesHref });
        return;
      }
      usedSchedules.add(id);
      const schedule = schedules.get(id);
      if (!schedule) { payoutIssues.push({ message: `${template.name} · ${label}: the payout schedule is inactive or missing.`, href: templatesHref }); return; }
      const expected = template.format === "four_d" ? "four_d" : "standard";
      if (schedule.format !== expected) payoutIssues.push({ message: `${template.name} · ${label}: choose a ${expected === "four_d" ? "4D" : "standard"} payout schedule.`, href: templatesHref });
      if (main && schedule.shortRound && !template.shortRound) payoutIssues.push({ message: `${template.name}: its payout schedule includes a short-round purse, but the template has no short round.`, href: templatesHref });
      for (const issue of schedule.issues) payoutIssues.push({ message: `${template.name} · ${label} (${schedule.name}): ${issue}`, href: payoutsHref });
    }
    checkSchedule(template.scheduleId, "Main purse", template.fees.some((fee) => fee.contributes && !["side_pot", "insurance", "added_money"].includes(fee.kind)), true);
    for (const fee of template.fees) {
      if (["side_pot", "insurance"].includes(fee.kind)) checkSchedule(fee.scheduleId, fee.title, true, false);
      if (fee.kind === "added_money" && fee.fundId && !data.funds.some((fund) => fund.id === fee.fundId && fund.active)) add(`${fee.title} uses an inactive or missing added-money fund.`, "/funds");
    }
  }
  const classIssues = divisions.flatMap((division) => {
    const formats = templates.filter((template) => (template.availableDivisionIds ?? [template.divisionId]).includes(division.id)).map((template) => template.format);
    // Open 4D competitions do not require individual member classifications.
    const needsClasses = !formats.length || formats.some((format) => format !== "four_d");
    return needsClasses && !classes.some((item) => item.divisionId === division.id)
      ? [{ message: `${division.name}: add active member classifications.`, href: classificationsHref }] : [];
  });
  const completeSchedules = [...schedules.values()].filter((schedule) => !schedule.issues.length);
  const drafts = [...schedules.values()].filter((schedule) => schedule.issues.length && !usedSchedules.has(schedule.id));
  const validSeasons = data.seasons.filter((season) => season.first <= season.last);
  const currentSeason = validSeasons.find((season) => season.first <= data.today && season.last >= data.today);
  const nextSeason = validSeasons.filter((season) => season.first > data.today).sort((a, b) => a.first.localeCompare(b.first))[0];
  const availableSeason = currentSeason ?? nextSeason;
  const seasonIssues: ChecklistIssue[] = data.seasons.filter((season) => season.first > season.last).map((season) => ({ message: `${season.name}: correct the start and end dates.`, href: seasonsHref }));
  if (!availableSeason) seasonIssues.push({ message: data.seasons.length ? "Only past seasons are configured. Add the next season's dates." : "Define a season's start and end dates for standings, attendance and membership dues.", href: seasonsHref });
  const duesIssues: ChecklistIssue[] = [];
  if (data.dues) {
    if (!availableSeason) duesIssues.push({ message: "Add current or upcoming season dates before charging seasonal dues.", href: seasonsHref });
    if (data.dues.allocation > 0 && !data.funds.some((fund) => fund.id === data.dues!.fundId && fund.active)) duesIssues.push({ message: "Choose an active destination fund for the dues contribution.", href: duesHref });
  }
  const qualificationIssues = data.qualifications.flatMap((rule) => {
    const season = validSeasons.find((season) => season.id === rule.seasonId);
    if (!season) return [{ message: `${rule.name}: select a valid season.`, href: qualificationsHref }];
    return ([ ["Standings", rule.standingsCutoff], ["Attendance", rule.attendanceCutoff] ] as const).flatMap(([label, cutoff]) => cutoff && (cutoff < season.first || cutoff > season.last)
      ? [{ message: `${rule.name}: ${label.toLowerCase()} cutoff is outside its season dates.`, href: qualificationsHref }] : []);
  });
  const hasClassRequirement = divisions.some((division) => !templates.some((template) => (template.availableDivisionIds ?? [template.divisionId]).includes(division.id)) || templates.some((template) => (template.availableDivisionIds ?? [template.divisionId]).includes(division.id) && template.format !== "four_d"));
  const noSchedules = schedules.size === 0;
  const payoutStatus: SetupStatus = payoutIssues.length || (!noSchedules && !completeSchedules.length) ? "attention" : noSchedules ? "optional" : "ready";
  return [
    { id: "divisions", group: "competition", title: "Divisions", status: divisions.length ? "ready" : "attention", detail: divisions.length ? `${count(divisions.length, "active division")} · ${divisions.map((division) => division.name).join(", ")}` : "Add the divisions your producer offers.", href: classificationsHref, issues: [] },
    { id: "classifications", group: "competition", title: "Member classifications", status: !divisions.length || classIssues.length ? "attention" : hasClassRequirement || classes.length ? "ready" : "optional", detail: classes.length ? count(classes.length, "active classification") : hasClassRequirement || !divisions.length ? "Set up member skill levels and any standalone age classes." : "Your active 4D formats do not require member classifications.", href: classificationsHref, issues: classIssues },
    { id: "templates", group: "competition", title: "Roping templates", status: templates.length && !templateIssues.length ? "ready" : "attention", detail: templates.length ? `${count(templates.length, "active template")} · reusable across classifications` : "Create a reusable format for each division.", href: templatesHref, issues: templateIssues },
    { id: "payouts", group: "competition", title: "Payout schedules", status: payoutStatus, detail: noSchedules ? "No schedules configured. Needed for ropings with a cash purse." : `${count(completeSchedules.length, "complete schedule")}${drafts.length ? ` · ${count(drafts.length, "unused incomplete draft")}` : ""}`, href: payoutsHref, issues: payoutIssues.length ? payoutIssues : !noSchedules && !completeSchedules.length ? [{ message: "Finish at least one payout schedule before using it in a template.", href: payoutsHref }] : [] },
    { id: "seasons", group: "membership", title: "Season dates", status: seasonIssues.length ? "attention" : "ready", detail: availableSeason ? `${currentSeason ? "Current" : "Next"} season: ${availableSeason.name} · ${dateLabel(availableSeason.first)} to ${dateLabel(availableSeason.last)}` : "Standings, attendance and dues are tracked by season.", href: seasonsHref, issues: seasonIssues },
    { id: "dues", group: "membership", title: "Membership dues", status: !data.dues ? "optional" : duesIssues.length ? "attention" : "ready", detail: !data.dues ? "Not configured. Set this up if you collect seasonal membership dues." : `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(data.dues.amount / 100)} per season · ${data.dues.installments ? "Installments allowed" : "Full payment"}`, href: duesHref, issues: duesIssues },
    { id: "qualifications", group: "qualification", title: "Qualification requirements", status: !data.qualifications.length ? "optional" : qualificationIssues.length ? "attention" : "ready", detail: data.qualifications.length ? `${count(data.qualifications.length, "rule set")} · select one on events that require qualification` : "Not configured. Needed only for events with entry qualifications.", href: qualificationsHref, issues: qualificationIssues },
  ];
}

export function setupChecklistSummary(items: ChecklistItem[]) {
  const required = items.filter((item) => item.status !== "optional");
  return { ready: required.filter((item) => item.status === "ready").length, total: required.length,
    attention: items.filter((item) => item.status === "attention").length, optional: items.filter((item) => item.status === "optional").length,
    next: items.find((item) => item.status === "attention") ?? null };
}
