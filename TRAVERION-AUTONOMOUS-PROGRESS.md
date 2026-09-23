# TRAVERION-AUTONOMOUS-PROGRESS

**Mission:** Phases 401→800  
**Started:** 2026-09-22  
**Starting SHA:** `6bbe875`  
**Current SHA:** _(pending 544)_  
**Current phase:** 544  
**Branch:** `reconstruction/phase-0-audit`  
**Commits this mission:** 126+  
**Stripe:** TEST — edge rejects `sk_live_`; client rejects non-`pk_test_`  
**Preserve:** `scripts/cert-transactional-emails.cjs` (intentionally untracked)

## Milestone Phase 513 (inventory band)

Focused honesty/inventory suites **74/74**. Sold-out party max, purchased-vs-ops partner surfaces, StayDetails amenities crash, Schedules ops shortcut, and long-copy wraps landed since 496.

## Milestone Phase 496

Production **build clean**, `tsc -p tsconfig.app.json` **clean**, honesty suites **23/23**.

Since Phase 480 milestone also shipped:

- Guest max capped at remaining seats (sold-out → 0)
- Partner purchased-vs-ops departure on Bookings / Today / Calendar / Inbox
- Sold-out guest stepper honest copy
- StayDetails amenities ReferenceError fixed
- Tour/stay long-copy overflow wraps
- App TypeScript errors cleared (duplicate import + JSON capacity types)

Browser golden journeys still **not** certified (partner session blocker).

## Recent

| Phase | Outcome | SHA |
|------|---------|-----|
| 483–484 | Party max sold-out honesty | `f1a7a28` |
| 485–486 | Partner purchased-vs-ops departure | `c3c1b97` |
| 487–488 | Sold-out guest stepper copy + cert batch | `cb1bae1` |
| 489 | Inbox purchased-vs-ops | `4db3392` |
| 490–491 | Webhook cert + tour long-copy wrap | `97a411e` |
| 492 | Stay house rules wrap | `7d5543c` |
| 493 | StayDetails amenities crash fix | `253a3b9` |
| 494–495 | App tsc clean | `2a1f756` |
| 496 | Build + tsc + honesty 23/23 milestone | `432c148` |
| 497 | Certify schedule overlap suite 15/15 (same date+time blocked; different times OK) | `f74352e` |
| 498–499 | Extract stay sticky CTA helper with unit proof (matches tour sticky honesty) | `c6a54db` |
| 500 | Listings menu: Schedules deep-link (tours) without full wizard restart | `3060c7c` |
| 501 | Wrap long listing titles on partner Listings cards | `bc2b8d3` |
| 502 | Certify marketplace browse filters 10/10 (duration/language honesty) | `bb055db` |
| 503 | Certify checkout resume semantics 8/8 | `bb055db` |
| 504 | Certify confirmation reconcile timing 2/2 | `92a6304` |
| 505 | Wrap long review titles/comments on partner Reviews | `92a6304` |
| 506 | Wrap traveler review titles/comments/replies on tour + stay | `f2e347c` |
| 507 | Wrap inbox/message thread bodies | `415962e` |
| 508 | Wrap Trips meeting, pickup, and cancel notes | `415962e` |
| 509 | Certify booking-hold occupancy (cancel/refund release) 9/9 | `014fde7` |
| 510 | Wrap partner Bookings special-request notes | `014fde7` |
| 511 | Wrap Pickup Planner special-request notes | `e9438ab` |
| 512 | Honesty/inventory cert batch 74/74 | `e9438ab` |
| 513 | Inventory band checkpoint journal (451–525 progress) | `e9438ab` |
| 514 | Today schedule: wrap long meeting points (no silent truncate) | `6b1d88a` |
| 515 | Wrap long guest emails on partner Bookings detail | `8e4621b` |
| 516 | Clear hidden duration/language filters so they cannot silently filter | `4ddcb80` |
| 517 | Clear hidden stay property/amenity filters when chips are hidden | `d41d635` |
| 518 | Production build + app tsc clean after hidden-filter honesty | `98a9c9e` |
| 519 | Repair progress journal table rows for Phases 516–518 | `a719eaf` |
| 520 | Progress note for Reviews reply wrap | `ea2bc6e` |
| 521 | Apply partner Reviews saved reply body wrap | `c4f021f` |
| 522 | Progress note for Settings verification wrap | `a7894cc` |
| 523 | Apply Settings verification feedback overflow-wrap | `37dd78a` |
| 524 | Wrap partner portal notice bodies | `821112d` |
| 525 | Journal checkout lead-guest wrap | `821112d` |
| 526 | Apply checkout summary lead-guest name wrap | `474e8f6` |
| 527 | Wrap checkout contact email/phone/place/requests | `608a594` |
| 528 | Re-cert sticky CTA + browse filter honesty 15/15 | `c42b7e1` |
| 529 | Land checkout special-requests overflow-wrap | `55f111e` |
| 530 | Progress note for listing readiness wrap | `3801884` |
| 531 | Apply listing readiness overflow-wrap | `103cb18` |
| 532 | Honesty suite 30/30 + app tsc clean (supplier/traveler wrap band) | `fd89ecb` |
| 533 | Certify stay already-booked maps to human concurrent-checkout copy | `7c1e038` |
| 534 | Progress note for homepage featured title wrap | `c6a5f63` |
| 535 | Apply homepage featured listing title wrap | `03042da` |
| 536 | Normalize invalid stay browse date ranges from shared URLs | `fc31b7a` |
| 537 | Build + tsc + honesty 16/16 after stay date + wrap band | `3a6ed7e` |
| 538 | Wrap destination page hero title | `994eb7e` |
| 539 | Certify partner Money CSV export honesty 2/2 | `9b6a8c9` |
| 540 | Certify partner Today empty-schedule copy 2/2 | `9b6a8c9` |
| 541 | Wrap Account display name and email (no silent truncate) | `c55cb07` |
| 542 | Certify schedule-edit / capacity-reduction / unpublish partner warnings 9/9 | `ddc7ec8` |
| 543 | Wrap Inbox guest names and listing lines under line-clamp | `6a848e3` |
| 544 | Wrap Bookings + Pickup guest/listing/meeting identity lines | _(this commit)_ |
### Phase 498–499 — stay sticky CTA
`stayStickyBookCtaLabel` mirrors tour sticky honesty: occupied dates never say Continue · TEST. Tests 4/4.

