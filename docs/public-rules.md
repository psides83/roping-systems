# Producer Public Rules

Owners and administrators manage rules under Settings > Public Rules. Sections
and subsections can be edited, removed and reordered. Formatting supports bold,
italic, lists and links; raw HTML and embedded media are not rendered. Optional
named PDF documents use external HTTPS links, not file uploads.

Save draft retains incomplete sections without changing the published version.
Preview shows the current unsaved draft. Publish requires complete headings and
rule text and replaces the published snapshot after confirmation. Unpublish
hides the public document while preserving the draft. Concurrent saves are
rejected using a revision check; editors retain their unsaved changes on errors.

The public Rules page provides section navigation, search, collapsible
subsections, print output and effective/updated dates. Membership and online
entry forms link to it in a separate tab. Written rules are informational and
do not change scoring, classifications or entry eligibility.

The database exposes only the published document through public_producer_rules.
Draft access and saving require owner/admin access. Mutations are recorded in
the producer changelog. Run supabase/tests/producer-public-rules.sql to exercise
privacy, publication, revisions and permissions in a rollback-only transaction.
