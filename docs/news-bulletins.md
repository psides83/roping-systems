# News Bulletin

Owners and administrators manage individual dated bulletins under Settings > News Bulletin.
The shared Rules editor supports headings, formatted text, sections, subsections, and HTTPS PDF links.

- Save draft keeps edits private. A complete title, date, and section are required to publish.
- Publishing replaces only that bulletin's public snapshot, not other announcements.
- Unpublish hides a bulletin while retaining its draft. Delete removes both snapshots with an audit record.
- Revision checks prevent stale edits from overwriting another administrator's changes.
- Public News lists published snapshots only, latest first, with search, sorting, and ten items per page.
- Sections are collapsed initially; a `?bulletin=UUID` link opens the requested bulletin on its page.
- Printing a bulletin isolates that document rather than printing all announcements.

Migration: `20261008170000_producer_news_bulletins.sql`.
Permission and publication tests: `supabase/tests/producer-news-bulletins.sql` (rolled back, no retained fixture data).
