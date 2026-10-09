# Producer sponsors

Owners and administrators manage sponsors in **Settings → Sponsors**. Each record
has a name, optional logo upload, optional website, display position, and public
visibility. Create and edit dialogs close after successful saves. Logos can be
replaced or removed. Sponsor changes are included in the producer changelog.

Public producer pages share a sponsor section below their primary content,
including results, schedules, standings, rules, news, membership and entry pages.
It does not appear when no active sponsors exist. Logos retain their colors and
proportions; names remain visible. Website links open in new tabs. Hidden sponsors
are not included in public queries. The layout wraps into two columns on mobile.

Logo uploads accept PNG, JPEG and WebP up to 2 MB, with content-signature checks.
The separate public `sponsor-logos` bucket restricts uploads and deletions to
administrators of the producer identified in the object path. Logos are public
assets, even if a sponsor's listing is hidden. They must not contain private data.

Saving uses revision checks to prevent overwriting concurrent edits. A failed
metadata save cleans up its new upload; replacement and deletion attempt cleanup
of the old logo. Storage cleanup is best-effort and does not undo a saved record.
The application never fetches sponsor website URLs on the server.
