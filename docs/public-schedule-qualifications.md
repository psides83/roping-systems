# Qualification requirements in the public schedule

Published events now show the full applicable qualification requirements beneath each scheduled roping. Events with qualification requirements open their roping schedule by default and label the disclosure “Roping schedule & qualification requirements.” Events without requirements retain the compact schedule view.

The public read function resolves event inheritance, individual rule-set overrides, and qualification opt-out. It does not filter on the finals-publication flag: any rule assigned to a published event/roping is visible with that event. Only published, non-cancelled events in the requested producer scope are included. Missing or mismatched requirements show contact guidance rather than invented rules.

The schedule uses the same natural-language bullets for rank, attendance, bonus-position exemptions, and entry allowances, with explicit OR wording and readable inclusive cutoff dates. The separate finals flag continues to control publication on the season standings page.

Migration 20261015190000_public_schedule_qualification_requirements.sql is applied. Rollback-only database tests verify inheritance, ordinary rules without the finals flag, overrides, opt-out, private events, cancelled events, and producer isolation. Application validation: 605 tests, lint, and production build passed. A sample-data mobile browser preview verified that the schedule is expanded initially and fits a 390px viewport without horizontal scrolling.
