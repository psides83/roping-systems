# Producer setup checklist

Open Settings → Setup checklist, also linked from the Roping Setup tabs.
The list is a read-only review of saved setup for the active producer, not a
new requirement for running events. No additional database tables or permissions
are introduced. Existing permissions still control each destination screen.

## Statuses

- **Ready:** the checks for that section passed.
- **Needs attention:** something is missing or a configured reference needs review.
- **Optional:** the feature is not configured or is unnecessary for the active formats.

Optional items are excluded from the progress denominator. The first item needing
attention is linked as the next step. Issue lists are collapsed initially and link
to the setting that needs correction. Refresh checklist rereads saved settings;
returning to the page also loads setup again on a new server request.

## Checks

- Active divisions and the member classifications needed by their formats.
- Active division-specific reusable templates, with valid Handicap selections.
  Zero, positive and negative offsets are supported. There is no requirement for
  a separate template per class, and 4D-only formats need no member classifications.
- Referenced payout schedules must be active, complete and format-compatible.
  Main-purse fees, side pots and insurance need their corresponding schedules.
  A points-only/free template is not forced to have a payout schedule. Unused
  incomplete drafts do not invalidate other complete schedules.
- Current or upcoming season dates. Past-only setup suggests creating the next
  season; a future season is ready during an offseason.
- Optional dues settings, with a season and an active destination for any fund
  contribution. Zero contributions need no destination fund.
- Optional qualification rule sets, valid seasons and independent, inclusive
  standings/attendance cutoffs. The two cutoffs need not match.
- Explicit added-money template destinations must remain active. Automatically
  routed general/classification funds do not need to exist before their creation.

Every query is scoped to the active producer. Lists are read in deterministic
500-row pages; read failures show an error with retry, not a misleading empty or
ready checklist. Configuration checks never read or modify member payments,
standings, fund transactions, entries or timing records.

This is a setup overview, not a full business-rule audit. Event-specific dates,
arena collisions and copied settings are checked by event setup readiness. Final
competition/results checks remain separate.
