# Event creation usability pass — October 15, 2026

Event creation and duplication now use the shared native dialog. It contains keyboard focus, supports Escape, guards unsaved edits, and prevents dismissal during saving. The shared dialog also compares current form values with its opening values, so hidden schedule edits are protected even when a button or drag action produces no normal field-change event.

The form groups event details, location, roping schedule, optional event charge, and public visibility/online entries. Entry-window dates sit beside visibility rather than among basic details. Public page address guidance explains the generated value. A final review note follows the selected visibility, stating whether creation will make the event public.

Scheduled fields retain the same submitted names and values, including duplicated dates, fees, and schedule settings. Schedule grouping now uses a direct fieldset legend. Save failures are announced as alerts. The event scheduling guide reflects the form order.

## Verification

- 544 tests passed, including dialog discard/pending guards, hidden schedule changes, copied event values, and visibility review.
- ESLint, TypeScript, and the production build passed.
- Browser review covered desktop and 390px mobile layouts, initial field focus, clean Escape dismissal, and publication-summary updates. No production records were created. Database-backed creation remains covered by existing action tests rather than a live production submission.
- The local preview has no connected producer/database; its disabled save/schedule controls and qualification-rule load failure were expected preview limitations.
- No Supabase migration is needed.