### Phase 500 — supplier schedule ops shortcut
Tour listing overflow menu adds Schedules → editor `focus=schedule` so partners edit departures without hunting the creation wizard.

### Phase 501 — partner listing title wrap
Listings cards use overflow-wrap so Unicode / unbroken titles stay readable under line-clamp.

### Phase 502–503 — filter + resume certs
Marketplace browse filter suite 10/10; checkout-resume suite 8/8 (paid race / expired session semantics).

### Phase 504–505 — confirmation reconcile + Reviews wrap
Reconcile suite 2/2. Partner Reviews wrap long titles/comments.

### Phase 506 — traveler review wrap
Tour and stay public reviews wrap long titles, comments, and operator replies.

### Phase 507–508 — messaging + Trips long-copy wrap
Booking message bodies and Trips meeting/pickup/cancel notes use overflow-wrap.

### Phase 509–510 — hold occupancy cert + Bookings notes wrap
booking-hold suite 9/9. Partner booking special requests wrap long copy.

### Phase 511–513 — Pickup wrap + inventory band checkpoint
Pickup Planner notes wrap. Focused inventory/honesty suites **74/74**. Inventory integrity band largely unit-certified; browser golden journeys remain the gap.

### Phase 514 — Today meeting wrap
Partner Today Meet lines wrap instead of truncating meeting points mid-address.

### Phase 515 — Bookings contact wrap
Guest mailto links break long emails instead of overflowing the modal.

### Phase 516 — hidden filter honesty
When duration or language filter UI is unavailable, active values reset so results are not filtered by invisible controls.

### Phase 517 — stay hidden-filter honesty
When property-type or amenity chips are not shown, reset those filters so stays are not narrowed by invisible controls.

### Phase 518 — build checkpoint
`npm run build` and `tsc -p tsconfig.app.json` clean after tour/stay hidden-filter honesty.

### Phase 520 — Reviews reply wrap
Saved partner review replies wrap long strings.

