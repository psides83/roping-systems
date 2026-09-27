import type { DivisionTemplateSummary, MemberSummary, RopingSummary } from "@/types/domain";

export const members: MemberSummary[] = [
  { id: "1", memberNumber: "RR-1042", name: "Jace Holloway", email: "jace@example.com", phone: "(940) 555-0182", classification: "Open", status: "active", joinedAt: "Jan 12, 2024" },
  { id: "2", memberNumber: "RR-1168", name: "Mason Cole", email: "mason@example.com", phone: "(817) 555-0131", classification: "#2", status: "active", joinedAt: "Feb 3, 2025" },
  { id: "3", memberNumber: "RR-1204", name: "Landon Reeves", email: "landon@example.com", phone: "(806) 555-0114", classification: "#1", status: "pending", joinedAt: "Sep 22, 2026" },
  { id: "4", memberNumber: "RR-0987", name: "Cody Bennett", email: "cody@example.com", phone: "(254) 555-0169", classification: "Open", status: "expired", joinedAt: "Mar 18, 2023" },
  { id: "5", memberNumber: "RR-1181", name: "Wyatt James", email: "wyatt@example.com", phone: "(325) 555-0122", classification: "#2", status: "active", joinedAt: "Nov 9, 2025" },
];

export const ropings: RopingSummary[] = [
  { id: "fall-classic", title: "Fall Classic", date: "Sep 27, 2026", location: "Red River Arena, Wichita Falls", divisions: 3, entries: 86, status: "in_progress", resultStatus: "unofficial" },
  { id: "october-series", title: "October Series Roping", date: "Oct 11, 2026", location: "Circle T Arena, Hamilton", divisions: 4, entries: 42, status: "entries_open" },
  { id: "turkey-run", title: "Turkey Run", date: "Nov 14, 2026", location: "Red River Arena, Wichita Falls", divisions: 3, entries: 0, status: "scheduled" },
  { id: "summer-finale", title: "Summer Series Finale", date: "Aug 30, 2026", location: "Young County Arena, Graham", divisions: 4, entries: 112, status: "completed", resultStatus: "official" },
];

export const liveRuns = [
  { draw: 17, name: "Jace Holloway", entry: 1, time: "9.42", penalty: "-", total: "9.42", status: "complete" },
  { draw: 18, name: "Tyler McCoy", entry: 2, time: "10.08", penalty: "+10", total: "20.08", status: "complete" },
  { draw: 19, name: "Cody Bennett", entry: 1, time: "NT", penalty: "-", total: "NT", status: "complete" },
  { draw: 20, name: "Mason Cole", entry: 1, time: "", penalty: "", total: "", status: "current" },
  { draw: 21, name: "Wyatt James", entry: 1, time: "", penalty: "", total: "", status: "waiting" },
  { draw: 22, name: "Jace Holloway", entry: 2, time: "", penalty: "", total: "", status: "waiting" },
];

export const divisionTemplates: DivisionTemplateSummary[] = [
  { id: "open", name: "Open", description: "Open to all active members and approved guests", numberOfRuns: 1, maximumEntriesPerPerson: null, allowGuests: true, isActive: true, fees: [{ id: "open-entry", title: "Entry fee", amountCents: 5000, scope: "entry", includedInEntryPrice: true, contributesToPayout: true }, { id: "open-stock", title: "Stock fee", amountCents: 1000, scope: "entry", includedInEntryPrice: true, contributesToPayout: false }, { id: "open-office", title: "Office fee", amountCents: 500, scope: "contestant_event", includedInEntryPrice: false, contributesToPayout: false }] },
  { id: "number-two", name: "#2 Division", description: "For contestants classified #2 or below", numberOfRuns: 1, maximumEntriesPerPerson: 3, allowGuests: true, isActive: true, fees: [{ id: "two-entry", title: "Entry fee", amountCents: 4000, scope: "entry", includedInEntryPrice: true, contributesToPayout: true }, { id: "two-office", title: "Office fee", amountCents: 500, scope: "contestant_event", includedInEntryPrice: false, contributesToPayout: false }] },
  { id: "novice", name: "Novice", description: "Organization-approved novice contestants", numberOfRuns: 2, maximumEntriesPerPerson: 1, allowGuests: false, isActive: true, fees: [{ id: "novice-entry", title: "Entry fee", amountCents: 3000, scope: "entry", includedInEntryPrice: true, contributesToPayout: true }] },
];
