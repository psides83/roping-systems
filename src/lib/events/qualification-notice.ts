export interface QualificationNotice {
  event_roping_id: string;
  season_name: string;
  top_places: number | null;
  minimum_ropings: number | null;
  cutoff_on: string | null;
  requirements_available: boolean;
  requirement_match?: "all" | "any";
}

export function qualificationNoticeText(notice: QualificationNotice): string {
  if (!notice.requirements_available) return "Qualification required · Contact the producer for requirements";
  if (notice.requirement_match === "any" && notice.top_places && notice.minimum_ropings) {
    return [`${notice.season_name} qualification`, `Top ${notice.top_places} OR ${notice.minimum_ropings} ropings attended`, notice.cutoff_on ? `Through ${notice.cutoff_on}` : "Live standings"].join(" · ");
  }
  return [
    `${notice.season_name} qualification`,
    notice.top_places ? `Top ${notice.top_places}, including ties` : null,
    notice.minimum_ropings ? `${notice.minimum_ropings} ropings required` : null,
    notice.cutoff_on ? `Through ${notice.cutoff_on}` : "Live standings",
  ].filter(Boolean).join(" · ");
}