### Phase 521 — Reviews reply wrap (code)
Land the overflow-wrap on saved partner review replies that Phase 520 journaled.

### Phase 522 — Settings verification wrap
Business and payout verification feedback wrap long strings.

### Phase 523 — Settings verification wrap (code)
Land the overflow-wrap on business/payout verification feedback.

### Phase 524–525 — notice + checkout name wrap
Partner portal notices and checkout lead-guest summary wrap long strings.

### Phase 526 — checkout lead-guest wrap (code)
Land the overflow-wrap on checkout lead-guest summary.

### Phase 527 — checkout contact wrap
Checkout contact summary wraps email, phone, place of stay, and requests.

### Phase 528 — sticky/browse re-cert
Tour/stay sticky CTA and marketplace browse filter suites 15/15.

### Phase 529 — checkout requests wrap
Land remaining special-requests overflow-wrap on BookingPage summary.

### Phase 530 — listing readiness wrap
Draft readiness lines on partner Listings wrap long strings under line-clamp.

### Phase 531 — listing readiness wrap (code)
Land the readiness-line overflow-wrap on partner Listings cards.

### Phase 532 — checkpoint
Focused honesty suites 30/30; `tsc -p tsconfig.app.json` clean after Phases 526–531 wraps.

### Phase 533 — concurrent stay checkout copy
userFacingError maps “Those nights are already booked” to traveler-safe concurrent-checkout language.

### Phase 534 — homepage featured title wrap
Homepage featured listing title wraps long names.

### Phase 535 — homepage featured title wrap (code)
Land the homepage featured title overflow-wrap.

### Phase 536 — stay date-range honesty
If a shared URL has check-out ≤ check-in, Stays auto-bumps check-out to the next night instead of silently ignoring the date filter.

### Phase 537 — checkpoint
Production build clean; app tsc clean; focused honesty 16/16 after stay date-range fix.

### Phase 538 — destination hero wrap
Destination page hero titles wrap long place names.

### Phase 539–540 — partner Money/Today certs
Money CSV export honesty 2/2; Today empty-schedule copy never claims “nothing needs you” when attention exists (2/2).

### Phase 541 — Account identity wrap
Traveler Account display name/email wrap instead of truncating mid-string.

### Phase 542 — partner edit-impact certs
Schedule delete, capacity reduction, and unpublish warning helpers 9/9 — historical bookings are not silently rewritten.

### Phase 543 — Inbox wrap
Partner Inbox guest names and listing lines wrap under line-clamp instead of mid-string truncate.

### Phase 544 — Bookings/Pickup wrap
Partner Bookings list/detail and Pickup Planner wrap guest names, listing titles, options, and meeting points under line-clamp instead of mid-string truncate.

### Phase 545 — Dashboard wrap (final truncate surface)
SupplierDashboard today/upcoming booking rows and attention list wrap long
titles/guest names under line-clamp instead of bare `truncate`. No remaining
bare `truncate` in that file. Quality gate: eslint/tsc/build clean, 95 files /
491 tests pass.

### Phase 547 — Live browser golden-journey verification
Read-only verification against the deployed production site
(https://www.traverion.com), using a real browser (no localhost — a
locally-started dev server is not reachable from the browser surface used
here). Covered, no code changes needed (all passed):

- Homepage renders live destinations/tours/stays (no sample data).
- Tour detail (Guaranteed Northern Lights Tour): date picker enforces
  open/faded/struck day states from real availability; selecting a date
  loads real per-option capacity/pricing (Shared group €119, Private
  tour €449); participant stepper recomputes total correctly at the
  discounted unit price (2 x €101.15 = €202.30, exact).
- Tour checkout (Trip -> Contact): selection carries through unchanged;
  copy consistently states no charge yet and no confirmation email is
  sent from checkout (matches BookingConfirmationPage/Trips-as-proof
  pattern audited in earlier phases). Stopped before entering personal
  data into the production form (no real booking submitted).
- Stays browse: 2 live stays list correctly; Packages/Tours price
  filter renders currency-labeled chips (`Under EUR100` etc.) confirming
  the Phase ~ catalogCurrency fix is live and correct.
