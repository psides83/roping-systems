# Producer UI and UX review

Date: October 15, 2026

## Recommendation

Prioritize clarity, consistency, and event-day speed before expanding the feature set. The visual direction already suits the product: a restrained dark green navigation, warm accent, white surfaces, and familiar controls. Keep that identity. The largest improvements will come from hierarchy, readable summaries, consistent behavior, and clearer next steps.

The interface should answer four questions on every important screen:

1. What am I working on?
2. What needs my attention?
3. What should I do next?
4. What will this action change, and has it saved?

This review proposes work; it does not implement a redesign.

## Review coverage and limits

Inspected the local demo at desktop width and a 390 × 844 phone viewport: dashboard, division/classification setup, template list and editor, event list and creation form, event-desk selection, and live desk preview. Checked template dialog focus and Escape behavior. Read the implementation of entries, payments, payouts, reports, setup checks, navigation, feature settings, shared controls, and save protection.

The preview used demo data with database access disabled. No production records were edited. Database-backed transactions, real staff permissions, real event volumes, unreliable-network behavior, and a full keyboard/screen-reader audit remain to be tested. Demo-specific disabled controls and missing classifications are not treated as production defects. Findings below distinguish observed behavior from code findings and proposed improvements.

## Existing strengths to preserve

- Clear, restrained brand colors and mostly consistent surfaces, borders, and spacing.
- A reusable page header and useful event workflow navigation.
- Setup checks with actionable next steps and a distinction between required and optional configuration.
- Feature visibility controls that can simplify a producer's workspace.
- Unsaved-change protection, persistent form values, and loading feedback in several workflows.
- Useful protections around locked draws, official results, financial changes, and concurrent edits.
- Financial help disclosures already support click, keyboard use, Escape, and outside dismissal. Build on this pattern.
- Text accompanies many statuses; color is not the only signal.

## Findings and proposed changes

| Priority | Finding and evidence | Proposed improvement | Acceptance condition |
| --- | --- | --- | --- |
| Before pilot | Template editor focus stays on the underlying Edit button when opened; Escape did not close it in the preview. Its custom DialogFrame has no focus management. | Standardize dialogs with an accessible name, initial focus, contained keyboard focus, Escape handling, scroll control, focus return, and dirty-form protection. | Complete the open → edit → cancel/save → return sequence using only the keyboard, without reaching the background. |
| Before pilot | On a 390px screen, template Duplicate/Edit controls leave the title and metadata in a narrow column. One template consumes most of a screen. | Make title and summary full width on phones. Move secondary actions to a compact menu or a separate row. Keep name, format, rounds, entry allowance, date, and a fee summary visible; disclose detailed timing and ordering. | A producer can compare several templates without opening each one or reading a long column of metadata. |
| Before pilot | Setup has nine horizontally scrolling tabs and producer settings has thirteen possible tabs. On the phone template view, its active tab was outside the visible portion. | Group settings into understandable categories; give mobile users a labeled section selector. Immediately scroll the active tab into view if tabs remain. | Current location and available destinations are discoverable without guessing that more tabs exist. |
| Before pilot | Division, classification, template, event, and roping are easy to confuse. The create-event form even describes the weekend as containing scheduled “events,” while nearby text says “ropings.” | Establish a small terminology guide and apply it to headings, buttons, descriptions, empty states, and help. Use “Create event” consistently for a weekend/day container and “Add roping” for a competition inside it. | A new producer can explain the setup hierarchy and create a schedule without learning the database model. |
| Before pilot | Template editing and event creation each collect many independent decisions in a long scrolling dialog. | Group template editing into Basics, Entries, Timing/order, and Payouts. For creating an event, use a roomy page with sections or a short Details → Schedule → Review flow. Include a plain-language final summary. | Common setups expose only their relevant fields, preserve edits, and show the final Save/Create action clearly. |
| Before pilot | Saving differs across screens: template/sponsor reorder saves automatically; draw order and rules edits require explicit saving. | Keep the appropriate save model, but identify it consistently: “Saves automatically,” “Unsaved changes,” “Saving…,” and “Saved.” Place the state beside the action or edited list. | Users never have to infer whether a drag, edit, or publish action persisted. Failed saves explain what remains unsaved. |
| Before pilot | The live desk has important protections and a dedicated run panel, but the phone preview puts substantial navigation, selectors, and metrics before the working inputs. The main draw table is wide. | Put current roper, roping, arena, round, time inputs, and save action first. Condense context on phones; disclose the full draw as a separate view. Retain a wide table for desktop staff. | Staff can identify the active roper and reach time entry without navigating a long page or scrolling a table sideways. |
| Before pilot | Several labels use 10–12px text and low-contrast gray. For example, #758078 on white calculates to about 4.11:1; #8a938e calculates to about 3.16:1. | Increase the size and contrast of information people must read to operate the event. Reserve faint text for genuinely secondary decoration. Use larger touch targets for operational controls. | Crucial names, amounts, times, field labels, and instructions remain legible on a laptop or phone; test outdoors and at increased zoom. |
| Before pilot | The mobile sidebar is visually translated offscreen while its links still appear in the accessibility tree. | Ensure the closed drawer is unavailable to keyboard and assistive technology. Manage focus when opening and closing it. | Tab traversal never enters a closed menu; Escape closes an open menu and returns focus to its trigger. |
| Next | Dashboard totals are not a strong work queue. Needs-attention messages do not link directly to the work. Source also hardcodes “Good afternoon” and “2026 season.” Its latest-date schedule query is reused in the upcoming-event detail. | Lead with today's event and actionable tasks. Link each count to a filtered list. Use real season/date context or remove decorative context that can be inaccurate. Separate upcoming events from recent history. | Each attention item opens the right task; zero-action items disappear; dates, greetings, and scopes are truthful. |
| Next | Event progress, publication visibility, and result finality are distinct, but their badges can look like one set of unrelated statuses. | Present explicitly labeled groups: Event progress, Public visibility, and Results. Explain their effects beside the corresponding actions. | Users can answer whether the event is running, whether the public can see it, and whether results are official. |
| Next | Template settings are copied into scheduled ropings, and existing events have a separate template-update review. | Make “Applies to new ropings” visible near template saving. Offer the existing review path for affected scheduled events, with a clear before/after summary. | Producers understand that editing a template does not silently rewrite an existing event. |
| Next | The recently added “As of” note reads the parent template's updated_at. Reordering updates that row, while fee edits can change a template without updating its parent timestamp. | Define whether the date means content last changed or row last saved. Prefer a content-change date covering editable fees/settings, excluding display-only reorder. Retain the requested “As of {date}” wording. | Changing a fee advances the date; changing list position does not imply new competition rules. Do not invent historical dates when unavailable. |
| Next | Help exists in individual places, especially financial labels, but there is no central producer help destination in the reviewed navigation. | Add a small, task-focused help area and contextual links. Generalize the existing help disclosure into a shared control. | Help opens on click/focus, works on touch, and answers the question at the point where the user encounters it. |
| Next | Multiple shared concepts—entry allowances, draw spacing, per-entry attendance, required fees, displayed price, and payout contribution—need examples more than definitions. | Add short inline explanations for consequential choices; use optional help for extra detail. Include calculated examples for fees and timing adjustments. | A producer can predict a setting's effect before saving it. |
| Next | Entries, financial closeout, and reports have substantial capabilities whose relationships may be unclear to a new producer. | Make request → accepted entry → check-in → charge → payment explicit. Explain calculated winnings versus recorded payout and projections versus final figures. Show report scope and applied filters. | Users know which records count in a total and which action changes the total. |
| Next | Source has specific retry screens for setup and arena overview, but no broad producer-area error boundary was found. | Standardize load failures, save failures, permission explanations, empty states, and filtered-zero states. Preserve entered values and offer relevant recovery actions. | A failure tells users what happened, whether anything saved, and how to continue. |

