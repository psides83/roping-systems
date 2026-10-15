export const helpCategories = ["Getting started", "Before the event", "Event day", "After the event"] as const;
export type HelpCategory = typeof helpCategories[number];
export interface ProducerGuide {
  id: string;
  title: string;
  summary: string;
  category: HelpCategory;
  keywords: string[];
  before: string;
  steps: string[];
  outcome: string;
  troubleshooting: string;
  destination: { label: string; href: string };
  related: string[];
}

export const producerGuides: ProducerGuide[] = [
  {
    id: "first-setup", title: "Set up your first event", category: "Getting started",
    summary: "Understand divisions, classifications, and templates, then build your first schedule.",
    keywords: ["onboarding", "start", "number", "division", "classification", "template"],
    before: "Use an owner or administrator account to configure your producer. Other staff may have access to only part of the workflow.",
    steps: [
      "Open the setup checklist. Follow the next suggested step; optional features can stay unconfigured.",
      "In Divisions & classifications, organize the competition types you offer, such as Calf roping and Breakaway. Add the classifications needed by your formats, such as #10, Open, or an age group.",
      "Create a reusable roping template. Set its format, rounds, entry allowance, timing, fees, and payout schedule. A template can be available to more than one division.",
      "Open Ropings and choose Create event. Set the event's dates and venue, then add the actual ropings using your saved templates and the appropriate classifications.",
      "Review the schedule by day and arena, check event readiness, and review public visibility and the online entry window before sharing the event.",
    ],
    outcome: "You have a saved event with a schedule built from reusable templates. Saving the event and making it visible to the public are separate choices.",
    troubleshooting: "If a template cannot be scheduled, check that its division and required classifications are active. The setup checklist reviews saved defaults; the event has a separate readiness review.",
    destination: { label: "Open setup checklist", href: "/settings/setup" }, related: ["templates", "schedule-event", "publishing"],
  },
  {
    id: "templates", title: "Create and update roping templates", category: "Before the event",
    summary: "Choose reusable defaults and understand which changes affect an existing event.",
    keywords: ["enter twice", "second entry", "two entries", "2 entries", "entry limit", "rounds", "handicap", "4D", "fees", "attendance", "draw spacing"],
    before: "Set up the divisions and classifications used by the template. Prepare a compatible payout schedule when your fees contribute to a payout pool.",
    steps: [
      "Open Roping templates and choose New roping template. Give it a name staff will recognize, such as Two-head · Enter twice.",
      "Choose the available divisions and competition format. Standard, Handicap, and 4D formats use different scoring and payout settings.",
      "Set main rounds and maximum entries per contestant separately. Two rounds means each entry has two main runs; a maximum of two entries lets a contestant enter that scheduled roping twice.",
      "Choose whether attendance counts once per roping or for each entry. This is a separate setting from the entry allowance and number of rounds.",
      "Review timing, order, short-round settings, fees, and payout schedules, then save. Duplicate a template when you need another version without changing its existing defaults.",
      "For an existing event, open its template-update review and compare the changes before applying them. Review updates to events with entries carefully; some updates are blocked to protect activity or payments already recorded.",
    ],
    outcome: "New ropings copy the saved defaults. Editing a template does not silently replace settings in existing scheduled ropings. Templates stay grouped by division. Choose Reorder in a division, drag the compact rows, then choose Save order. Cancel discards the draft order.",
    troubleshooting: "If a setting is unavailable, check the producer's feature settings and the chosen format. Inactive templates are retained but are not offered for new ropings. A regular entry allowance and earned finals bonus positions are separate concepts.",
    destination: { label: "Open roping templates", href: "/settings/roping-templates" }, related: ["first-setup", "schedule-event", "payouts"],
  },
  {
    id: "schedule-event", title: "Build an event schedule", category: "Before the event",
    summary: "Schedule multiple days and arenas, reuse templates, and review running order.",
    keywords: ["create", "weekend", "arena", "follows", "drag", "reorder", "date"],
    before: "Have active templates and the classifications needed by their formats ready. Decide the event dates, venue, and number of arenas.",
    steps: [
      "Open Ropings and choose Create event. The event is the full day or weekend; each scheduled roping is a competition inside it.",
      "Enter the event details and location. The public page address is filled from the event title and can be adjusted before saving.",
      "Add each actual roping from a template, choose its classification when required, and assign its date and arena. You can schedule the same template more than once.",
      "Choose a fixed start time or Follows previous. A follows roping needs an earlier roping in the same arena and day.",
      "Drag handles or use arrows to adjust running order. Inside the create-event form, submit the form to save the draft schedule. On a saved event, allowed reorder actions save automatically within the same day and arena.",
      "Review the optional event charge, public visibility, and online entry dates before choosing Create event. Draft events stay hidden until you publish them. Then review event readiness before opening entries or starting competition.",
    ],
    outcome: "The event has a saved schedule with clear dates, arenas, and running order. Reordering a saved schedule does not move a roping to another day or arena.",
    troubleshooting: "If a move is rejected, check the event status and any follows-previous dependency. Roping order cannot change after the event starts. Use the schedule editor for date or arena changes before competition.",
    destination: { label: "Open events", href: "/events" }, related: ["templates", "publishing", "live-desk"],
  },
  {
    id: "entries", title: "Accept entries, check in, and collect payment", category: "Event day",
    summary: "Follow a contestant from an online request or office entry to check-in and payment.",
    keywords: ["online", "cash", "request", "guest", "non-member", "unpaid", "waitlist", "withdraw", "transfer"],
    before: "Open the event's Entries screen. Your staff role must allow the action you need; approval exceptions and payment adjustments may require a manager.",
    steps: [
      "Review online requests and their selected ropings and quantities. An online request is not the same as an accepted entry; review and accept it before treating the contestant as entered.",
      "Use Add entry for an in-person contestant. Search for an existing roper first, then select the ropings and entry options they need.",
      "Review eligibility, the per-contestant entry allowance, and any capacity or waitlist message. Ask a manager about exceptions rather than creating a duplicate roper record.",
      "Use Check in when the contestant arrives. Check-in and payment are separate actions.",
      "Record cash actually received and review the remaining balance. Open the fee breakdown to understand the charges; an unpaid status alone does not explain the amount due.",
      "Use the entry's transfer or withdrawal action when plans change. Review the fee and balance consequences before confirming.",
    ],
    outcome: "Accepted entries, arrival, charges, and payments are recorded separately so staff can see what remains to be done.",
    troubleshooting: "Filter the ledger by payment or arrival to find outstanding work. If a roping is full, use its waitlist where configured. If a control is disabled, check your staff access and the event's current status.",
    destination: { label: "Choose an event", href: "/events" }, related: ["schedule-event", "payouts", "staff-access"],
  },
  {
    id: "live-desk", title: "Prepare the draw and record results", category: "Event day",
    summary: "Save a draw, take timing control, record times, and handle corrections safely.",
    keywords: ["timer", "draw", "no time", "rerun", "disqualified", "penalty", "offline", "connection", "saved status"],
    before: "Open the correct event desk, roping, arena, and round. Timing staff need the appropriate assignment and must take timing control before recording results.",
    steps: [
      "Check the selected roping, arena, and round before preparing the draw. Build the starting order using the available controls.",
      "Where manual changes are allowed, drag or use arrows to adjust the draw, then choose Save order. Draw reordering does not save automatically. Short-round and locked-draw restrictions still apply.",
      "Take timing control for this roping. Only one browser session can hold timing control for it at a time; release control when handing the desk to another worker.",
      "Confirm the contestant in the box, enter the timer readings, and select applicable penalties. Review the final run time before saving and moving to the next roper.",
      "Use the explicit outcome controls for No time, Disqualified, Turn out, or Rerun required. For an already saved result, use the correction workflow and provide the required reason.",
      "Complete each round when its required runs are resolved. Review completion and result-finality steps before finalizing the event's payouts.",
    ],
    outcome: "The desk distinguishes entered readings, device drafts, and results confirmed by the server. Saved results and completed rounds remain subject to the app's correction and locking rules.",
    troubleshooting: "If a save times out, it may still have reached the server. Use Check saved status before changing the result. Reconnect and regain timing control before retrying. Device recovery covers the main timing draft; it is not a full offline event mode and does not preserve unsaved custom draw changes.",
    destination: { label: "Open event desks", href: "/events/current" }, related: ["staff-access", "entries", "payouts"],
  },
  {
    id: "payouts", title: "Review winnings and record payouts", category: "After the event",
    summary: "Distinguish live projections, finalized winnings, and money actually paid.",
    keywords: ["money", "purse", "fee", "side pot", "insurance", "added money", "finalize", "payment", "receipt"],
    before: "Open the event's Payouts screen. Review paid entries, payout-contributing fees, optional pools, added money, and completion requirements. You need the appropriate financial or management access to record changes.",
    steps: [
      "Review the live projections and the entries and fees included in each pool. Required fees, displayed entry prices, and contributions to the main purse are separate settings.",
      "Review side pots and insurance as separate pools using their own payout schedules. Check any fund allocations or added money for the roping.",
      "Resolve the event's outstanding competition and financial readiness items. Review winners and totals before finalizing a roping's payouts.",
      "Use the payout register to review finalized winnings and each contestant's amount still due. A calculated award does not by itself mean money was paid.",
      "Choose Record payout when money has actually been paid. Record the method, recipient, and other requested details, then review payment history and any receipt acknowledgment.",
      "Use the documented reversal or correction action if a recorded payment is wrong; retain the reason and review the resulting balance.",
    ],
    outcome: "Projected awards, finalized winnings, and recorded payments are distinguishable. Staff can see the unpaid remainder and payment history.",
    troubleshooting: "If a projection is lower than expected, check paid entries, purse contributions, selected optional pools, and added money. If finalization is blocked, follow the readiness items shown on that event rather than changing a payout schedule to bypass them.",
    destination: { label: "Choose an event", href: "/events" }, related: ["entries", "reports", "templates"],
  },
  {
    id: "publishing", title: "Control what the public can see", category: "Before the event",
    summary: "Understand event progress, entry windows, public visibility, and published rules.",
    keywords: ["publish", "draft", "unpublished", "official", "results", "rules", "bulletin", "news", "public URL"],
    before: "Decide what should be visible to ropers. Only staff with the required access can change publication and result-finality settings.",
    steps: [
      "Treat event progress, public visibility, and result finality as separate decisions. Scheduled or In progress describes operations; Draft or Published describes visibility; unofficial or official describes results.",
      "On the event overview, review Event progress, Public visibility, and Results. Select a visibility setting and choose Save to apply it; an unsaved choice has not changed the public page. Set the online entry window separately.",
      "For public rules or a news bulletin, edit the draft and use Preview to check its content. Save draft preserves work without replacing the published version.",
      "Choose Publish only when the draft is ready for the public. Unpublish hides published content while retaining the draft.",
      "Use the public page to verify what ropers can see after a publication change. Mark results official runs a final readiness check and completes the event. It keeps the saved public visibility; hidden results stay hidden until the event is published.",
    ],
    outcome: "Staff can tell whether an event is operating, whether it is publicly visible, and whether its results are official without treating those as one status.",
    troubleshooting: "If an event is missing from the public page, review its visibility and publication settings. If entries are unavailable, also check the entry window, eligibility, and whether online entries are enabled.",
    destination: { label: "Open events", href: "/events" }, related: ["schedule-event", "entries", "live-desk"],
  },
  {
    id: "qualification-rules", title: "Set qualification rules and publish finals requirements", category: "Before the event",
    summary: "Use one rule system for finals and other qualified ropings. Publish finals requirements with a checkbox.",
    keywords: ["qualification", "finals", "attendance", "rank", "AND", "OR", "cutoff", "bonus entries", "publish"],
    before: "Create a producer season. Owners and administrators can manage qualification rules.",
    steps: [
      "Open Qualification rules and create or edit a named rule set. Choose the season whose official results and attendance should count.",
      "Set minimum ropings and top standings places. A minimum of 0 disables attendance requirements; blank top places disables the rank limit. Choose AND for both enabled requirements or OR for either.",
      "Set standings and attendance cutoff dates separately. Dates include that day; blank uses season end. Attendance follows each source roping’s attendance-count setting.",
      "For finals, check Finals qualification rules — publish on public standings. Saving publishes that rule set’s requirements for its season and applicable class. Uncheck it to remove that public finals listing without deleting the rule set.",
      "Choose how assigned earned positions can bypass requirements and whether they add bonus entries. These settings do not register a roper automatically.",
      "Select the rule set on the event or individual roping. Individual ropings can inherit the event rules, select another set, or turn qualification off. Review entry eligibility before accepting requests.",
    ],
    outcome: "The same saved rule set supplies event entry requirements and, when marked as finals, the public finals requirements. Publication and assignment are separate choices.",
    troubleshooting: "Converted finals rules retain their original classification scope and entry allowances. Multiple published finals rule sets are listed separately; the rule assigned to the event determines entry eligibility. Other membership, age, and entry checks still apply.",
    destination: { label: "Open qualification rules", href: "/settings/qualifications" }, related: ["standings-finals", "schedule-event", "entries"],
  },
  {
    id: "standings-finals", title: "Set qualification requirements and assign finals positions", category: "Before the event",
    summary: "Distinguish standings eligibility, earned positions, and assignments to scheduled ropings.",
    keywords: ["standings", "finals", "bonus entries", "attendance", "rank", "cutoff", "expired", "assignment"],
    before: "Create a producer season and the needed divisions/classifications. Owners and administrators manage standings requirements; finals actions require the relevant staff access.",
    steps: [
      "Open Roping setup → Qualification rules and create or edit the finals rule set for the season.",
      "Set rank, attendance, and cutoff requirements, and review which requirements earned bonus entries must meet. Mark the rule set as finals to publish its requirements, then choose Save rules.",
      "On the event schedule, assign the finals rule set to the event or individual roping. Enable earned bonus entries in that rule set if your finals allow them.",
      "Open Finals positions for the season to review earned positions, qualifying-result issues, and manual award history.",
      "Use the assignment statuses or Show all positions to find an award. Pending means it has not been assigned; Needs review means its assigned class no longer matches.",
      "Expand a position, choose a matching scheduled roping with bonus entries enabled, enter a reason, and choose Save assignment. Then use Target entry review to check eligibility.",
      "Review ties and other qualifier decisions separately. Unassigned positions expire after the season ends; started or closed target ropings lock assignment changes.",
    ],
    outcome: "Saved standings requirements and earned-position assignments are separate, visible decisions. An earned position is not automatically a usable entry in every roping.",
    troubleshooting: "If no ready target appears, check the class, qualification setup, bonus-entry setting, date, and roping status. Show all positions to recover from an empty filter. A viewer cannot change assignments.",
    destination: { label: "Open qualification rules", href: "/settings/qualifications" }, related: ["first-setup", "templates", "staff-access"],
  },
  {
    id: "staff-access", title: "Understand staff access and timing handoffs", category: "Getting started",
    summary: "Give staff the right responsibilities and explain unavailable controls.",
    keywords: ["permission", "role", "disabled", "viewer", "entry office", "timing staff", "treasurer", "arena assignment"],
    before: "An owner or administrator manages staff. Staff access is separate from a roper's membership or public portal account.",
    steps: [
      "Open Settings → Staff to review the people working for this producer. Choose access that matches each person's responsibilities.",
      "Use event assignments for event-scoped workers. For timing staff, choose the permitted arena or All arenas where available.",
      "Have the staff member open the event using their own account and verify the tasks they need. Reading a screen does not imply permission to change everything on it.",
      "For timing handoffs, release the current browser's timing control before the next worker takes control. Managers have a separate takeover process that requires confirmation and a reason.",
      "If an action is unavailable, check the worker's role and assignment, the event and round status, and whether another browser holds timing control.",
    ],
    outcome: "Each worker can identify the tasks and arenas they are responsible for. Timing control identifies the browser currently allowed to record a roping's results.",
    troubleshooting: "Ask an owner or administrator to review access if your assignment is wrong. An expired connection or timing lease can also disable timing saves; confirm the current desk state before retrying.",
    destination: { label: "Open staff settings", href: "/settings/staff" }, related: ["live-desk", "entries", "payouts"],
  },
  {
    id: "reports", title: "Find and export the right report", category: "After the event",
    summary: "Choose the report, review its scope, and download the matching records.",
    keywords: ["CSV", "export", "standings", "attendance", "collections", "funds", "season", "filters"],
    before: "Have the season or event you want to review in mind. Available reports depend on your staff access.",
    steps: [
      "Open Reports & exports and choose the report matching the question you want to answer, such as standings, attendance, payouts, funds, or fee collections.",
      "Review the selected season, classification, event, date range, and other filters offered for that report. The meaning of the date filter depends on the report; read its label.",
      "Apply filters and check the report title, columns, and row count before downloading. A preview displays only the first part of a larger result.",
      "Download the report using the same applied filters. Keep the scope with the file when sharing it with other authorized staff.",
    ],
    outcome: "The exported records correspond to the selected report and its applied scope. Finalized winnings, recorded payments, and attendance counts answer different questions.",
    troubleshooting: "If no records match, clear restrictive filters and verify the season and event. If a report is unavailable, ask a producer administrator to review your access.",
    destination: { label: "Open reports & exports", href: "/reports" }, related: ["payouts", "entries", "staff-access"],
  },
  {
    id: "print-documents", title: "Print event-day sheets and summaries", category: "Event day",
    summary: "Prepare draw sheets, timer sheets, entry summaries, and payout acknowledgment lists.",
    keywords: ["print", "PDF", "paper", "draw sheet", "timer sheet", "receipt", "all rounds"],
    before: "Open the event's Print documents screen. Available document types depend on your event, arena assignment, and financial access.",
    steps: [
      "Choose the document type: draw sheet, timer sheet, contestant entry summaries, or payout acknowledgment list.",
      "Choose the roping, round, or contestant where the document offers those filters. All rounds can include the main rounds and short round in one document.",
      "Choose View document and review the generation time, selected scope, and any provisional or review labels before printing.",
      "Choose Print / save PDF. Refresh the document and reprint if the draw, qualifiers, payments, or results change.",
      "Record paper timing results or payout acknowledgments in the app using the appropriate workflow. Printing itself does not save a result, acquire timing control, or record a payment.",
    ],
    outcome: "You have a read-only paper or PDF reference for the selected event data. It reflects the information available when generated.",
    troubleshooting: "An individual competition round needs a complete order before it can be printed. An all-round sheet can label later unbuilt rounds provisional. If a financial document is unavailable, check your staff permissions.",
    destination: { label: "Choose an event", href: "/events" }, related: ["live-desk", "entries", "payouts"],
  },
];