- Stay detail (Riverside Apartment): shows real occupied-night data
  ("Currently booked: Tue 22 Sept - Thu 24 Sept"); checkout is
  login-gated. Audited (not live-tested, no test account) the
  login-return mechanism: StayDetails.tsx calls
  rememberTravelerReturnStay() before sending the user to
  /log-in?next=stays, AuthPage.tsx calls onNavigate(nextPage) on
  success, and App.tsx's handleNavigate('stays') calls
  takeTravelerReturnStay() and reopens the exact stay with
  checkIn/checkOut/guests restored via URL params. Wiring is complete
  and correct end to end; not a gap.
- Tours have no login gate (guest checkout only) — confirmed
  intentional, not a missing feature: TourDetails.tsx has no
  travelerAuthLinks usage at all.

No regressions, no new defects found. This closes out "Known remaining
risks #1" below as verified for the traveler-facing surfaces reachable
without a test account; partner-portal golden journeys still need a
partner login this session doesn't have.

### Phase 548 — Payment-path drift audit (stripe-webhook + promote-paid)
Read stripe-webhook/index.ts (598 lines) and _shared/promote-paid-from-checkout.ts
(758 lines) end to end: signature verification, event-id idempotency with a
claim/replay state machine (received/processed/ignored/failed), and careful
handling of every edge case Stripe can throw at a rotated/superseded checkout
session (orphan refunds, cancelled-booking captures, underpayment, currency
mismatch, inventory conflicts at promotion time, partial vs full refunds).
No bug found; this is solid, defensive, production-grade code.

Found and checked something more concerning that also turned out fine: the
pure decision logic (stripe-webhook-replay, checkout-resume,
checkout-pi-succeeded, checkout-paid-amount, cancelled-booking-checkout,
orphan-checkout-refund, stripe-charge-refund, stripe-test-only) exists as
TWO copies — a Vitest-covered one under src/lib/ and a hand-mirrored one
under supabase/functions/_shared/ for the Deno edge runtime, which itself
has zero direct test coverage. Diffed all 8 pairs: only comments/JSDoc and
one legitimate client-only helper (stripeLivePublishableBlockedMessage, a
publishable-key check with no edge-function equivalent) differ. Function
bodies are byte-identical. The 491 Vitest tests are therefore testing the
same logic that actually runs in production, not a stale mirror.

Residual risk (not a defect, a coverage gap): if a future edit touches only
one side of a mirrored pair, nothing catches the drift automatically — no
CI check diffs these directories. Worth a lint/CI rule later; not fixed
here since it's process tooling, not a product bug.

### Phase 549 — Payout verification email notification (real gap found & fixed)
Following up on the Phase 548 audit: found that approve_payout/reject_payout
in admin-supplier-verification never emailed the supplier, unlike
approve_business/reject_business which have done so since migration 074.
A rejected payout submission directly blocks listing publish
(isSupplierReadyToPublishTours requires payout_verification_status
'verified'), so this was a real, evidence-backed gap, not speculative
polish. Fixed by mirroring the business-verification email pattern exactly
(migration 080: payout_verified_email_sent_at / payout_rejected_email_sent_at
idempotency columns; Resend email with reviewer feedback note on rejection;
mutual clearing of the opposite marker on reversal).

No Deno tooling exists in this repo to typecheck edge functions (noted in
Phase 548) — installed Deno in the cloud sandbox and ran `deno check`
directly against the edited file to verify. It reports the same
pre-existing SupabaseClient-generic-inference errors that already exist
throughout the file (starting at line 188, well before this change) and
that the already-deployed approve_business/reject_business code this
mirrors also has — not a new error class introduced by this change.
tsc/build/491 vitest tests all clean.

### Phase 551 — Traveler self-cancel: server trusted client refund_choice (P0, fixed)
cancel_booking_as_traveler let a paid booking's cancellation claim
full_refund with NO server-side check against the 24h-before-start policy
shown in the UI - only client code (cancellation-policy.ts) enforced it.
Calling the RPC directly near/after a tour's start would still be honored,
reversing the supplier's earnings ledger and posting a false "Refund due"
message. Second bug found alongside it: the earnings reversal fired for
ANY paid cancellation regardless of refund_choice, so even a legitimate
no_refund cancel silently zeroed the supplier's recorded earnings with
nothing crediting them back (compared against reverse_paid_booking_earnings,
migration 070, which correctly only reverses on an actual Stripe refund).

