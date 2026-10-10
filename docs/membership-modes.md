# Memberships and Roper Records

The producer feature preference **Require memberships** defaults to on.
Turning it off retains the same producer-linked records and classification,
entry, winnings, discipline, and account-link history. Navigation calls these
records Ropers; new applications and dues controls are hidden. Existing dues
history remains accessible. Turning the setting back on does not approve
automatically created records.

## Registration and Competition

The first accepted entry creates a producer-linked roper record if one does
not exist. Subsequent entries reuse it. A required membership can still be
pending when an entry is accepted. Missing numbered or Handicap classification
can also be reviewed after registration. Known age, gender, classification,
qualification, fine, suspension, capacity, and entry-limit restrictions remain
enforced by their existing checks.

Entry collections and timing display competition holds with a link to the
roper record. Membership approval and classification confirmation clear holds
dynamically; there is no checkbox to silently bypass required approval or a
missing classification. Database guards reject new competition results for
held entries, including direct requests outside the timing UI. Existing
recorded results are retained.

Unstarted Handicap entries refresh their copied adjustment when staff assign
the member classification. Started entries keep their recorded adjustment;
staff use the existing transfer workflow if the contestant must change ropings.

## Online Identity Safety

Public search is restricted to a published, public event accepting entries and
returns at most ten names, record numbers, cities, and states. It does not
return contact details, birth dates, notes, account links, or financial history.
A selection is stored as a staff-review suggestion, not ownership. Staff can
inspect the selected record before accepting or waitlisting the request.

Existing roper profiles are not overwritten by submitted entry details.
Email-only matches to a different name require an identity decision rather
than creating a duplicate or silently attaching a different roper. Secure
membership/account linking remains a separate workflow.

## Verification

Rollback-only database checks:

- `supabase/tests/membership-competition-holds.sql`
- `supabase/tests/online-roper-record-selection.sql`
- Existing membership applications, entry office, producer features, and
  waitlist regression checks.

UI regression checks are in `tests/online-entry-management-ui.test.mjs`.
