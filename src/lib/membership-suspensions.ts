export interface MembershipSuspension {
  id: string;
  starts_on: string;
  ends_on: string;
  reason: string;
  created_at: string;
  staff_label: string;
  lifted_at: string | null;
  lifted_by_label: string | null;
  lift_reason: string | null;
}

export function suspensionStatus(suspension: MembershipSuspension, today: string) {
  if (suspension.lifted_at) return "Lifted";
  if (today < suspension.starts_on) return "Scheduled";
  if (today > suspension.ends_on) return "Expired";
  return "Active";
}

export function validSuspensionDates(start: string, end: string) {
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
  return validDate(start) && validDate(end) && end >= start;
}