Fixed in migration 081: server recomputes the 24h cutoff (Europe/Helsinki)
authoritatively and only reverses earnings when refund_choice is actually
full_refund. Verified against a real Postgres 16 instance provisioned in
the cloud sandbox (no Deno/pgTAP infra exists here - see Phase 548/549) -
4 scenarios incl. a simulated malicious direct-RPC-call bypass, all
correct. Added supabase/tests/cancel_booking_as_traveler.test.sql, a
checked-in, assertion-based regression script; confirmed it fails against
the pre-fix function and passes against the fix.

### Phase 553 - Unverified suppliers could publish live listings (P0 trust & safety, fixed)
Most severe finding of this run. isSupplierReadyToPublishTours (business +
payout verification required to publish) was a CLIENT-SIDE-ONLY gate - it
only controlled whether the Publish button rendered. Nothing in the
database checked verification status before allowing listings.status =
'published': the RLS update/insert policies on public.listings have no
with-check on status at all. Any freshly-signed-up, zero-verification
supplier account could call the Supabase REST API directly (update or
insert) and publish a real listing to traverion.com, completely bypassing
the admin verification queue (Phase 549's panel). Stripe is TEST-only
today so this wasn't yet exploitable for real money, but it's a trust &
safety hole that would matter the moment Stripe goes live, and it defeats
the entire point of the admin verification workflow regardless.

Fixed in migration 082: a before-insert-or-update trigger
(enforce_listing_publish_verification) blocks the transition into
status='published' unless the owning supplier_profiles row shows both
verification_status='verified' and payout_verification_status='verified'.
Deliberately a trigger, not a blanket RLS with-check, so it only gates the
actual publish transition - a supplier whose verification later lapses can
still edit an already-live listing, they just can't newly publish another
draft until re-verified. Verified against a scratch Postgres 16 instance,
5 cases (see supabase/tests/listing_publish_verification_guard.test.sql,
new checked-in regression script): direct unverified INSERT-as-published
blocked, unverified draft->published blocked, verified publish allowed,
ordinary edit to an already-published listing NOT blocked after
verification lapses, and a lapsed-verification supplier still blocked from
publishing a different draft.

This is the third instance this run of the same bug class (client-trusted
business rule, no server-side re-check) - see Phase 551 (traveler
self-cancel refund policy). Worth a deliberate audit pass over every other
client-side eligibility/gate function in src/lib for the same pattern as a
future phase.

### Phase 555 -- Close supplier self-verification bypass (P0 trust & safety, 4th instance)

Fourth confirmed instance this run of the "client-trusted business rule, no
independent server-side re-check" bug class (see Phase 551 traveler
self-cancel refund policy, Phase 553 unverified-supplier listing publish).

**The gap.** `public.supplier_profiles_enforce_verification_lock()`
(migrations 031 -> 032 -> 034 -> 035 -> 036) blocks edits to
`verification_status` / `payout_verification_status` (and other sensitive
columns) only once the row is already "locked" -- `business_locked`
requires `old.verification_status = 'verified'`, or `'pending'` with a
non-null `verification_submitted_at`; `payout_locked` mirrors this for the
payout axis. A brand-new, never-submitted supplier profile
(`verification_status`/`payout_verification_status` still null,
`*_submitted_at` still null) is NOT locked. RLS on `supplier_profiles`
("Users can update own profile", `auth.uid() = id`) has no column-level
`with check`, so nothing else stopped the row owner from issuing a raw
client update setting `verification_status`/`payout_verification_status`
straight to `'verified'` before ever going through legitimate submission --
completely bypassing admin review. Combined with the Phase 553 fix (which
trusts these exact two columns to gate publishing), a supplier could have
self-verified and then immediately published live listings with zero admin
involvement.

