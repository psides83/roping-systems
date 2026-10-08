export interface QualificationNotice {
  event_roping_id: string;
  season_name: string;
  top_places: number | null;
  minimum_ropings: number | null;
  cutoff_on: string | null;
  attendance_cutoff_on?: string | null;
  requirements_available: boolean;
  requirement_match?: "all" | "any";
}

export function qualificationNoticeText(notice: QualificationNotice): string {
  if (!notice.requirements_available) return "Qualification required · Contact the producer for requirements";
  const cutoffs = `Standings through ${notice.cutoff_on ?? "season end"} · Attendance through ${notice.attendance_cutoff_on ?? "season end"}`;
  if (notice.requirement_match === "any" && notice.top_places && notice.minimum_ropings) {
    return [`${notice.season_name} qualification`, `Top ${notice.top_places} OR ${notice.minimum_ropings} ropings attended`, cutoffs].join(" · ");
  }
  return [
    `${notice.season_name} qualification`,
    notice.top_places ? `Top ${notice.top_places}, including ties` : null,
    notice.minimum_ropings ? `${notice.minimum_ropings} ropings required` : null,
    cutoffs,
  ].filter(Boolean).join(" · ");
}
