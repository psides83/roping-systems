# Producer Public Rules

Owners and administrators manage rules under Settings > Public Rules. Sections
and subsections can be edited, removed and reordered. The visual editor displays
formatting directly while editing; an optional Markdown mode exposes the source.
Formatting supports headings, bold, italic, strikethrough, lists, quotes, dividers,
links and code. Undo, redo and clear-formatting controls are available. Raw HTML
and embedded media are not rendered on the public page. Optional
named PDF documents use external HTTPS links, not file uploads.

Save draft retains incomplete sections without changing the published version.
Preview shows the current unsaved draft. Publish requires complete headings and
rule text and replaces the published snapshot after confirmation. Unpublish
hides the public document while preserving the draft. Concurrent saves are
rejected using a revision check; editors retain their unsaved changes on errors.
Unsaved edits also prompt before in-app links, router navigation and browser
Back/Forward. The prompt offers Keep editing, Save draft and stay, or Leave
without saving. Account-switch/sign-out forms request confirmation separately.
Closing or refreshing a tab uses the browser's own unload warning; mobile and
Safari browser limitations mean unload prompts cannot guarantee recovery.

The public Rules page provides section navigation, search, collapsible
subsections, print output and effective/updated dates. Membership and online
entry forms link to it in a separate tab. Written rules are informational and
do not change scoring, classifications or entry eligibility.

The database exposes only the published document through public_producer_rules.
Draft access and saving require owner/admin access. Mutations are recorded in
the producer changelog. Run supabase/tests/producer-public-rules.sql to exercise
privacy, publication, revisions and permissions in a rollback-only transaction.