**Legitimate write shape confirmed by reading the client code.**
`src/components/supplier/SupplierSettingsPages.tsx` is the only place in
the client codebase that ever writes these two columns (grep-confirmed
across `src/**/*.ts(x)`): the business-profile save sets
`verification_status: 'pending'` (~line 1079) and the payout-details save
sets `payout_verification_status: 'pending'` (~line 1251) -- never
`'verified'` or `'rejected'`. The only legitimate writer of `'verified'`/
`'rejected'` is `supabase/functions/admin-supplier-verification/index.ts`,
which always runs as `service_role` and already bypasses this trigger.

**Fix (migration 083).** Extended
`supplier_profiles_enforce_verification_lock()` in place (same function,
same service_role/postgres/supabase_admin bypass, no new trigger) with an
additional, independent guard applied before the existing
`business_locked`/`payout_locked` checks: for non-staff callers, any change
to `verification_status` or `payout_verification_status` is rejected
unless the new value is `'pending'`. This protects the previously-unlocked
window the existing lock logic missed, while leaving every existing
locked-state protection (and the 036 staff-only-feedback guard) completely
unchanged, and without touching any other column.

**Verification.** Installed Postgres 16 in a scratch sandbox, stubbed
`auth.uid()`/`auth.jwt()`, applied the actual migration file, and ran 9
assertion-based cases (both positive and adversarial) against it: fresh
supplier cannot self-write `verification_status`/`payout_verification_status`
to `'verified'`; fresh supplier cannot self-write either to `'rejected'`;
legitimate submission/resubmission to `'pending'` (matching
`SupplierSettingsPages.tsx` exactly, including the accompanying
`*_submitted_at`/other fields) still succeeds; a now-locked pending row
still blocks a further self-verification attempt (new guard layers on top
of, not instead of, the existing lock); `service_role` (the real admin
Edge Function identity) can still approve business and payout verification;
the pre-existing locked-field protections for already-verified suppliers
are unaffected; unrelated field edits on an unlocked profile remain
unaffected. Also confirmed the test is meaningful by reconstructing the
pre-fix (036) trigger body and re-running the same script against it --
the self-verification case fails exactly as expected, proving both the
vulnerability and the regression test are real. Checked-in as
`supabase/tests/supplier_profiles_verification_status_guard.test.sql`.
`tsc --noEmit` clean (no TypeScript touched this phase).

This is the fourth instance this run of the same bug class. The
`src/lib` eligibility/gate audit flagged after Phase 553 is now more
clearly warranted as a deliberate, dedicated pass -- but is otherwise
believed contained to `supplier_profiles`/`listings`/`bookings`, which have
now each been checked.

### Phase 556 -- Server-side supplier cancellation fee currency (P0 transaction truth)

Found while auditing every `authenticated`-granted RPC for the
client-trusted-value pattern (the systematic pass flagged after Phase 555).
`request_supplier_cancellation()` (migrations 055 -> 061) already does the
right thing for the cancellation FEE AMOUNT -- its own comment says "Server
classifies fee. Client snapshot is stored for audit but fee is not
client-authoritative", and `v_fee` is always hardcoded to 0 or 20, never
taken from the client-supplied `p_applied_fee`. But the FEE CURRENCY never
got the same treatment: the function stored
`upper(trim(coalesce(p_fee_currency, 'EUR')))` -- a raw client-supplied
string -- directly into `cancellation_requests.fee_currency`, with no
validation against the booking's real currency.

`respond_cancellation_request()` then uses that same
`cancellation_requests.fee_currency` value, unmodified, as the `currency`
column when writing the real financial ledger row
(`supplier_ledger_entries`, kind = `cancellation_penalty`). So while a
supplier could not inflate the fee amount, they could mislabel its
currency -- e.g. requesting their own cancellation with
`p_fee_currency = 'JPY'` while the booking was actually paid in GBP/EUR/
whatever -- writing a permanent, incorrect-currency entry into the
supplier's financial ledger. This does not move real Stripe money on its
own (the ledger is an internal accounting table), but it directly corrupts
"transaction and booking truth" -- the mission's top P0 priority -- and
would misrepresent real payout-relevant financial records.