## Visual direction

Use one compact design foundation before restyling individual pages:

- A clear primary action per page or working panel. Secondary actions use quieter styling; destructive actions are separated.
- A deliberate text scale: large page title, modest section heading, readable body/labels, and consistently subordinate metadata. Avoid making essential information tiny to fit more of it.
- Consistent spacing, panel padding, field grouping, input heights, and action placement. Use borders where they establish structure, rather than outlining every fragment.
- A semantic status palette that remains recognizable under each producer's custom branding. Reserve error treatment for actual failures or urgent problems; label all statuses.
- Tabular numerals and clear alignment for amounts, draw positions, and times.
- Phone-specific layouts for important work rather than only shrinking desktop cards and tables.
- Concise summaries above advanced details. Do not require a tooltip to understand a primary action.

Keep the current visual identity and spend the design effort on scanability and interaction quality. A font change alone will not resolve these findings.

## Help strategy

Use three levels of explanation:

1. **Inline guidance:** one sentence for information required to make a safe choice. Example: “This limit applies to each contestant in this scheduled roping.”
2. **Optional contextual help:** a short explanation and example for details. Example: “Minimum runs between entries: 5 keeps repeat entries at least five positions apart when building the draw. Review any spacing issues before competition.” Verify each example against the actual rule implementation before publishing it.
3. **Task guides:** short articles linked from the relevant screen, with prerequisites, steps, outcome, and recovery advice.

Initial help topics:

- Set up your first producer and understand divisions, classifications, and templates.
- Create and publish an event; explain entry-opening dates and public visibility separately.
- Accept an online request and add a second entry.
- Check in a contestant and record payment.
- Build, adjust, save, and lock a draw.
- Record a time, penalty, no-time result, rerun, or correction.
- Review projected payouts, finalize winnings, and record payments.
- Change a template and review existing scheduled ropings.
- Configure standings, attendance, qualifications, and earned finals positions.
- Give staff the right access and understand why an action is unavailable.

Start with a small Help & guides page organized as Getting started, Before the event, Event day, After the event, and Troubleshooting. Add a glossary. Keep links to the real screen beside instructions. Existing docs can supply technical source material, but should be rewritten into producer language. Add search once there is enough content to warrant it. A large documentation portal or AI assistant is not a prerequisite for the first producer.