export const producerGlossary = [
  { term: "Division", definition: "In setup, a competition type such as Calf roping or Breakaway. Your organization may use the word division differently on its flyers." },
  { term: "Classification", definition: "A roper's class within a division, such as #10, Open, or an age group. Eligibility and Handicap adjustments can depend on it." },
  { term: "Roping template", definition: "Reusable defaults for a format, entries, timing, fees, and payouts. A scheduled roping receives a copy of those settings." },
  { term: "Event", definition: "The full day or weekend containing a schedule of individual ropings." },
  { term: "Scheduled roping", definition: "One competition within an event, with its own date, arena, format, entries, and results." },
  { term: "Entry", definition: "One contestant's accepted position in a scheduled roping. Main rounds describe the runs for that entry; entering twice creates two entries." },
  { term: "Draw", definition: "The running order for a roping and round. Manual changes must be saved before using the new order." },
  { term: "Payout projection", definition: "A calculated view of possible winnings. It is separate from finalized awards and payments actually recorded." },
];

export function findProducerGuide(id: string) {
  return producerGuides.find(guide => guide.id === id);
}
export function filterProducerGuides(query: string, category: string = "all") {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return producerGuides.filter(guide => (category === "all" || guide.category === category) && terms.every(term =>
    [guide.title, guide.summary, ...guide.keywords].join(" ").toLowerCase().includes(term)));
}