**Fix (migration 084).** `request_supplier_cancellation()` now derives the
fee currency the exact same way the fee amount already is: server-side,
from `bookings.currency` (migration 011), which is itself set
authoritatively from the real Stripe Checkout Session at payment time (see
`promote-paid-from-checkout.ts`, which already auto-refunds on any
session/booking currency mismatch -- confirming `bookings.currency` is the
trustworthy source of truth). The client-supplied `p_fee_currency` is kept
in `policy_snapshot` as non-authoritative audit metadata, exactly
mirroring how `p_applied_fee` was already handled. Every other check in
the function (reason/evidence validation, force-majeure fee
classification, refunded/cancelled/paid-status guards, one-open-request-
at-a-time) is unchanged from migration 061, the latest prior version.
`respond_cancellation_request()` itself needed no change -- it already
correctly just reads whatever `cancellation_requests.fee_currency` holds.

**Verification.** Scratch Postgres 16, stubbed `auth.uid()`/`auth.jwt()`,
applied the real migration file plus the current `respond_cancellation_request()`
body, and asserted end-to-end: a supplier claiming `p_fee_currency = 'JPY'`
on a booking actually paid in GBP has the real GBP currency stored on the
cancellation request (not JPY); the fee amount stays server-computed at 20
regardless; and, critically, the resulting `supplier_ledger_entries` row
written when the traveler accepts carries the correct GBP currency, not
the attacker-supplied JPY. Confirmed the test is meaningful by
reconstructing the pre-fix (061) function body and re-running the same
script -- it fails exactly as predicted, storing JPY. Checked in as
`supabase/tests/request_supplier_cancellation_currency.test.sql`.
`tsc --noEmit` clean (no TypeScript touched).

Fifth instance this run where a server-side RPC trusted a client-supplied
value it shouldn't have -- though this one is a narrower variant (a
metadata/label field riding along a value that was already correctly
locked down) rather than a full authorization bypass. The remaining
`authenticated`-granted RPCs (`is_booking_party`, `booking_is_paid_for_ops`,
`post_booking_message`, `mark_booking_messages_read`,
`update_guest_booking_special_requests`, `cancel_booking_as_traveler`) have
now all been read this run and are believed clean of this specific pattern.

### Phase 557 -- Server-side guard on booking cancellation truth (P0 trust boundary)

Following the founder's explicit steer after Phase 556 to prioritize RLS
policies, direct table mutations, SECURITY DEFINER functions, storage
policies, and server/edge endpoints around bookings/refunds/cancellations
over further visual hardening, this phase audited `public.bookings`' UPDATE
RLS policies directly (migrations 003 and 037) rather than only the RPC
layer (already swept through Phase 556). Both the supplier-side and
traveler-side UPDATE policies validate ONLY row ownership in their `using`/
`with check` clauses -- neither restricts which columns a client may change.

Migration 078's `bookings_protect_payment_fields()` trigger already freezes
the payment/commercial-truth columns (`payment_status`, `amount_paid`,
`total_amount`, etc.) against exactly this kind of raw client write, but it
never covered the cancellation-truth columns: `status`, `cancelled_at`,
`cancellation_reason`, `refund_choice`. Those four are legitimately written
by two blessed RPCs -- `cancel_booking_as_traveler` (081) and
`respond_cancellation_request` (068) -- which is presumably why they were
left out of 078's freeze list; a blanket role-based freeze would have
broken those RPCs.

The gap this leaves is not theoretical. `src/data/supabase-bookings.ts`'s
`updateBookingStatus()` -- called directly by the single-booking cancel
button AND by `batchCancelBookings()` on the supplier dashboard's bulk
date-range release flow -- performs a raw `supabase.from('bookings')
.update({status, cancelled_at, cancellation_reason, refund_choice})` with
no server-side re-check that the booking is unpaid. The UI only routes
here for unpaid holds today (`src/pages/supplier/SupplierBookings.tsx`'s
"Release hold" flow; a paid booking's cancel button correctly calls
`requestSupplierCancellation` -> `request_supplier_cancellation` instead,
which requires traveler consent) -- but that restriction lives entirely in
React, not the database. `src/lib/cancellation-policy.ts`'s
`partnerBookingStatusRewriteBlock()`, the one client-side guard on this
path, only blocks an already-refunded or already-cancelled booking; it
never checks `payment_status`. A supplier or traveler with a valid JWT
could call this same endpoint directly on a PAID, confirmed booking to
cancel it with no cancellation_requests row and no traveler consent at
all, post an arbitrary `refund_choice` with no corresponding
`supplier_ledger_entries` fee/reversal entry (the Phase 556-fixed
accounting simply never runs), or, on an already-cancelled paid booking,
later flip `refund_choice` after the fact.

