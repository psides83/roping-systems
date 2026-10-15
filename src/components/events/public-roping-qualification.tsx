import type { QualificationNotice } from "@/lib/events/qualification-notice";
import { qualificationNoticeText } from "@/lib/events/qualification-notice";
import { publicQualificationBullets } from "@/lib/qualification-rule-sets";

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {month:"long",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(`${date}T12:00:00Z`));
}

export function PublicRopingQualification({ notice }: { notice: QualificationNotice }) {
  if (!notice.requirements_available || !notice.rule_name) return <p className="mt-2 text-sm leading-6 text-[#526059]">{qualificationNoticeText(notice)}</p>;
  const standingsCutoff = notice.cutoff_on ?? notice.season_ends_on;
  const attendanceCutoff = notice.attendance_cutoff_on ?? notice.season_ends_on;
  return <section aria-label="Qualification requirements" className="my-3 space-y-2 rounded-md border border-[#dfe4e1] bg-white p-3 text-sm leading-6 text-[#526059]">
    <h5 className="font-semibold text-[#17201c]">Qualification required</h5>
    <p>{notice.season_name} season</p>
    {notice.requirement_match === "any" && notice.top_places !== null && (notice.minimum_ropings ?? 0) > 0 && <p className="font-semibold">Meet either the standings or attendance requirement below:</p>}
    <ul className="list-disc space-y-1 pl-5">{publicQualificationBullets({top_places:notice.top_places,minimum_ropings:notice.minimum_ropings ?? 0,earned_position_policy:notice.earned_position_policy ?? "none",bonus_entries_enabled:notice.bonus_entries_enabled ?? false}).map(text=><li key={text}>{text}</li>)}</ul>
    {standingsCutoff && attendanceCutoff && <p>{standingsCutoff === attendanceCutoff ? `Standings and attendance count through ${dateLabel(standingsCutoff)}.` : `Standings count through ${dateLabel(standingsCutoff)}. Attendance counts through ${dateLabel(attendanceCutoff)}.`}</p>}
  </section>;
}
