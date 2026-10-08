export interface OnlineEntryRequest {
  id: string;
  status: "pending" | "accepted" | "declined" | "withdrawn";
  revision: number;
  submittedAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  producerResponse?: string | null;
  withdrawnAt: string | null;
  eventTitle: string;
  eventId: string;
  producerName: string;
  producerSlug: string;
  eventSlug: string;
  timezone: string;
  entriesCloseAt: string;
  canModify: boolean;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  birthDate: string | null;
  competitionGender: "female" | "male" | null;
  memberNumber: string | null;
  note: string | null;
  items: { id: string; name: string; division: string | null; date: string; quantity: number; optionIds: string[] }[];
  changes: { action: "edited" | "withdrawn"; changedAt: string }[];
}
