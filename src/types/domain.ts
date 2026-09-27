export type OrganizationRole = "owner" | "admin" | "operator" | "viewer";
export type MembershipStatus = "active" | "pending" | "expired" | "inactive";
export type RopingStatus = "draft" | "scheduled" | "entries_open" | "entries_closed" | "in_progress" | "completed" | "cancelled";
export type FeeScope = "entry" | "contestant_division" | "contestant_event";
export type ResultStatus = "unofficial" | "official";

export interface MemberSummary {
  id: string;
  memberNumber: string;
  name: string;
  email: string;
  phone: string;
  classification: string;
  status: MembershipStatus;
  joinedAt: string;
}

export interface RopingSummary {
  id: string;
  title: string;
  date: string;
  location: string;
  divisions: number;
  entries: number;
  status: RopingStatus;
  resultStatus?: ResultStatus;
}