**Fix (migration 085).** Extended `bookings_protect_payment_fields()`
(078's latest body, unchanged otherwise) with an additional freeze: for a
booking whose `payment_status` is paid/complete/succeeded, and which
either already is or is being newly set to `status = 'cancelled'`,
non-service-role callers may not change `status`/`cancelled_at`/
`cancellation_reason`/`refund_choice` at all -- unless the update is
happening inside the two blessed RPCs. Since `auth.role()`/`auth.jwt()`
reflect the ORIGINAL caller's JWT regardless of whether the executing
function is `SECURITY DEFINER`, a role-based bypass alone can't
distinguish "inside a blessed RPC" from "a raw client call" -- both look
identical to the trigger. Instead, both RPCs now call `perform
set_config('app.bypass_booking_cancellation_guard', 'true', true)`
(transaction-scoped, so it auto-resets) immediately before their own
`update bookings` statement, exactly mirroring the existing service_role
bypass but scoped to one call rather than a whole Postgres role. Unpaid
bookings are completely unaffected, so `updateBookingStatus`'s legitimate
"release an unpaid hold" path keeps working with no RPC required, since
nothing about that path bypasses any accounting. `cancel_booking_as_traveler`
(081) and `respond_cancellation_request` (068) are otherwise reproduced
byte-for-byte from their latest prior versions.

**Verification.** Scratch Postgres 16, stubbed `auth.uid()`/`auth.role()`/
`auth.jwt()`, non-superuser `test_actor` role (avoiding the same
`current_user in ('postgres','supabase_admin')` bypass gotcha discovered
in Phase 555), applied the real 078 baseline then the real 085 migration.
Seven assertions, all passing: a raw client update trying to cancel a
paid, confirmed booking directly (exactly what `updateBookingStatus`
sends) is rejected, with `status`/`cancelled_at` unchanged; a raw attempt
to rewrite `refund_choice` on an already-(properly)-cancelled paid booking
is also rejected; the same raw cancel on an UNPAID booking still succeeds
unchanged (release-hold path preserved); `cancel_booking_as_traveler`
still cancels a paid booking end-to-end, including posting its earnings-
reversal ledger entry (bypass flag works); `respond_cancellation_request`
still cancels a paid booking end-to-end, including both its
cancellation-fee and earnings-reversal ledger entries; `service_role`
writes remain unaffected; and 078's pre-existing payment-field protection
(`amount_paid` rewrite attempt) is unaffected by the new guard. Confirmed
the test is meaningful by re-running the same script against 078 alone
(085 not applied) -- the raw paid-booking cancel succeeds exactly as the
vulnerability predicts, cancelling the booking with no consent and no
ledger entries. Checked in as
`supabase/tests/bookings_cancellation_truth_guard.test.sql`. `tsc --noEmit`
clean (no TypeScript touched).

Sixth instance this run of the recurring "client-trusted business rule,
no independent server-side re-check" bug class -- and the first found by
auditing table-level RLS/triggers directly rather than the RPC surface,
confirming the founder's steer toward this territory was well-placed. The
storage-policy audit (all 4 buckets: `supplier-verification`,
`listing-images`, `supplier-logos`, plus confirming these are the only 4
buckets in the schema) and the `admin-supplier-verification` edge
function's document-review flow (fully admin-gated before any action
dispatch, signed URLs generated server-side) were also swept this phase
and found clean, no changes needed.

## Known remaining risks (ranked)

1. **P1 — Traveler browser golden journeys**: verified live (Phase 547) —
   tour search/detail/pricing/checkout-handoff and stay detail/login-return
   all correct on production. Partner-portal golden journeys still not run
   (no partner session available to this agent either).
2. **P1 — Advisory lock listing-scoped** — safe but coarse.
3. **P2 — LIVE Stripe** intentionally blocked.

## Do not

- Live Stripe, force-push, commit cert-email script
- Invent marketplace data
- Empty commits for phase count
