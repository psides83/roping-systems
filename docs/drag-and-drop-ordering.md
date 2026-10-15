# Drag and drop ordering

Drag a grip handle onto another item to move it to that position. The destination
is highlighted. Releasing outside the list or cancelling the pointer gesture
leaves the order unchanged. Mouse, pen, and touch use the same handles. Existing
arrow buttons and sponsor position fields remain available.

- **Scheduled event ropings:** Save automatically. Drops stay within the same
  event day and arena. Permissions, event status, and follows-previous constraints
  are checked by the existing server action and database function.
- **Schedule drafts:** Reorder within the displayed arena. Save by submitting the
  event form, as with the existing arrows.
- **Live draw:** Handles are available under the same conditions as the draw
  arrows, with no search filter applied. Save using the existing Save order
  action. Locked draws and short rounds cannot be manually reordered.
- **Rules and bulletins:** Sections move together with their subsections.
  Subsections can move within their current parent. Use Save draft, then Publish
  when ready to update public content.
- **Sponsors:** Save automatically for owners and administrators. Hidden sponsors
  are included in the order. Concurrent edits reject stale revisions so an open
  sponsor editor cannot overwrite a reorder.

Apply `20261015110000_reorder_producer_sponsors.sql` for sponsor ordering. Other
screens reuse their existing persistence. The template ordering migration from
`20261015100000_reorder_roping_templates.sql` is still required for templates.

Checks: `tests/drag-reorder.test.mjs`, `tests/template-order-list.test.mjs`, and
`supabase/tests/reorder-producer-sponsors.sql` (transactional; rolls back changes).
