# Roping template order

In Settings → Roping templates, drag a template's handle to its desired position.
The destination is highlighted while dragging. Releasing saves the order automatically.
Move up and move down buttons provide keyboard and touch alternatives.

The list follows one order across divisions; division labels remain on each card.
Active and inactive templates are both included. The saved producer-specific order
also controls template choices when scheduling events. Existing event schedules
are unchanged.

Only staff with template management access can save changes. Failed saves restore
the previous order and display an error. If templates were added or removed while
the page was open, refresh before reordering again.

Apply migration `20261015100000_reorder_roping_templates.sql` before using the controls.
The database validates the complete list and updates all positions atomically.
Regression checks: `tests/template-order-list.test.mjs` and
`supabase/tests/reorder-roping-templates.sql` (the latter rolls back its changes).
