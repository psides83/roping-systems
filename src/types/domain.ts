export type OrganizationRole = "owner" | "admin" | "operator" | "viewer";
export type MembershipStatus = "active" | "pending" | "expired" | "inactive";
export type RopingStatus = "draft" | "scheduled" | "entries_open" | "entries_closed" | "in_progress" | "completed" | "cancelled";
export type FeeScope = "entry" | "contestant_division" | "contestant_event";
export type FeeKind = "standard" | "insurance" | "side_pot" | "other";
export type ResultStatus = "unofficial" | "official";

export interface MemberSummary {
  id: string;
  memberNumber: string;
  name: string;
  email: string;
  phone: string;
  classification: string;
  classifications?: Array<{ discipline: string; name: string }>;
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

export interface FeeTemplateSummary {
  id: string;
  title: string;
  amountCents: number;
  scope: FeeScope;
  includedInEntryPrice: boolean;
  contributesToPayout: boolean;
  kind?: FeeKind;
  isRequired?: boolean;
}

export interface DivisionTemplateSummary {
  id: string;
  name: string;
  description: string;
  numberOfRuns: number;
  maximumEntriesPerPerson: number | null;
  allowGuests: boolean;
  isActive: boolean;
  fees: FeeTemplateSummary[];
}
