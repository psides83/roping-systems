export type ProducerRole = "owner" | "admin" | "operator" | "viewer";
export type MembershipStatus = "active" | "pending" | "expired" | "inactive";
export type RopingStatus =
  | "draft"
  | "scheduled"
  | "entries_open"
  | "entries_closed"
  | "in_progress"
  | "completed"
  | "cancelled";
export type FeeScope = "entry" | "contestant_division" | "contestant_event";
export type FeeKind = "standard" | "insurance" | "side_pot" | "other" | "added_money";
export type ResultStatus = "unofficial" | "official";
export type CompetitionFormat = "standard" | "handicap" | "four_d";
export type RoundOrderMethod =
  | "reverse_first"
  | "aggregate_slowest_to_fastest"
  | "custom";

export interface FourDEntryBracket {
  minimumEntries: number;
  maximumEntries: number | null;
  activeDivisions: number;
  purseBasisPoints: [number, number, number, number];
  placesByDivision: [number, number, number, number];
}

export interface FourDSettings {
  splitSeconds: number;
  brackets: FourDEntryBracket[];
}

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
  publicationState?: "draft" | "published" | "unpublished";
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
  payoutScheduleId?: string | null;
  fundTracking?: "general" | "classification" | null;
}

export interface DivisionTemplateSummary {
  id: string;
  name: string;
  description: string;
  maximumEntriesPerPerson: number | null;
  minimumRunsBetweenEntries?: number;
  numberOfRuns?: number;
  cattleDrawEnabled?: boolean;
  allowGuests: boolean;
  isActive: boolean;
  disciplineId?: string | null;
  divisionName?: string;
  timerCount?: number;
  timerResolution?: "average" | "best" | "longest";
  payoutScheduleId?: string | null;
  competitionFormat?: CompetitionFormat;
  secondRoundOrdering?: RoundOrderMethod;
  laterRoundOrdering?: RoundOrderMethod;
  handicapRules?: Record<string, number>;
  shortRoundEnabled?: boolean;
  shortRoundTiePolicy?: "advance_all" | "fastest_last_round";
  shortRoundBrackets?: Array<{
    minimumEntries: number;
    maximumEntries: number | null;
    comebackCount: number;
  }>;
  fees: FeeTemplateSummary[];
}
