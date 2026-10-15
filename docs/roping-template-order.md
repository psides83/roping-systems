# Roping template order

Roping templates are displayed in separate sections by their primary division, so tie-down and breakaway stay separate. Shared templates retain their available-division labels on the card.

Choose Reorder in a division to replace its detailed cards with compact rows. Drag a handle to position a template using the insertion line, or use Up/Down on a focused handle. Save order persists the draft; Cancel or Escape discards it. Other divisions cannot enter the active reorder list. Read-only staff have no reorder controls.

Active and inactive templates are both included. The saved producer-specific order also controls template choices when scheduling events. Saving one division replaces only that division's positions in the existing complete order; other divisions retain their relative order and slots. Existing event schedules are unchanged.

Only staff with template management access can save changes. Failed saves retain the editable draft and display feedback. If templates were added or removed while the page was open, refresh before reordering again. The existing database function validates the complete list and updates all positions atomically. No new migration is required.

Validation: 584 tests passed, including division isolation, keyboard movement, drag drafts, explicit saving, cancel, read-only access, and failed-save recovery. Lint and production build passed. A sample-data browser preview verified desktop drag, keyboard movement, Cancel, and mobile layout at 390px without horizontal overflow. Supabase migration dry run confirmed the remote database is current.
