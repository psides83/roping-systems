# Event status clarity — October 15, 2026

The event overview now presents three separate areas:

- **Event progress:** the operational stage and a short next-step explanation.
- **Public visibility:** the saved publication state, what the public can see, and the visibility control for event managers.
- **Results:** unofficial or official status, with the effect of finalization explained separately from publication.

Visibility changes have a visible Save button, an unsaved-change explanation, pending feedback, and announced failures. Publishing still uses the existing setup review. Read-only staff see the saved state and an access explanation.

The official-results confirmation uses the shared native dialog and says **Mark results official** rather than **Publish official results**. It explains that finalization completes the event while preserving public visibility. Existing manager permissions, eligible event stages, and final-readiness checks remain in place. This changes presentation only; server actions and database rules are unchanged.

The publishing help guide and public-listing description now use the same distinctions.

## Validation

- All 547 tests passed. New coverage checks independent progress/publication/finality combinations, explicit visibility saves and readiness review, and official-results permission/stage/readiness/pending guards.
- ESLint, TypeScript, and production build passed.
- Browser preview reviewed the overview on desktop and a 390px phone. The preview is read-only; no production publication or finalization was performed.
- No database migration is needed.
