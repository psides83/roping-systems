# Public entry and membership forms

Membership inputs now fill their available width and use readable mobile text. Required fields, selects, checkboxes, release acceptance, and signature use native validation. Server errors are associated with every field variant, including phone inputs. An error summary receives focus after a failed submission and offers buttons that focus the affected fields.

Entry forms use the same error and confirmation treatment. Quantity controls move below roping details on phones and have larger touch targets. Optional eligibility and bonus checks have larger controls, and failed bonus lookups provide retry feedback. Empty roping lists and disabled submission buttons explain the next step. Entry fields provide appropriate name, email, and birth-date autofill hints.

Both forms preserve answers through failed submissions, announce progress, focus the confirmation on success, and offer status links after errors. Unexpected submission failures advise checking status before retrying because a lost response does not prove the request was rejected. Entry confirmations explicitly explain that office review and payment remain necessary. Membership receipts and their private-code handling remain intact.

Validation: 588 tests passed, lint and production build passed. Added coverage verifies required membership fields, accessible server errors, entry error summaries, and recovery from rejected submission calls. A local sample-data browser review at 390px verified required-field focus, pending feedback, retained membership answers after a rejected submission, error-summary focus, entry selection and quantity limits, and no horizontal overflow in either form. Confirmation rendering is covered by component tests; no production application or entry was submitted during this review. Supabase migration check confirmed no pending changes. No schema changes were needed.

Next: an end-to-end walkthrough with a producer before the first pilot, including organization-specific membership fields and actual event entry policies.
