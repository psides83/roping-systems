import type { DivisionTemplateSummary, MemberSummary, RopingSummary } from "@/types/domain";

export const members: MemberSummary[] = [
  { id: "1", memberNumber: "RR-1042", name: "Jace Holloway", email: "jace@example.com", phone: "(940) 555-0182", classification: "Open", status: "active", joinedAt: "Jan 12, 2024" },
  { id: "2", memberNumber: "RR-1168", name: "Mason Cole", email: "mason@example.com", phone: "(817) 555-0131", classification: "11.5", status: "active", joinedAt: "Feb 3, 2025" },
  { id: "3", memberNumber: "RR-1204", name: "Landon Reeves", email: "landon@example.com", phone: "(806) 555-0114", classification: "11", status: "pending", joinedAt: "Sep 22, 2026" },
  { id: "4", memberNumber: "RR-0987", name: "Cody Bennett", email: "cody@example.com", phone: "(254) 555-0169", classification: "Open", status: "expired", joinedAt: "Mar 18, 2023" },
  { id: "5", memberNumber: "RR-1181", name: "Wyatt James", email: "wyatt@example.com", phone: "(325) 555-0122", classification: "10", status: "active", joinedAt: "Nov 9, 2025" },
];

export const events: RopingSummary[] = [
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
  { id: "calf-open", name: "Calf roping · Open", description: "Open calf roping for active members and approved guests", maximumEntriesPerPerson: null, allowGuests: true, isActive: true, fees: [{ id: "open-entry", title: "Base entry", amountCents: 30000, scope: "entry", includedInEntryPrice: true, contributesToPayout: true, isRequired: true }, { id: "open-stock", title: "Stock charge", amountCents: 1500, scope: "entry", includedInEntryPrice: true, contributesToPayout: false, isRequired: true }, { id: "open-sidepot", title: "Side pot", amountCents: 5000, scope: "entry", includedInEntryPrice: false, contributesToPayout: true, isRequired: false, kind: "side_pot" }, { id: "open-insurance", title: "Insurance", amountCents: 5000, scope: "entry", includedInEntryPrice: false, contributesToPayout: true, isRequired: false, kind: "insurance" }] },
  { id: "calf-115", name: "Calf roping · 11.5", description: "Calf roping for contestants classified 11.5 or below", maximumEntriesPerPerson: 3, allowGuests: true, isActive: true, fees: [{ id: "two-entry", title: "Base entry", amountCents: 30000, scope: "entry", includedInEntryPrice: true, contributesToPayout: true, isRequired: true }, { id: "two-stock", title: "Stock charge", amountCents: 1500, scope: "entry", includedInEntryPrice: true, contributesToPayout: false, isRequired: true }, { id: "two-sidepot", title: "Side pot", amountCents: 5000, scope: "entry", includedInEntryPrice: false, contributesToPayout: true, isRequired: false, kind: "side_pot" }, { id: "two-insurance", title: "Insurance", amountCents: 5000, scope: "entry", includedInEntryPrice: false, contributesToPayout: true, isRequired: false, kind: "insurance" }] },
  { id: "breakaway-open", name: "Breakaway · Open", description: "Open breakaway roping", maximumEntriesPerPerson: 1, allowGuests: false, isActive: true, fees: [{ id: "novice-entry", title: "Entry fee", amountCents: 3000, scope: "entry", includedInEntryPrice: true, contributesToPayout: true }] },
];
