# Live desk usability pass — October 15, 2026

The mobile live desk now prioritizes the current roper and timer readings. Roping and round selectors share a row, round progress is compact, and the current roper appears before device-draft status. Timer save behavior and timing permissions remain unchanged.

On phones and tablets, **View draw & results** expands the full searchable draw below the timing desk. Desktop keeps the draw and timing desk side by side. Optional draw tools use a disclosure; required preparation and unsaved draw changes remain expanded. Draw changes still require an explicit save.

The event workflow strip scrolls to the active screen, including after resizing. Contextual help remains accessible in a new tab.

## Validation

- All 540 existing tests passed, including timing safety and draft recovery coverage.
- TypeScript and ESLint passed.
- Browser checks at phone and desktop sizes confirmed the current roper, selectors, active navigation, and draw disclosure. Preview mode correctly kept timing actions disabled.
- Production build passed.
- No database changes are required for this batch. The two ordering migrations from the earlier UX batch have already been applied to Supabase.