## Suggested delivery phases

### Phase 1 — Shared foundations and concrete usability defects

Deliver shared dialog behavior, buttons and action menus, field/help patterns, save/error states, readable text tokens, and mobile navigation behavior. Fix the observed template card and tab problems as representative applications. Resolve the dashboard's misleading static context. Give each task a narrow reviewable change.

Exit: template editing and navigation work with keyboard, phone, and desktop; ordinary actions have consistent feedback; no unexpected data or workflow changes.

### Phase 2 — First producer's setup and first event

Clarify terminology and information architecture. Make the setup checklist the initial entry into Roping setup. Simplify template editing and creation of the first event, add summary/review content, and explain copied settings. Bring actionable next steps onto the dashboard. Write the first getting-started guides alongside these changes.

Exit: someone unfamiliar with the app can configure a simple competition, schedule an event, and explain what will be public without assistance.

### Phase 3 — Event-day speed and financial clarity

Refine entries, check-in, payments, live timing, draw editing, payout review, and closeout around staff tasks. Condense mobile event context, make the current roper unmistakable, and standardize explanations for blocked actions. Preserve existing permission, locking, and financial protections. Test the consequential paths against a seeded development database.

Exit: staff can process an entry/payment, record ordinary and exceptional results, and understand payout totals without searching through unrelated setup controls.

### Phase 4 — Help coverage and complete consistency pass

Publish the small help destination and glossary, add contextual links on difficult screens, and bring membership, standings/finals, funds, reports, and public-facing journeys up to the same visual and interaction standards. Check empty, read-only, disabled-feature, and large-data states. Verify public entry and membership forms on phones.

Exit: every major feature has a clear purpose, a relevant task guide where needed, and understandable recovery behavior.

### Phase 5 — Pilot observation and refinement

Before and during the first producer's use, observe representative tasks without coaching. Record hesitations, wrong turns, repeated explanations, and help requests. Prioritize repeated friction over additional options. Test an owner, entry-office worker, timing worker, and read-only user separately.

Exit: the producer can complete the essential workflow independently, and the remaining friction is captured as concrete follow-up work.

## Suggested first implementation batch

1. Consolidate dialog behavior and fix keyboard/mobile drawer issues.
2. Improve template card layout, concise summaries, and mobile action placement.
3. Make the active setup destination visible and align core terminology.
4. Standardize “saved / saving / unsaved / failed” communication.
5. Make dashboard attention items actionable and correct static context.

This is a bounded initial batch with visible value. Defer a broad dashboard redesign, long onboarding tour, new feature surface, and extensive help library until these foundations are consistent.

## Validation plan

Use desktop, tablet, and phone widths, increased zoom, keyboard-only input, and at least one touch device. Test realistic lists rather than only a handful of demo records. Include long event names, multiple days and arenas, shared templates, repeat entries, guest ropers, and disabled features. Test failure/retry with a development database and verify that entered values survive.

Task scenarios:

1. Explain the setup hierarchy, then create a standard two-entry template.
2. Schedule a weekend in two arenas and reorder one arena without changing another.
3. Change a template and determine whether a scheduled roping changed.
4. Accept an online request, add an in-person entry, check in, and record payment.
5. Build/save a draw; record a time, penalty, and rerun; recover from a failed save.
6. Understand why a draw or result cannot be edited after locking.
7. Distinguish event visibility, entries being open, and official results.
8. Understand a projected payout, finalize it, and record a payment.
9. Find and export the intended report using an explicit date/season scope.
10. Find guidance without leaving an unfinished form or losing changes.

Measure task completion without help, number of wrong turns, hesitations, and successful recovery. Agree on practical pilot targets after the first observed sessions rather than claiming an unmeasured usability score.

## Implementation reference map

- Shell/navigation/mobile drawer: `src/components/app-shell.tsx`.
- Setup and settings destinations: `src/components/settings/roping-setup-tabs.tsx`, `producer-settings-tabs.tsx`.
- Template summaries and dates: `src/app/(app)/settings/roping-templates/page.tsx`.
- Template/fee dialog shell: `src/components/settings/division-dialogs.tsx`.
- Dashboard context and work queue: `src/app/(app)/dashboard/page.tsx`.
- Event setup and schedule: `src/app/(app)/events/[eventId]/page.tsx`, `src/components/events/scheduled-class-fields.tsx`.
- Event navigation and active context: `src/components/events/event-workflow-nav.tsx`, `live-desk-selector.tsx`.
- Live operations: `src/components/events/database-live-desk.tsx`.
- Entries and payments: `src/components/events/entry-ledger.tsx`, event entries page.
- Help foundation: `src/components/ui/financial-label.tsx`.
- Existing save protection: `src/components/ui/persistent-form.tsx`, `unsaved-changes-guard.tsx`.
- Feature descriptions: `src/lib/producer-features.ts`.
- Existing operational references: `docs/event-day-workflow.md`, `event-setup-readiness.md`, `event-financial-closeout.md`, `producer-setup-checklist.md`.
