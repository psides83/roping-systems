# Finals and non-finals qualifications

Roping setup now separates Finals Qualifications from Non-finals qualification rules.

Finals Qualifications saves requirements per season and classification: rank, attendance, inclusive cutoffs, and earned-position bypass policy. Public standings describe those as finals rank/attendance requirements. On each scheduled roping, Finals qualification selects the finals season and whether assigned earned positions add bonus entries. Saving that selection explicitly marks the roping as finals so it does not inherit a non-finals event rule set.

Non-finals qualification rules creates named attendance/rank rule sets for other qualified events and ropings. Event creation labels these as non-finals requirements. The event/roping non-finals controls retain inheritance, a custom rule set, and no-qualification choices. New rule sets do not expose finals earned-position or bonus-entry options. Existing rule sets with those settings retain them under an explanatory disclosure, preserving existing event behavior rather than silently changing eligibility.

Both event schedule and entry review expose the separate finals/non-finals controls. Selecting a different qualification path replaces the prior assignment explicitly, subject to the existing restrictions after accepting entries or starting competition. The finals save changes assignment and qualification snapshot atomically; a failed snapshot save rolls back the assignment. Producer revision is validated under lock before the assignment change and the resulting revision is used for the snapshot save.

Migrations:
- 20261015170000_explicit_finals_qualification.sql
- 20261015170100_finals_assignment_revision.sql

Both are applied to the linked Supabase project. No existing assignments were automatically converted. Database regression checks in supabase/tests/explicit-finals-qualification.sql create test records in a transaction and roll back, covering finals isolation from event rules, failed-save atomicity, authorization, removal, and preservation after a non-finals event assignment changes.

Validation: 596 tests, lint, type checks, and production build passed. A sample-data mobile browser preview verified separate labels and controls, new non-finals rule fields, initial dialog focus, and Escape with focus return. The rule editor now uses the shared dialog for focus, scrolling, and unsaved-edit protection.
