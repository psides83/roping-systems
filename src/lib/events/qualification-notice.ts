export interface QualificationNotice {
  event_roping_id: string;
  season_name: string;
  top_places: number | null;
  minimum_ropings: number | null;
  cutoff_on: string | null;
  requirements_available: boolean;
}

export function qualificationNoticeText(notice: QualificationNotice): string {
  if (!notice.requirements_available) return "Qualification required · Contact the producer for requirements";
  return [
    `${notice.season_name} qualification`,
    notice.top_places ? `Top ${notice.top_places}, including ties` : null,
    notice.minimum_ropings ? `${notice.minimum_ropings} ropings required` : null,
    notice.cutoff_on ? `Through ${notice.cutoff_on}` : "Live standings",
  ].filter(Boolean).join(" · ");
}
