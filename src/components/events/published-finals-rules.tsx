import { publicQualificationBullets, type QualificationRuleSet } from "@/lib/qualification-rule-sets";

type PublishedRule = Pick<QualificationRuleSet, "id" | "name" | "top_places" | "minimum_ropings" | "cutoff_on" | "attendance_cutoff_on" | "requirement_match" | "earned_position_policy" | "bonus_entries_enabled">;
function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export function PublishedFinalsRules({ rules, seasonEndsOn }: { rules: PublishedRule[]; seasonEndsOn: string }) {
  if (!rules.length) return null;
  return <section aria-label="Published finals qualification rules" className="mt-5 space-y-4 rounded-md border border-[#dfe4e1] bg-white p-4">
    <h2 className="font-bold">Finals qualification rules</h2>
    {rules.map(rule => {
      const standingsCutoff = rule.cutoff_on ?? seasonEndsOn;
      const attendanceCutoff = rule.attendance_cutoff_on ?? seasonEndsOn;
      return <article key={rule.id} className="space-y-3 text-sm leading-6 text-[#526059]">
        {rules.length > 1 && <h3 className="border-t border-[#e7ebe8] pt-3 font-semibold text-[#17201c]">{rule.name}</h3>}
        {rule.requirement_match === "any" && rule.top_places !== null && rule.minimum_ropings > 0 && <p className="font-semibold">Meet either the standings or attendance requirement below:</p>}
        <ul className="list-disc space-y-1 pl-5">{publicQualificationBullets(rule).map(text => <li key={text}>{text}</li>)}</ul>
        <p>{standingsCutoff === attendanceCutoff ? `Standings and attendance count through ${dateLabel(standingsCutoff)}.` : `Standings count through ${dateLabel(standingsCutoff)}. Attendance counts through ${dateLabel(attendanceCutoff)}.`}</p>
      </article>;
    })}
    {rules.length > 1 && <p className="text-sm leading-6 text-[#526059]">These finals have different rule sets. Check which one applies to your event.</p>}
  </section>;
}
