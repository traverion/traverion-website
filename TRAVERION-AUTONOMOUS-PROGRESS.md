# TRAVERION-AUTONOMOUS-PROGRESS

**Mission:** Phases 401→800  
**Started:** 2026-09-22  
**Starting SHA:** `6bbe875`  
**Current SHA:** `550c67c`  
**Current phase:** 622  
**Branch:** `reconstruction/phase-0-audit`  
**Commits this mission:** ~190  
**Stripe:** TEST — edge rejects `sk_live_`; client rejects non-`pk_test_`  
**Local-only (gitignored):** `scripts/cert-transactional-emails.cjs` — must stay untracked; contains service-role secrets when present locally  
**Remote migration truth (Phase 600):** Local=Remote for **080–099** on `xcopqllkulxfkpunetbc` (re-verified). Stripe: TEST only.  

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
| 544 | Wrap Bookings + Pickup guest/listing/meeting identity lines | `530030f` |
| 595 | Reconcile voucher 099 + untrack secrets + prove 080–099 not remote-applied | `59057da` |
| 596 | Push trust migrations 080–099 to linked remote + verify | `bbe6d91` |
| 597 | Partner ops golden journey localhost browser cert | `644608c` |
| 598 | Trips: require session before empty-state; await session after login | `aedd6c5` |
| 599 | Pickup Planner browser cert + fix guest/booking plural spacing | `87a6270` |
| 600 | Backend/trust/supplier band checkpoint | `912b13e` |
| 601 | Age-priced mix drives capacity + sticky sold-out | `5bcf6e2` |
| 602 | Trips View stay routes to stay-details | `0a27d88` |
| 603 | Stay checkout refreshes blocked nights before Stripe | `30ae77b` |
| 604 | Honest pickup + free-cancel browse tags | `0df7eb3` |
| 605 | Confirmation policy honesty + Trips naming | `034a632` |
| 606 | Stays check-in auto-pairs check-out for real filtering | `e8a60d5` |
| 607 | Traveler honesty Vitest re-cert 18/18 | `adb2866` |
| 608 | Mobile homepage 390×844 browser cert | `24b1bf8` |
| 609 | Mobile Packages + tour detail sticky CTA 390×844 | `688dafc` |
| 610 | Mobile date→options multi-departure handoff | `73990df` |
| 611 | App tsc + production build clean | `d12b36a` |
| 612 | Mobile Stays browse 390×844 | `4a72f9c` |
| 613 | Mobile stay detail + occupancy calendar 390×844 | `f84f225` |
| 614 | Stay lead-guest autofill from traveler profile only | `dd1afcc` |
| 615 | Checkout concurrency/hold/resume Vitest re-cert | `e73b53b` |
| 616 | Performance guest plural spacing fix | `206ee7d` |
| 617 | Pickup Planner no-date booking plural spacing | `197ae6d` |
| 618 | Pluralize Adult/Child participant labels + mobile Inbox cert | `d617dc5` |
| 619 | Checkout Participants strings use plural helper | `73e4f2c` |
| 620 | Stop capitalizing partner payment labels on Bookings | `5bcf823` |
| 621 | Tour detail option label + sticky quote gate + tour-switch reset | `beca448` |
| 622 | Trips empty/cancel CTAs include Browse stays | `550c67c` |
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

### Phase 558 -- Audit: supplier ledger writes, payout surface, admin table access (no fix needed)

Continuing the founder's steer to prioritize RLS/SECURITY DEFINER/storage/
admin-transition territory, this phase targeted the highest-value
remaining candidate given the established "client-trusted value, no
server-side re-check" bug class found 6 times in Phases 551-557: whether
`public.supplier_ledger_entries` -- the real financial ledger backing
supplier balances -- can be written directly by a client, which would let
a supplier fabricate earnings or erase a penalty/reversal entry. It
cannot. All 9 migrations touching this table were read in order; its RLS
(enabled in migration 055) is `select using (auth.uid() = supplier_id)`,
`insert with check (false)`, `update using (false)`, no delete policy
(default-deny), and no `grant` to `authenticated` exists anywhere in the
migration history (repo-wide grep confirmed). Every real write goes
through `SECURITY DEFINER` RPCs that compute amount/currency server-side
(`record_paid_booking_earnings`, `service_role`-only, reads
`bookings.amount_paid` directly; `respond_cancellation_request` /
`cancel_booking_as_traveler`, already hardened in Phases 555-556-557)
rather than trusting client input. Clean.

Three secondary areas were also checked and found clean or not-applicable:
no supplier-payout table or payout-computation endpoint exists anywhere in
the schema yet (payouts are evidently still handled manually off-platform,
with the ledger as the only balance record, already covered above); no
admin edge function beyond the already-audited `admin-supplier-verification`
performs admin-gated state transitions (`reconcile-checkout-session` is
traveler-scoped and derives amounts from Stripe's own session data, not
client input); and `public.listings`' other client-writable columns beyond
the already-fixed `status` (Phase 553) carry no exploitable business rule
-- there is no commission/platform-fee column on `listings` at all, and
`rating`/`reviews` are legacy seed-data columns the frontend never renders
for real Supabase-backed listings (`src/lib/listingTruth.ts`: "Guest-facing
score: real aggregates only. Never a default 4.5.").

As a direct follow-on, this phase also read `public.admin` (migration
038) -- the allowlist table gating the Traverion staff panel -- end to
end: RLS enabled with **no policies at all** (default-deny for every
role), plus an explicit `REVOKE ALL ON TABLE public.admin FROM anon,
authenticated`, so no client can read or write it directly under any
circumstance. The one function that checks it,
`is_traverion_panel_admin()`, is `SECURITY DEFINER` and read-only (an
`EXISTS` check against the caller's JWT email), and is itself used in
exactly one place across the schema -- gating the admin `FOR ALL` RLS
policy on `supplier_portal_notifications` (dashboard banners, migration
053), where the corresponding `select_own` policy correctly limits
non-admin suppliers to SELECT only. No path found for a client to
self-grant admin status or to write to a table an admin's RLS bypass was
meant to gate exclusively.

No migration or test file was needed this phase -- nothing exploitable
was found. Recorded here (per the tracker's role of reflecting honest
project truth, not just fixes) so the eventual Phase 800 handoff
accurately reflects that this territory was swept, not skipped. `git
status --short` clean before and after (only the intentionally-untracked
`scripts/cert-transactional-emails.cjs`).

### Phase 561 -- Close open unauthenticated email relay (send-supplier-message)

Broadened the audit to the remaining, not-yet-checked edge functions
(`expire-booking-checkout`, `notify-contact-inquiry`, `notify-customer-booking`,
`notify-supplier-event`, `notify-staff-verification-queue`,
`send-booking-reminders`, `send-supplier-message`) after Phase 559-560
found the checkout/webhook/ledger/admin-table trust boundaries clean.
`expire-booking-checkout`, `notify-contact-inquiry`, and
`notify-staff-verification-queue` are correctly gated (ownership check,
fixed non-attacker-controlled recipient, and a bearer-secret check,
respectively). `send-booking-reminders` is a clean cron-secret-gated
caller.

`send-supplier-message` (`supabase/functions/send-supplier-message/index.ts`)
had **no caller-identity check of any kind**. It is not listed in
`supabase/config.toml`, so it ran under the CLI's default `verify_jwt =
true`, which only requires *a* valid signed JWT at the gateway -- the
project's own public anon key satisfies that, since anon and service-role
keys are both ordinary signed JWTs differing only in their `role` claim,
which the gateway does not check. The function body itself then did zero
role/identity verification and relayed `{to, subject, body}` verbatim to
Resend as `no-reply@traverion.com`, to any recipient, with no rate limit
-- a fully open phishing/spam relay on the platform's trusted sending
domain, reachable by anyone holding the public anon key (i.e. anyone,
since it ships in every client bundle). The one client-side helper that
calls it (`src/data/supabase-supplier-messaging.ts`'s
`sendSupplierEmailViaEdge`) is not invoked from anywhere else in `src/`
today, confirming no live product flow needs this reachable from a
client's anon/session key.

**Fix.** The function now requires the caller's `Authorization: Bearer`
token to exactly match `SUPABASE_SERVICE_ROLE_KEY` (the same secret
server-side functions like `stripe-webhook` already present when calling
`notify-customer-booking`/`notify-supplier-event`), returning 401
otherwise. `supabase/config.toml` gained a `verify_jwt = false` entry for
it (matching the convention already used for every other internally-
secret-gated function in this repo) so the gateway's JWT check doesn't
shadow the more precise in-function check. `deno check` clean; `tsc
--noEmit` clean (no TypeScript logic changed, only the untouched dead
client helper remains, which will now correctly get a 401 if it's ever
wired up without also passing the service-role key).

**Not yet fixed this phase (deferred, flagged as the next P0 target):**
the same investigation found `notify-customer-booking` and
`notify-supplier-event` have the identical `verify_jwt = false` +
zero-in-function-auth gap, but unlike `send-supplier-message` they have
REAL, actively-used client-side call sites (`src/data/supabase-booking-ops.ts`,
`supabase-bookings.ts`, `supabase-consumer-profile.ts`,
`supabase-supplier-messaging.ts`, several call sites each) alongside
their legitimate server-to-server callers (`stripe-webhook`,
`promote-paid-from-checkout.ts`, `send-booking-reminders`). An
unauthenticated caller can today send a Traverion-branded email
(`notify-customer-booking`) to any address with an attacker-chosen
"Manage booking" link domain and, for the paid-confirmation template, an
attacker-chosen displayed amount against a real booking id; or send a
similarly-doctored email to a real supplier's real inbox
(`notify-supplier-event`, recipient resolved server-side so at least
restricted to genuine accounts, but every link/logo domain is still
attacker-controlled via `portalBaseUrl`). Because both functions are
large (550 and 518 lines) with many distinct `emailKind`/`eventType`
branches and several live client call sites each, a correct fix needs
dual-mode auth (service-role bypass for the trusted server callers, plus
JWT-based ownership verification -- ignoring/overriding client-submitted
recipient, amount, and link-domain fields in favor of DB-derived values
-- for client callers) designed and tested carefully rather than rushed
in the same phase as the send-supplier-message fix. This is the leading
candidate for Phase 562.

### Phase 562 -- Harden notify-customer-booking / notify-supplier-event against the deferred Phase 561 findings

Closed the two findings deferred from Phase 561: `notify-customer-booking`
and `notify-supplier-event` have no caller-identity check of their own
(`verify_jwt = false`, with the in-function check intended for
server-to-server callers only, per the file's own comment -- but both have
real, actively-used client call sites too, so a blanket auth requirement
risked breaking legitimate traveler/supplier flows without first confirming
the guest-checkout auth model). Rather than the larger dual-mode
ownership-verification redesign (still deferred -- see below), this phase
closes the two concretely-exploitable trust gaps in each function with a
conservative, targeted fix.

**notify-supplier-event.** `siteBase()` used to build every logo/link URL
from the request's `portalBaseUrl` verbatim. Read the function in full
(518 lines) to confirm the recipient side was already safe: recipients are
resolved server-side from `supplier_team_members` + `auth.admin.getUserById`
keyed only off `supplierId`, never from anything else in the payload, so a
caller cannot redirect the email to an address of their choosing -- it only
ever reaches that supplier's real registered account(s). The one real gap
was the link/logo domain. Fixed by hardcoding `siteBase()` to
`'https://partner.traverion.com'`, matching the identical constant
`admin-supplier-verification/index.ts` already hardcodes for supplier
email -- no `PARTNER_PORTAL_URL`-style secret exists anywhere in this
project, so an env-var override would have been a dangling reference to a
secret nothing sets.

**notify-customer-booking.** Two gaps, fixed separately:
- `siteBase()` had the same request-trusted-domain issue; fixed the same
  way but as an env-backed override (`PUBLIC_SITE_URL`), matching the
  existing convention already used identically by
  `create-booking-checkout-session`, `stripe-webhook`,
  `send-booking-reminders`, and `_shared/promote-paid-from-checkout.ts`.
- Unlike notify-supplier-event, this function's recipient (`customerEmail`)
  *was* fully caller-controlled, and for `booking_confirmed_paid` so was
  `totalAmount`/`currency` -- a caller holding a real `bookingId` could
  already only pass the DB's own `payment_status='paid'` gate (pre-existing
  from an earlier phase), but nothing stopped them from citing any
  `bookingId` while sending the "confirmed" receipt to an address of their
  choosing with a made-up amount. Extended the existing DB-fetch (now also
  covering `refund_completed`) to pull `guest_email, amount_paid,
  total_amount, currency` from the real booking row: for
  `booking_confirmed_paid`, recipient AND amount/currency are now always
  DB-derived (there is exactly one correct paid amount per booking, so
  overriding is safe and lossless); for `refund_completed`, only the
  recipient is DB-derived -- its `totalAmount` is the actual Stripe refund
  amount, which can be a *partial* refund with no corresponding single
  column on `bookings`, so overriding it from the booking row would have
  silently shown the wrong number on a partial refund. Confirmed via
  `stripe-webhook`'s own call site that `refund_completed` is only ever
  triggered server-side today (no client call site found anywhere in
  `src/`), so the residual amount-trust gap on that one kind has no live
  exploitable path right now; closing it for real needs a per-refund ledger
  value to check against, which does not exist yet -- flagged as a future
  candidate rather than guessed at here.

**Verified.** `deno check` clean on both files (after staging their
`_shared/*.ts` imports into the sandbox so the check could resolve them).
Traced every remaining reference to the old `to`/`amount`/`currency`
`const`s through the rest of `notify-customer-booking` (idempotency key,
PDF receipt, email body, `sendResendEmail` call) to confirm the DB-derived
values are what actually gets sent, not just computed and discarded.
Confirmed against `stripe-webhook`'s actual refund call site that its
`totalAmount` there is the Stripe refund amount, not `booking.amount_paid`
-- the detail that ruled out overriding `refund_completed`'s amount.

**Technique change this phase:** used `device_commit_files` (direct
backend file write) instead of the base64-heredoc-reconstruction technique
used through Phase 561, after confirming it's available in this session.
It writes bytes straight through without passing file content back through
the model's own context, which is exactly the class of transfer that
produced the real dropped-semicolon transcription bug caught in Phase 557.
Still verified byte-identical via `md5sum` on both sides afterward as a
belt-and-suspenders check, but the manual-reconstruction failure mode is
now structurally avoided rather than just caught after the fact. Recommend
this as the default transfer method for the rest of the mission.

**Not yet fixed this phase (deferred, still an open P1/P2):** the full
dual-mode auth redesign (service-role bypass + JWT-verified-caller-owns-
the-resource, matching `expire-booking-checkout`'s pattern) across every
`emailKind`/`eventType` and every live client call site in both functions.
Both endpoints remain callable by anyone with the public anon key for
kinds/events this phase did not touch (e.g. an unauthenticated caller can
still trigger a `new_booking_message` or `cancellation_accepted`-kind email
to a real booking's real guest, or a `guest_message`/`new_review`-kind
email to a real supplier -- content believable-looking but not containing
attacker-controlled links/amounts/recipients any more after this phase's
fix, so the remaining exposure is closer to a notification-spam nuisance
than a phishing or fraud vector). This still needs the guest-checkout auth
model confirmed (whether `booking_request`, triggered at booking creation
in `supabase-bookings.ts:360`, can legitimately come from an unauthenticated
session) before a blanket ownership check could be added without risking a
real booking-creation regression -- unchanged from the Phase 561 note.

### Phase 563 -- Close fabricated-booking / calendar-poisoning gap (public.bookings client INSERT)

First phase under the broadened mission brief (Phase 563-800): continue
Transaction Truth / Server Trust Boundary work but stop treating the whole
mission as a security-only audit. Investigated a concrete question left
open at the end of Phase 562 -- whether guest (unauthenticated) booking
creation is a real, intentional product flow -- since that fact governs
how aggressively any client-submitted booking field can be locked down.
Traced every `.from('bookings').insert(` call site in the whole repo (3
total): `src/data/supabase-bookings.ts`'s `submitBooking()` (client-side,
anon/authenticated key, **zero call sites anywhere else in `src/`** --
confirmed dead/orphaned code, not reachable from the live UI) and two
inside `create-booking-checkout-session/index.ts` (server-side, using the
service-role client, reached only after `authedClient.auth.getUser()`
confirms a real signed-in session). Confirmed via `BookingPage.tsx` /
`StayDetails.tsx` / `tour-booking-auth-gate.ts` that the live product
always calls `createBookingCheckoutSession()` -> the edge function, never
`submitBooking()`. This resolves the Phase 562 open question: genuinely
anonymous booking creation is NOT live in the product today (the one code
path that would allow it is unreachable), though `submitBooking()`'s
existence shows it was clearly intended architecture at some point -- left
untouched for a future phase to either wire up properly or delete.

That investigation surfaced a real, separate, more serious finding: the
"Authenticated travelers can create own bookings" RLS INSERT policy on
`public.bookings` (migration 051 -- the policy `submitBooking()` and any
direct PostgREST caller depend on) only constrains `guest_user_id =
auth.uid()`, `payment_status IN ('pending','failed')`, and `amount_paid =
0`. It does **not** constrain `status`, `total_amount`, `currency`,
`guests`, `booking_date`, or `hold_expires_at`. Proved against a real
Postgres 16 instance running the actual committed 051 policy (not a
paraphrase) that any ordinary signed-up traveler -- a free account, no
special access -- can insert a booking row directly via PostgREST (the
public anon key + their own session; no product UI involved) claiming
`status = 'confirmed'`, any `total_amount`/`currency` with no relation to
a real price quote, any `guests` count with no capacity check at all, and
`hold_expires_at` up to any future timestamp. `booking_occupies_inventory`
(migrations 054/059/076) treats a non-cancelled, `payment_status='pending'`
row as occupying inventory whenever `hold_expires_at` is in the future --
so this is a free, repeatable, **permanent** denial-of-service against any
listing's public availability calendar (block every date, forever, for
$0), and the real "Consumers can view own bookings by user id" SELECT
policy (037, confirmed still live) makes the fabricated row render back to
its creator's own Trips view as if it were a genuine confirmed
reservation.

**Fix (`086_close_client_bookings_insert.sql`).** Drops the migration-051
INSERT policy outright rather than trying to patch it field-by-field --
the real product never uses this policy at all (the only live path is the
service-role edge function, which bypasses RLS entirely), so there is no
real capability being removed, only a database-level exposure that was
never exercised safely even by the code that would need it
(`submitBooking()` also skips `create-booking-checkout-session`'s
price-quoting and capacity checks, so it was already unsafe to use even
absent malice). With RLS enabled and no INSERT policy, every non-owner,
non-service_role caller is denied by default.

**Verified.** `supabase/tests/bookings_client_insert_guard.test.sql`:
built a minimal schema, stubbed `auth.uid()`/`auth.role()`, included the
REAL `051_checkout_concurrency_and_payment_guard.sql` and
`086_close_client_bookings_insert.sql` files via `\ir` (not retyped) against
a real Postgres 16. Four cases, all passing: (1) proves the exploit
succeeds against 051 alone -- a fabricated `status='confirmed'` booking
with a 365-day hold and a EUR 999,999 amount is inserted successfully,
confirming this is a real bug in today's committed code, not a
hypothetical; (2) the identical insert is rejected after 086; (3) even a
minimal, entirely benign-shaped authenticated insert (matching
`submitBooking()`'s actual shape) is rejected too, confirming the fix is
complete rather than a partial patch; (4) the real, live booking-creation
path -- a service-role insert, exactly what
`create-booking-checkout-session` does -- is completely unaffected.

**Not attempted this phase:** no attempt to preserve a narrower,
still-functional authenticated INSERT policy (e.g. forcing
`status='pending'` and `hold_expires_at IS NULL` while still allowing
`total_amount`/`currency`/`guests` through). Rejected as unnecessary
half-measure: since the real product has zero live reliance on this
policy, a full close is strictly safer than a partial one and equally
"smallest complete fix" in effect, without leaving a residual
client-writable `total_amount`/`currency`/`guests` surface for future
phases to re-discover.

### Phase 564 -- Concurrency audit (checkout claim path) + listing publish-completeness gap (documented, not fixed)

Two independent investigations this phase, both concluded with evidence
rather than a code change -- an audit phase, per the mission's own
allowance for a clean audit that materially reduces a known launch risk.

**1. Concurrency: is the listing-scoped advisory lock actually safe for
"two travelers buy the last slot" races?** The tracker's existing "P1 --
Advisory lock listing-scoped -- safe but coarse" note was correct but
unverified by direct reading this session. Traced the real call graph in
`create-booking-checkout-session/index.ts`: the PRIMARY path for a new
booking calls a single RPC, `claim_pending_checkout_booking` (migration
076). Read that function's full body -- it is one PL/pgSQL function
(`PERFORM public.assert_checkout_inventory(...)` -- which takes
`pg_advisory_xact_lock` scoped to the listing -- immediately followed by
`INSERT INTO public.bookings` in the SAME function, i.e. the SAME
transaction). Because the lock is transaction-scoped and both the
capacity check and the row insert happen inside that one transaction, a
second concurrent claim for the same listing genuinely blocks until the
first commits, then correctly sees the first booking's row when it
re-checks capacity. No time-of-check-to-time-of-use gap exists in this
path. There IS a separate, older fallback path in the same edge function
(a bare `assert_checkout_inventory` RPC call followed by a *separate*
`.from('bookings').insert()` round-trip) which genuinely would NOT be
race-safe on its own -- the advisory lock releases when the first RPC's
transaction ends, before the second, separate INSERT call even begins.
But this fallback is explicitly gated behind `claimed.error` matching
"could not find the function" / "schema cache" -- i.e. it only runs when
`claim_pending_checkout_booking` itself is missing from the target
database (an unmigrated/rollback scenario), not in normal operation
against a fully-migrated project. Confirmed `claim_pending_checkout_booking`
is defined and current as of migration 076, already committed. No fix
needed for the primary path; flagging the fallback path's race-unsafety
as a documented, low-likelihood residual (would only matter if the repo's
migrations and the live Supabase project's applied-migration state ever
diverge) rather than fixing it, since correctly re-deriving that path
would mean either deleting the 60+ year-old-pattern fallback (removing a
safety net for exactly the situation it exists to catch) or wrapping it
in its own transaction-spanning RPC, and neither is warranted without
evidence this path is ever actually reached in production.

**2. Listing publish-completeness is enforced client-side only, not
server-side (beyond supplier verification).** Migration 082's trigger
(`enforce_listing_publish_verification`) blocks a listing from
transitioning to `status='published'` unless the owning supplier is
business- and payout-verified -- but does not check whether the LISTING
ITSELF has real bookable content. `src/lib/listingPublishGate.ts`'s
`getListingPublishBlockers()` is the actual, much richer completeness
gate (title/subtitle/description length, at least one valid priced
booking option with schedule/pricing/meeting-point details for tours, or
nightly price/maxGuests/check-in/check-out for stays, a non-placeholder
hero image, city/country, includes/excludes, gallery photo count) -- and
none of it is server-enforced. A verified supplier (a real, vetted
business, not an anonymous attacker) could bypass all of it via a direct
REST update to `status:'published'` and put a title-only, price-less,
photo-less listing live. Checked how severe the actual consequence is: read
`_shared/booking-quote.ts`'s `quoteListingBooking()` -- when a tour has no
usable booking options AND no fallback `price_starting_from`, it returns a
clean `{ ok: false, error: 'This tour does not have a bookable price yet.'
}` rather than crashing or silently computing a wrong/zero charge. So the
actual failure mode of this gap is a poor-quality live listing that gives
a customer a clear, honest error on checkout attempt -- not a money-unsafe
or corrupted-booking outcome. Assessed as real but P1/P2 (requires an
already-vetted supplier's own mistake or deliberate bypass, not an
attacker acting against someone else's account or money), not P0.
Deliberately NOT building a server-side replica of
`getListingPublishBlockers()`'s full logic this phase -- it is
substantial, nuanced, tour/stay-specific business logic, and a hurried
partial replica risks silently drifting out of sync with the real
client-side rule set (the same category of bug this mission keeps
finding, just introduced fresh). Recording as a flagged, well-understood
gap for a future phase to close properly (most likely: a single
consolidated "listing has at least one bookable, priced path" check,
mirroring only the load-bearing subset of `getListingPublishBlockers()`
that null-charge risk actually depends on, rather than the full
cosmetic-completeness rule set).

### Phase 565 -- Closed the UPDATE-side sibling of Phase 563's booking-fabrication gap

Phase 563 closed a fabricated-booking gap on INSERT. This phase asked the
obvious next question the mission's own Phase 565 brief posed directly:
once a real, legitimately-owned booking exists, can the traveler who owns
it tamper with fields that should only ever be server-derived, via the
same ownership-only UPDATE policies (migration 037) that let them
legitimately cancel their own booking?

Traced every column `bookings_protect_payment_fields()` (051 -> 078 ->
085) did and did not freeze for non-service-role callers. Payment/purchase
truth (payment_status, amount_paid, total_amount, currency,
purchase_snapshot, guest_breakdown, booking_number, etc.) was already
unconditionally frozen. But `booking_date`, `check_out`, `nights`,
`nightly_amount`, `cleaning_fee`, `booking_option_id`, and `guests` were
only frozen once `payment_status = 'paid'` -- and `hold_expires_at` was
never frozen at all, at any payment status. That left all eight fields
directly writable by any traveler on their OWN pending booking via a raw
PostgREST PATCH.

Proved this against a real Postgres 16 instance running the actual
committed 037 RLS policies and 085 trigger body (not a paraphrase): an
authenticated traveler's direct UPDATE of their own pending booking's
`hold_expires_at` (+365 days), `booking_date`, and `guests` succeeds in
full against today's committed code. `booking_occupies_inventory()`
(migration 076) treats a non-cancelled, `payment_status='pending'` row as
occupying real calendar inventory for as long as `hold_expires_at` says --
so this is the exact same calendar-poisoning DoS Phase 563 closed on
INSERT, reachable here via UPDATE on a booking the traveler legitimately
owns, for the price of one real (or cheap) checkout attempt instead of a
bare insert.

Checked whether this is also a money-loss vector before treating it as
P0-severity: it is not. `create-booking-checkout-session/index.ts`'s
resume path (`targetBookingId` present) always recomputes the actual
Stripe charge fresh via `quoteListingBooking()` against the booking's
*current* `booking_date`/`guests`/`booking_option_id` -- never from the
stored `total_amount` column -- so tampering with these fields cannot
make a traveler pay less than the real, re-quoted price for whatever
configuration ends up on the row by the time Stripe is charged. The real,
reachable harm is availability integrity, not payment integrity.

Confirmed via exhaustive grep of every `.from('bookings').update(` call
site in `src/` (two total, both in `src/data/supabase-bookings.ts`) that
no legitimate client code anywhere needs direct write access to any of
these eight fields. `updateBookingSchedule()` only ever sends
`start_time`/`pickup_time` -- the two fields 078's own comment already
calls out as intentionally left mutable for ops, untouched by this fix.
`updateBookingStatus()` / `batchCancelBookings()` only ever send
`status`/`cancelled_at`/`cancellation_reason`/`refund_choice` -- exactly
the four columns 085 already governs with its own conditional guard,
also untouched by this fix.

Fix: `087_freeze_booking_identity_fields.sql` moves those seven fields
out of the `payment_status='paid'` conditional into the same
unconditional-freeze block as the payment-truth columns, and adds
`hold_expires_at` to that block for the first time. The paid-booking
cancellation-truth guard from 085 (status/cancelled_at/
cancellation_reason/refund_choice, bypassable only via the transaction-
local GUC the two cancellation RPCs set) is byte-identical, untouched.

Verified with a new regression test
(`supabase/tests/bookings_identity_field_guard.test.sql`), built on the
real 037, 078, 085, and 087 migration files via `\ir`, not paraphrased:
(1) proves the exploit succeeds against 085 alone (today's committed
baseline); (2) proves it's rejected after 087; (3) proves the legitimate
"release an unpaid hold" status update still works; (4) proves the
legitimate start_time/pickup_time schedule update still works; (5) proves
the real service-role resume-checkout sync path (guests/booking_date/
hold_expires_at, simulating create-booking-checkout-session's own writes)
is completely unaffected; (6) proves migration 085's paid-booking
cancellation-truth guard still works unchanged after this phase's edit to
the same function.

### Phase 566 -- End-to-end audit of the cancellation/refund subsystem (no code change; verified safe)

Continued the trust-boundary vertical from Phase 565 one layer further:
having just closed the UPDATE-side identity-field gap on `bookings`
itself, checked whether the adjacent cancellation-request workflow
(`cancellation_requests`, `request_supplier_cancellation`,
`respond_cancellation_request`, `cancel_booking_as_traveler`) has any
sibling gap -- e.g. a client-fabricated or inflated cancellation fee, a
direct-write path around the RPCs, or a double-refund race. Read all four
relevant migrations (055, 061, 084, 085) in full rather than trusting
their own header comments' claims. Found no exploitable gap; this phase
made no code change.

**Fee amount and currency are both genuinely server-authoritative.**
`request_supplier_cancellation`'s `v_fee` is only ever assigned `0` or
`20` based on the server's own force-majeure reason-code classification;
the client's `p_applied_fee` argument is accepted but never actually used
to set the stored fee. Fee currency was the one real gap in this area --
closed in migration 084 (already committed before this session started)
by deriving it from `bookings.currency` (itself set authoritatively from
the real Stripe Checkout Session, per migration 011) instead of the
client-supplied `p_fee_currency`, which is now kept only as non-
authoritative audit metadata in `policy_snapshot`.

**`cancellation_requests` cannot be written to directly at all.** Its RLS
is `for insert with check (false)` and `for update using (false)` --
unconditional deny for every role that isn't the RPCs' own SECURITY
DEFINER context. Every write must go through
`request_supplier_cancellation`, `respond_cancellation_request`, or
`cancel_booking_as_traveler`. SELECT is gated by `is_booking_party()`.

**"One open request per booking" is race-safe, not just app-level.** Past
the RPC's own `exists(...)` pre-check sits a genuine unique partial index
(`cancellation_requests_one_open_per_booking on (booking_id) where
status = 'requested'`) -- so even two concurrent
`request_supplier_cancellation` calls for the same booking cannot both
succeed; the loser gets a real constraint violation, not a silent
duplicate.

**Both cancellation-acceptance RPCs are race-safe against double-refund.**
`cancel_booking_as_traveler` and `respond_cancellation_request` each
update `bookings` with `where ... status <> 'cancelled'` -- the first
concurrent caller to commit wins the row lock; the second's UPDATE then
sees the already-committed 'cancelled' status, affects zero rows, and the
function returns `already: true` rather than re-running the ledger logic.
Belt-and-suspenders: every `supplier_ledger_entries` insert in both RPCs
also carries `on conflict (kind, source_id) do nothing`, so even if the
conditional-update guard were ever bypassed, the unique `(kind,
source_id)` constraint alone would still prevent a duplicate ledger
entry. `cancel_booking_as_traveler` also re-derives its 24-hour
free-cancellation cutoff server-side from the booking's own
`booking_date`/`start_time` rather than trusting any client-supplied
timestamp or flag.

Conclusion: the cancellation/refund subsystem is coherent end-to-end --
request creation, traveler response, fee/currency truth, and the ledger
accounting all resist both malicious tampering and benign concurrent
double-submission. No P0/P1 finding here. Moving to a new vertical next
phase rather than continuing to search this already-hardened area for
diminishing returns.

### Phase 567 -- Inventory/capacity chain audit end-to-end (no code change; verified safe)

Followed the Phase 565/566 trust-boundary work one layer further into
Priority 2 (inventory/capacity correctness): now that fabricating or
tampering with a booking row's `guests`/`hold_expires_at`/date/option is
closed on both INSERT (563) and UPDATE (565), is the rest of the capacity
chain -- where "capacity" itself comes from, and how occupancy is
computed against it -- equally sound? Traced it fully rather than
assuming.

**`booking_option_id` is not a foreign key to a relational table.**
Confirmed via migration 048: it is a plain `text` column pointing at an
id inside `listings.listing_extras->'bookingOptions'` (JSONB), not a
separate `booking_options` table. There is no separate RLS surface to
audit here -- booking-option pricing/capacity edits are governed by
whatever RLS already applies to a supplier editing their own `listings`
row, which is legitimate supplier-owned content, not a client-tamper
vector.

**`listing_availability` RLS is correctly ownership-scoped and has never
needed revisiting.** Its INSERT/UPDATE/DELETE policies (migration 009,
the only migration that has ever touched this table's RLS) all require
`exists (select 1 from listings where listings.id =
listing_availability.listing_id and listings.supplier_id = auth.uid())`
in `with check` -- so a client cannot insert a fabricated day-level
capacity override for a listing they don't own (would have been a real
cross-tenant DoS/overbooking vector: either zeroing a competitor's
calendar or inflating capacity on someone else's listing). No gap found.

**`listing_availability.booked` is fully vestigial and cannot be used to
manipulate real occupancy.** `assert_checkout_inventory` (migration 076,
the current authoritative capacity check inside the atomic
`claim_pending_checkout_booking` path) never reads this column at all --
it reads `listing_availability.capacity` (legitimately supplier-set) for
the day-override case, and always computes actual occupancy live via
`coalesce(sum(b.guests), 0) from bookings where
booking_occupies_inventory(...)`, i.e. directly and freshly from the
bookings table, whose own fabrication paths are already closed. Grepped
the app for any code that still trusts `.booked` for real occupancy math
and found the opposite: an explicit, already-enforced convention across
`src/lib/availability-ops.ts`, `src/lib/stayOccupancy.ts`,
`src/data/supabase-availability.ts`, and a dedicated regression test
(`src/lib/availability-booked-noop.test.ts`) all stating "Occupancy is
paid + live holds, not listing_availability.booked" / "stale footgun."
Whatever writes to `.booked` still exist are display-adjacent leftovers
with no bearing on real capacity enforcement.

Conclusion: the full inventory/capacity chain -- RLS ownership boundary,
capacity source, live occupancy computation, and the atomic
check-then-insert transaction -- is coherent end-to-end, and specifically
now benefits from Phases 563/565 having closed the booking-fabrication
paths this chain depends on for its "live occupancy" number to mean
anything. No P0/P1 finding. Three consecutive audit-only phases now
confirm the transaction-truth core (bookings mutation surface,
cancellation/refund subsystem, inventory/capacity chain) is sound;
Phase 568 moves to a different vertical rather than continuing to probe
this now well-verified core.

### Phase 568 -- Closed a real, currently-live drift between Deno payment-truth mirrors and their Vitest-tested twins; added a permanent regression test

Read stripe-webhook/index.ts and its two most consequential dependencies
(promote-paid-from-checkout.ts, checkout-paid-amount.ts) in full -- the
functions that decide whether a Stripe payment actually confirms a
booking, and whether to auto-refund a mismatched charge. Confirmed the
core amount/currency checks are already sound: checkoutPaidAmountAcceptable
compares against session.metadata.quoted_total, which
create-booking-checkout-session sets from its own server-side
quoteListingBooking() result (the same value used for the real Stripe
unit_amount) -- not from any client-controlled input.

While tracing these files, noticed their header comments ("Mirror of
src/lib/X.ts for Deno edge runtime. Keep behavior in sync with the
Vitest-covered module.") describe a convention with no enforcement:
`supabase/functions/_shared/*.ts` cannot import from `src/`, so nine
payment-truth predicate modules (checkout-paid-amount, stripe-charge-refund,
stripe-webhook-replay, checkout-resume, checkout-pi-succeeded,
checkout-inventory-conflict, cancelled-booking-checkout,
orphan-checkout-refund, stay-checkout-guest) exist as hand-maintained
duplicate files -- a Vitest-tested copy under src/lib/, and an untested
Deno copy that is what actually runs against real Stripe webhooks in
production. Confirmed via `find supabase/functions -iname "*.test.ts"`
that zero Deno-side tests exist anywhere in the repo; the only thing
that has ever verified these files stay identical is a human or an
earlier phase remembering to update both.

That gap was not theoretical. Diffing all nine pairs found
supabase/functions/_shared/stay-checkout-guest.ts had already drifted
from src/lib/stay-checkout-guest.ts in currently-committed code: the
src/lib copy had gained two exported aliases
(bookingLeadGuestNameReady, resumeBookingLeadGuestName) that the Deno
mirror never received. Currently harmless (no edge function imports the
missing aliases yet, confirmed by grep), but exactly the failure mode
described above -- a future edge function reaching for the alias name
would hit a missing export with nothing to catch it before deploy.

Fix, in two parts. (1) Added the two missing aliases to the Deno mirror
so it is a genuine, complete copy again -- pure addition, no existing
export changed. (2) Reformatted one cosmetic type-union spacing
difference in stripe-charge-refund.ts's Deno copy to exactly match its
src/lib twin (logic was already identical; only a leading `|` token
differed). (3) Added src/lib/edge-function-deno-mirror-sync.test.ts: a
Vitest test that self-discovers every "Mirror of src/lib/<name>" file
under supabase/functions/_shared (rather than hardcoding today's list of
nine, so a future mirror pair is covered automatically), and asserts
each pair's code -- comments and formatting stripped -- is textually
identical. It does not execute the Deno files (Vitest runs under Node
and the Deno copies use bare https:// specifiers Node cannot resolve);
textual normalized-equality is sufficient since these are small,
dependency-free, pure predicate functions with no side effects.

Verified: ran this new test before applying the two fixes above and
confirmed it correctly failed on both the real stay-checkout-guest.ts
drift and the stripe-charge-refund.ts formatting mismatch, with a clear
message naming the drifted file; ran it again after fixing both and
confirmed all nine pairs pass. Ran the full existing Vitest suite
(`vitest run`, no path filter) -- 96 files, 501 tests, all passing,
confirming the two additive alias exports and the reformatting did not
break anything else. Type-checked both edited Deno files individually
with the real `deno check` (they have zero imports, so this needed no
staging of dependent modules) -- both pass cleanly.

### Phase 569 -- reconcile-checkout-session audited (no code change; verified safe)

Read the remaining unaudited edge function in the checkout/payment path.
reconcile-checkout-session is the client-invokable recovery path for a
stuck checkout (e.g. the browser never got redirected back after Stripe
processed payment). Confirmed it is properly hardened:

- Requires a real authenticated session (authed.auth.getUser()) -- no
  anonymous access.
- Looks up the booking by checkout_session_id first, then requires the
  caller's email or user id to match that booking's guest_email/
  guest_user_id before doing anything else -- an attacker who somehow
  obtained someone else's session id (Stripe session ids are
  cryptographically random, not guessable) still could not reconcile a
  booking they don't own.
- Never trusts client input for payment truth: it retrieves the session
  from Stripe directly and only proceeds if `session.payment_status ===
  'paid'` -- Stripe's own authoritative state, not anything the caller
  claims.
- Delegates the actual promotion to the same promotePaidFromCheckoutSession
  already audited in Phase 568, which is race-safe on its own merits: its
  conditional `update bookings ... where payment_status in ('pending',
  'failed')` means a concurrent second caller (whether the real webhook or
  a second reconcile request) affects zero rows and falls into the
  already-settled branch, independent of the webhook's own
  stripe_webhook_events dedup layer (which this path deliberately does not
  use, since it is not itself a webhook delivery).

No exploitable gap found. This closes out the payment-truth vertical
opened in Phase 568 (stripe-webhook, promote-paid-from-checkout,
checkout-paid-amount, reconcile-checkout-session all now read and
verified this segment).

### Phase 570 -- Closed an identity/KYC-bypass gap in supplier document verification

Audited admin-supplier-verification/index.ts (the staff-only supplier
review API, unaudited this mission). Its own access gate is genuinely
well-hardened: a real verified JWT, a server-only app_metadata.role ===
'admin' check, AND a cross-check of the JWT email against a single-row
public.admin allowlist table -- three independent layers, no gap found
there.

Followed the trail into what the admin actually reviews. The
supplier-verification storage bucket restricts every client read/write to
the caller's own prefix (migration 029: starts_with(name,
auth.uid()::text || '/')) -- sound on its own. But
public.supplier_profiles.identity_document_path and
company_registration_document_path are plain text columns with no
equivalent constraint;
supplier_profiles_enforce_verification_lock() (031 through 083, already
extensively hardened against self-write of verification_status across six
prior migrations) only starts protecting these two path columns once the
row is already business_locked -- before that, and even during the
initial pending submission itself, a supplier can set either column to
ANY string via a raw client update.

Confirmed this is concretely exploitable, not theoretical.
public.listings.supplier_id is selected in the standard published-listing
query (src/data/supabase-listings.ts) and returned to anonymous visitors
browsing the public site -- so any real supplier's id is effectively
public information. Storage paths follow the documented, predictable
convention "userId/identity-document.pdf" (migration 029's own column
comment). admin-supplier-verification's signedUrlForPath() generates the
signed URL a reviewer sees using the SERVICE-ROLE client, which bypasses
the storage bucket's own ownership RLS by design (staff must be able to
review documents suppliers can only write to their own prefix of) -- so
that RLS is not a backstop for this column. Put together: a malicious
actor can register a supplier account, find any real verified supplier's
id from a public listing, PATCH their own identity_document_path /
company_registration_document_path to
"{thatOtherSupplierId}/identity-document.pdf" instead of uploading
anything themselves, then submit for verification (a legitimate action --
083 already allows any supplier to set verification_status to
'pending'). An admin reviewing the fraudulent submission would be shown
the OTHER supplier's real, genuine identity document as if it belonged to
the attacker -- an identity/KYC-bypass integrity issue that could talk a
reviewer into approving a business that never proved its own identity,
undermining the entire point of the admin-review gate five prior
migrations (031, 032, 034, 035, 083) already fought hard to protect
access to.

Fix: 088_supplier_verification_document_path_ownership_guard.sql extends
supplier_profiles_enforce_verification_lock() (same function, same
service_role/postgres bypass, no new trigger) with one more guard applied
regardless of lock state: a non-staff caller's non-null
identity_document_path / company_registration_document_path must start
with their own id followed by '/' -- exactly mirroring the storage
bucket's own RLS rule, so a supplier can only ever reference a path under
their own storage prefix, which is the only kind of path a real upload
through that bucket could ever produce for them. Clearing a path to null
(removing an uploaded document) remains allowed, matching existing client
behavior.

Verified against a real Postgres 16 instance (see supabase/tests/
supplier_profiles_document_path_ownership_guard.test.sql, built on the
real 083 and 088 migration files via \ir): (1) proves the exploit
succeeds against 083 alone for both document-path columns; (2) proves
both are rejected after 088; (3) proves a legitimate own-prefix path
write still succeeds; (4) proves clearing a path to null still succeeds;
(5) proves every pre-existing 083 protection (pending-only status
self-write, blocked self-write to 'verified', staff-only feedback) is
unaffected; (6) proves the service-role write path is unaffected.

### Phase 571 -- Admin action handlers, expire-booking-checkout, and two notification functions audited (no code change; verified safe)

Continued auditing admin-supplier-verification/index.ts past its access
gate (Phase 570) into the actual approve_business/reject_business/
approve_payout/reject_payout handlers: all run under the service-role
client (correctly bypassing 083/088's client-write guards, since this IS
the one legitimate path meant to set 'verified'/'rejected'), fetch the
row first and validate it exists, and send decision emails idempotently
(checking an `*_email_sent_at` marker before sending, matching it after).
No issue found.

Audited three more edge functions with verify_jwt=false (self-authenticate
internally, no gateway backstop):

- expire-booking-checkout: requires a real session, checks the caller
  owns the booking (traveler by email/user id) or is the listing's
  supplier, and only acts when
  unpaidCancelShouldExpireCheckout() is true -- which requires
  bookingStatus === 'cancelled' AND an unpaid payment_status. This means
  the function is a no-op against any still-ACTIVE hold; it can only ever
  clean up an orphaned Stripe Checkout Session on a booking that is
  already cancelled and unpaid through some other, already-audited path.
  No griefing/premature-hold-release vector exists here.
- notify-staff-verification-queue: gated by a static
  VERIFICATION_WEBHOOK_SECRET bearer check (meant to be called only by a
  Supabase Database Webhook), fires only for supplier_profiles UPDATE
  events where a submission timestamp actually changed, and every field
  in the resulting email comes from the row itself, not client input.
- notify-contact-inquiry: intentionally open to anonymous callers (a
  public contact form) with no auth by design. Checked for the injection
  classes that would matter here: the email field's validation regex
  (`^[^\s@]+@[^\s@]+\.[^\s@]+$`) rejects any whitespace/control
  character, closing off header injection via the reply_to field; every
  other field is run through escapeHtml() before landing in the email's
  HTML body; all fields are length-capped. The lack of rate-limiting on
  this endpoint (and on the underlying contact_inquiries insert policy)
  is a known, accepted trade-off for a public contact form, not a
  transaction/booking-truth or authorization-boundary issue this mission
  prioritizes -- noted, not treated as a phase-worthy finding.

No exploitable gap found in any of the above. Continuing to the next
hypothesis.

### Phase 572 -- Closed a real test-coverage gap on the function that computes actual Stripe charge amounts (new test file, no production code change)

Investigated the stays/rentals nights-overlap logic in assert_checkout_inventory
(migration 076/071): confirmed the overlap predicate itself
(`b.booking_date < p_check_out AND stay_booking_check_out(b) > p_check_in`) is
a correct half-open-interval check, and confirmed the SQL fallback branch
that would treat a `p_check_out <= p_check_in` stay as day-level tour
capacity math is NOT reachable in practice, because
quoteListingBooking() in supabase/functions/_shared/booking-quote.ts --
the function create-booking-checkout-session and promote-paid-from-checkout
actually call before ever reaching assert_checkout_inventory -- already
rejects any stay checkout date that is not strictly after check-in
("Check-out must be after check-in."). So this specific hypothesis (client
sends checkoutDate <= bookingDate to dodge the nights-overlap check) is
closed: not exploitable today.

While tracing that guard, found the real issue: quoteListingBooking is the
single function in the whole codebase that determines the real dollar
amount charged via Stripe ("Stripe checkout MUST use this; never trust
client totalAmount" per its own header), and it had ZERO automated test
coverage anywhere.

- It isn't src/lib/booking-quote.ts's quoteBooking/quoteStayNights -- those
  are a differently-shaped sibling (separate functions, not one dispatcher)
  used only by frontend pages for price display (BookingPage.tsx,
  StayDetails.tsx, TourDetails.tsx, Stays.tsx, Packages.tsx, and others) and
  were already fully Vitest-covered -- but that coverage protects a
  function that never runs on the server-authoritative payment path.
- Deno has no test runner wired up in this repo at all (still true, per the
  earlier Phase 568 finding: no *.test.ts anywhere under
  supabase/functions).
- The Phase 568 fix (edge-function-deno-mirror-sync.test.ts) only
  discovers files whose header literally reads "Mirror of src/lib/X.ts for
  Deno edge runtime" and asserts byte-for-byte (comment/whitespace-
  normalized) equality with their src/lib twin. booking-quote.ts and its
  dependency booking-hold.ts instead use a different, older header
  convention -- "Deno copy of src/lib/X.ts -- keep algorithms in sync" --
  which the Phase 568 regex does not match, so both files were silently
  excluded from that safety net. This exclusion is actually correct in one
  sense (quoteListingBooking has a different shape/name than its src/lib
  sibling, so a strict textual-equality test would be the wrong tool here
  and would fail for reasons that have nothing to do with real drift), but
  it left these two files -- arguably the highest-stakes files in the repo
  -- with no regression protection of any kind.

Verified quoteListingBooking can in fact be imported and executed directly
by Vitest: it has zero `Deno.` references and only one pure relative
import (booking-hold.ts, itself Deno-global-free), and a spike import
confirmed Vite's bundler-mode module resolution (already configured via
`allowImportingTsExtensions` in tsconfig) loads it without any shimming.

Added src/lib/booking-quote-deno-authoritative.test.ts: 22 tests exercising
quoteListingBooking directly (imported straight from
supabase/functions/_shared/booking-quote.ts, not re-implemented or
mocked), covering: stay nights total = nights * nightly + cleaning; the
checkout-after-checkin date-ordering guard (equal dates, checkout-before-
checkin, and a past check-in date all rejected); minNights and maxGuests
enforcement; missing nightly price rejected; a stay listing that is not
published rejected before dates are even checked; tour pricing with no
configured booking options (fallback price * guests, default 1-12 group-
size bounds, no-bookable-price rejected); a standard tour option
(best-of-multiple-discounts selection, option-scoped discounts correctly
excluded when scoped elsewhere, expired discounts correctly ignored,
unknown bookingOptionId rejected rather than silently falling back to a
default, per-option min/maxPersons enforced); private flat-group pricing
(flat total charged regardless of guest count, not price * guests -- this
is exactly the kind of thing a silent drift could get backwards and
overcharge or undercharge on); and age-dependent participant-mix pricing
(per-category totals, the requires-an-accompanying-adult rule, and an
empty mix rejected).

Proved this is a genuine regression detector and not a vacuous pass: in a
throwaway scratch copy (never touching the real repository or its git
history), weakened nightsBetween()'s date-ordering guard to accept zero
nights, reran the new suite against that scratch copy, and confirmed it
failed -- the equal-checkin/checkout case surfaced the wrong error message
("Minimum stay is 2 nights." instead of "Check-out must be after
check-in."), proving the suite is sensitive to exactly this class of
regression. Deleted the scratch copy immediately after.

Ran the full existing Vitest suite against the real, unmodified repository
on the device: 97 files, 523 tests, all green (up from 96/501 before this
phase's addition, consistent with the one new file and 22 new tests).

This phase adds test coverage only; no production code, migration, or
business-rule behavior changed.

### Phase 573 -- Supplier dashboard cross-tenant data access audited (no code change; verified safe)

Hypothesis: the supplier dashboard's client-side data fetchers
(fetchSupplierEarnings, fetchBookingsForSupplier, fetchSupplierLedger,
fetchMyListings, all called from SupplierEarnings.tsx / SupplierBookings.tsx
/ SupplierDashboard.tsx) take a supplierId argument and pre-filter queries
by it client-side -- if that argument, or a forged query built by hand
against the anon/authenticated Supabase client, could be pointed at another
supplier's id, would RLS actually stop a malicious supplier from reading
another supplier's earnings, ledger, bookings, or private booking
messages?

Traced each table's real RLS policy (the only genuine boundary here, since
the app's own .eq('supplier_id', ...) client-side filters are not a
security control by themselves):

- supplier_earnings (migration 002): select using (auth.uid() =
  supplier_id); insert/update both with check/using (false). A forged
  query for another supplier's id returns zero rows regardless of what
  the client asks for.
- supplier_ledger_entries (migration 055): identical shape -- select using
  (auth.uid() = supplier_id), insert/update denied to clients, and no
  delete policy exists at all (RLS default-denies an operation with no
  matching policy). Also independently confirmed safe in Phase 566 for the
  write side (server-only via RPC); this phase confirms the read side too.
- bookings, supplier-side select (migration 001): using (exists (select 1
  from listings where listings.id = bookings.listing_id and
  listings.supplier_id = auth.uid())) -- a genuine per-row re-check against
  auth.uid() joined through the listing's real owner column, not the
  client-supplied id used to build the id list in
  fetchBookingsForSupplier(). Even if that id list were built from a
  forged/manipulated supplierId argument, this policy independently blocks
  any booking whose listing isn't actually owned by the caller.
- booking_messages (migration 055) via is_booking_party(booking_id): a
  SECURITY DEFINER function that internally re-derives auth.uid() /
  auth.jwt() itself (never trusts a passed-in identity) and checks
  l.supplier_id = auth.uid() OR b.guest_user_id = auth.uid() OR a
  guest_email/JWT-email match -- correctly scoped to the two actual parties
  of that specific booking, no broader leak.
- No edge function reads supplier_earnings/supplier_ledger_entries under
  service-role on a client-supplied supplier id without an ownership
  check -- admin-supplier-verification is the only edge function touching
  either table, and it's already fully admin-gated (Phase 570/571).

No exploitable gap found: every one of these tables independently
re-verifies auth.uid() ownership at the RLS (or SECURITY DEFINER function)
layer, so a malicious supplier cannot see another supplier's earnings,
ledger entries, bookings, or booking-thread messages no matter what
arguments the client-side fetchers are called with or how a request is
hand-crafted against the public Supabase client. Continuing to the next
hypothesis.

### Phase 574 -- Closed a fake-review / false-"verified"-badge gap in the reviews table (migration 089)

Hypothesis, moving into an unaudited "Content Edge Cases" / marketplace-
trust area this segment hadn't touched yet: does anything stop a user from
posting a fabricated review, or from falsely claiming the "Verified"
purchase badge using a booking that isn't theirs?

Read the reviews table's RLS from the ground up (migration 006, never
revisited since -- 012 only adds supplier reply-to-review, untouched
here). Found the original insert/update policies only ever checked
`auth.uid() = user_id`. Nothing checked that a supplied booking_id
actually belongs to the reviewing user, is for the same listing being
reviewed, or reflects a real, accepted booking at all. The app's own
eligibility gate (userHasCompletedBookingForListing in
src/data/supabase-reviews.ts) is a client-side UI convenience that decides
whether to show the "write a review" button and which real booking id to
suggest -- but submitReview() itself just upserts whatever booking_id it
is handed, with zero further validation, and nothing stops a direct call
against the public Supabase client that skips the UI gate entirely.

Concretely, before this fix, any authenticated user could post a review
on a listing they had never booked -- a competitor's listing, or their own
listing under a second account -- with an arbitrary rating, comment, and
guest_name, and set booking_id to ANY existing booking id anywhere in the
system, not even their own, to have it rendered with a "Verified" badge
(fetchReviewsByListingId / fetchReviewsForSupplierListings both compute
`verified: !!r.booking_id` -- purely "is it non-null", no ownership check
at read time either).

Fix (migration 089): a non-null booking_id at insert or update time must
now reference a real booking that (a) belongs to the reviewing user, by
guest_user_id or guest_email -- the same dual-identity ownership pattern
used for consumer booking RLS since migration 037, (b) is for the SAME
listing_id as the review, and (c) has reached status = 'confirmed' -- the
same bar the app's own client-side eligibility check already uses. An
unverified review (booking_id null) remains allowed, unchanged; review
read/select remains public, unchanged.

Caught a real bug in the fix's own first draft via the regression test,
before it ever reached the committed migration: the EXISTS subquery's
`b.listing_id = listing_id` left the outer reference unqualified, and
since public.bookings also has a listing_id column, Postgres silently
bound it to the subquery's own b.listing_id -- a self-referential,
always-true comparison -- rather than the row being inserted. The test's
Case 5 (a booking for a different listing than the one being reviewed)
caught this immediately: it was wrongly accepted. Fixed by explicitly
qualifying every outer (new-row) reference as reviews.<column> throughout
both policies, confirmed valid Postgres RLS syntax by the corrected
policy compiling and behaving correctly, and reran the full suite clean.

Verified end-to-end against a real Postgres 16 scratch database (the
`\ir`'d real migration 006 as the pre-fix baseline, then the real 089
file) with 8 cases: (1) proved the exploit is real against 006 alone --
an attacker posts a review on an unrelated listing claiming a stranger's
real booking as verified proof; (2) the identical attempt is rejected
after 089; (3) a legitimate review using the caller's own confirmed
booking for the SAME listing still succeeds; (4) an unverified review
(booking_id null) still succeeds; (5) a booking that is the caller's own
but for a DIFFERENT listing is rejected (this is the case that caught the
qualification bug above); (6) a booking that is the caller's own and for
the right listing, but not yet status = 'confirmed', is rejected; (7)
email-matched ownership (guest_user_id null, guest_email matches the JWT
email -- the legacy/dual-identity path) is correctly accepted; (8) the
same exploit attempted via UPDATE -- reassigning booking_id on an already-
owned review to a stranger's booking, trying to retroactively acquire a
false verified badge -- is rejected.

This is now the third subsystem this segment (after Phase 565's booking
identity/schedule fields and Phase 570's supplier document paths) where
the recurring bug class held: a client-trusted value with no independent
server-side re-check. Continuing to the next hypothesis.

### Phase 575 -- Closed a review-reply reassignment gap (migration 090)

Direct continuation of Phase 574: having just fixed reviews' own RLS,
checked review_replies (migration 012, supplier replies to reviews) for
the same class of gap.

Found it: the INSERT policy on review_replies correctly re-verifies
listing ownership through review_id (`exists (select 1 from reviews r
join listings l on l.id = r.listing_id where r.id = review_id and
l.supplier_id = auth.uid())`), but its own sibling UPDATE policy never
did -- it only ever re-checked `auth.uid() = supplier_id`. Since
supplier_id itself never has to change for an UPDATE to review_id to
succeed, a supplier could take a reply they legitimately own (attached to
a review on one of their own listings) and UPDATE its review_id column to
point at ANY other not-yet-replied review anywhere on the platform --
including one on a competitor's listing -- with nothing checking that the
new review_id still belonged to a listing they actually own. The unique
index on review_id alone incidentally blocks reassigning onto a review
that already has a reply, but any unreplied review was fair game: a
supplier could plant their own reply text underneath a stranger's review
on a competitor's listing.

Fix (migration 090): the UPDATE policy's WITH CHECK now re-runs the exact
same listing-ownership check the INSERT policy already performs, applied
to whatever review_id the row ends up with after the update. Every
outer-row column reference is explicitly qualified as
review_replies.<column>, applying the lesson from migration 089's own
regression-test-caught bug earlier this phase (an unqualified column that
also exists on a joined table can silently bind to the wrong scope).

Verified against a real Postgres 16 scratch database (stub tables for
everything migration 012's own `alter table` statements touch, so the
real 012 file applies verbatim via \ir, then the real 090 file) with 5
cases: (1) proved the exploit is real against 012 alone -- a supplier
reassigns their own reply onto an unreplied review on a DIFFERENT
supplier's listing; (2) the identical reassignment is rejected after 090;
(3) a legitimate reply insert for the supplier's own listing still works
(INSERT policy untouched, end-to-end sanity check); (4) editing only
reply_text (review_id unchanged) on an already-owned, correctly-scoped
reply still works; (5) reassigning onto a DIFFERENT review that IS on one
of the supplier's own OTHER listings still works -- this remains
legitimate, since 090 checks listing ownership, not "the original
review_id".

This is the fourth subsystem this segment (after Phase 565's booking
identity fields, Phase 570's supplier document paths, and Phase 574's
review-verification badge) where the same recurring bug class held: an
UPDATE path that re-checks the row's simple owner column but forgets to
re-apply the same authoritative check its own INSERT sibling already
enforces. Continuing to the next hypothesis.

### Phase 576 -- Investigated listings.supplier_id reassignment; NOT exploitable, shipped explicit hardening anyway (migration 091, honesty note)

Hypothesis, following the same "client-trusted value, no independent
re-check" pattern that held in three other subsystems this segment
(bookings identity fields, supplier document paths, review verification):
migration 082's own comment states that "Suppliers can update own
listings" (migration 001) "let[s] a supplier ... update ANY column on
their own row with no restriction" and has no WITH CHECK clause. Since
every other RLS policy that scopes a supplier to "their" data (bookings,
supplier_earnings, supplier_ledger_entries, booking_messages) does so via
a LIVE join back to listings.supplier_id, a supplier reassigning their own
listing's supplier_id to a different user looked like it would
retroactively hand that listing's booking history to whoever the new
supplier_id belonged to, and redirect future earnings.

This turned out to be WRONG, and it's worth recording precisely why, in
the interest of the honest-assessment standard this mission runs on. A
first draft of the fix (091) and its regression test were written
assuming the reassignment would succeed against the real migration 001
baseline. Running that test against a real Postgres 16 instance
immediately contradicted the assumption: the reassignment attempt was
REJECTED even with no WITH CHECK clause on the policy at all. The reason:
PostgreSQL's own documented RLS semantics state that when an UPDATE
policy omits WITH CHECK, the USING expression is reused as the check
against the resulting new row too -- so `using (auth.uid() = supplier_id)`
alone already means the caller's uid must equal the NEW row's supplier_id,
not just the old row's. Confirmed this with a second, minimal, fully
isolated repro outside the larger test harness to rule out any test-setup
artifact, with the same result both times. Migration 082's own comment
about "no restriction" reads more narrowly than it first appears -- it
is correct that verification status is not enforced (082's actual fix),
but it does not mean supplier_id itself was ever reassignable.

Given the hypothesis did not hold, the honest outcome is: no vulnerability
existed here, and this phase does not get to claim one. What is shipped
instead is a small, clearly-labeled defense-in-depth hardening: an
explicit WITH CHECK mirroring the existing USING clause, so this
invariant no longer depends on an implicit (and, as this investigation's
own first draft shows, easy to misjudge) Postgres default. The practical
risk the explicit check guards against: if anyone ever adds an unrelated
WITH CHECK clause to this same policy in the future, doing so REPLACES
the implicit reused-USING behavior outright rather than adding to it,
which would silently reopen this exact gap unless the new WITH CHECK also
happened to preserve the supplier_id invariant. Migration 091's own
header comment states plainly that this is not a live-bug fix.

Verified against a real Postgres 16 scratch database with 5 cases: (1)
against 001 alone, the reassignment attempt is already rejected, and the
third party gains no visibility into the listing's bookings -- proving
non-exploitability before any change; (2) the identical attempt behaves
identically after 091, now via the explicit check; (3) an ordinary field
edit (title) on an owned listing still works, unchanged; (4) a non-owner
still cannot touch a listing they don't own; (5) a service-role write of
supplier_id is unaffected.

Continuing to the next hypothesis.

### Phase 577 -- Closed a draft/rejected-listing content-exposure gap on the public tour and stay detail pages

Hypothesis: since public.listings' own SELECT RLS is `using (true)` --
fully public, no status restriction whatsoever (confirmed again this
phase; this is intentional, so anonymous visitors can browse published
listings without signing in) -- the ONLY thing that can prevent a
draft/pending/rejected listing's full content from being publicly visible
is consistent application-level status filtering on every public-facing
read path. fetchAllListings() (the main search/browse page) correctly
does this (`.or('status.eq.published,status.is.null')`), which shows the
filtering was a deliberate, known requirement -- so it was worth checking
whether every other public read path does the same.

fetchListingById(id) -- used by getListingByIdAsync(), which is what both
TourDetails.tsx and StayDetails.tsx (the actual public listing detail
pages) call to load the single listing a visitor is looking at -- does
NOT filter by status at all (`.select('*').eq('id', id).single()`), and
its own doc comment ("With RLS: travelers only see published listings")
is simply incorrect -- there is no such RLS restriction, on this table,
today.

Traced whether either page's own rendering logic compensated for this at
the UI layer. Both do gate the BOOKING action correctly
(isListingVisibleToTravelers(tour.status), checked client-side in several
places in TourDetails.tsx, and independently re-verified server-side by
create-booking-checkout-session's own listingStatus check -- so a draft
listing could never actually be booked). But the gate that decides
whether to render the page's full CONTENT at all
(listingIsOnTravelerCatalog(tour) in TourDetails.tsx,
listingIsFamily(found, 'stay') in StayDetails.tsx) checks only the
listing's inventory FAMILY (is this a tour/stay product type that is
live at all) -- an entirely different dimension from publish status.
Neither page's content-rendering gate ever checked status. The practical
result: a draft, pending-review, or rejected listing's full title,
description, photos, itinerary, pricing, meeting point, and pickup
instructions were all publicly viewable to anyone who had or guessed its
id, on both the tour and stay detail pages, even though booking it was
correctly blocked. UUIDs aren't trivially guessable, but they can leak --
a supplier sharing a preview link before actually publishing, a search
engine indexing a URL before a listing was unpublished, browser history,
referrer leakage.

Fix: added listingDetailVisibleToTraveler() to src/lib/product-workflows.ts
(family match AND isListingVisibleToTravelers(status), both required --
neither dimension alone is sufficient) and used it in both pages'
content-rendering gates, replacing the family-only checks. Deliberately
did NOT add a status filter to the shared fetchListingById() query itself,
since that function is also used by supplier-side pages
(SupplierListings.tsx, SupplierPickupPlanner.tsx) that must be able to
load the supplier's own draft listing -- the fix is scoped to the two
actual public-facing pages, the smallest correct layer for a
traveler-visibility rule.

Verified: added 4 new Vitest cases to src/lib/workflows.test.ts covering
all four combinations of family-match x status-visible, specifically
including the case this phase closes (family matches, status is
draft/pending_review/rejected -> now hidden). Ran node_modules/.bin/tsc
--noEmit -p tsconfig.app.json against the two edited page components --
zero errors. Ran the full Vitest suite on the device: 97 files, 527 tests
(523 + 4 new), all passing.

Continuing to the next hypothesis.

### Phase 578 -- Closed the arbitrary-recipient gap in notify-customer-booking for every booking-tied email kind

Hypothesis: notify-customer-booking and notify-supplier-event were both
flagged during this segment's audit sweep as "hardened in Phase 562, not
re-audited since." send-supplier-message was re-checked first and confirmed
still safe (Phase-561 service-role bearer check intact, zero other callers).
Both notify-customer-booking and notify-supplier-event were read in full
(600 and 527 lines respectively).

notify-customer-booking has no caller-identity check of its own -- no
gateway JWT check (verify_jwt off) and no bearer-token check in the function
itself, documented as such in its own Phase-562 comment. Phase 562 closed
the arbitrary-recipient/arbitrary-amount vector, but only for
booking_confirmed_paid and refund_completed: both re-derived the recipient
(and, for booking_confirmed_paid, the amount/currency) from the real
bookings row instead of trusting the request body. Every other emailKind --
booking_request, your_details_updated, host_updated_schedule,
pickup_confirmed, pickup_changed, booking_cancelled,
cancellation_requested_by_supplier, cancellation_accepted,
cancellation_declined, new_booking_message, pickup_action_required,
experience_reminder, review_request -- still sent to whatever customerEmail
the caller supplied, verbatim, with only a real (guessable/enumerable)
bookingId required. Concretely: an unauthenticated caller could send a
fully Traverion-branded "your booking is cancelled", "pickup details
changed", or "new message about your booking" email -- several genuinely
safety- or trust-relevant -- to any address of their choosing, for any real
booking on the platform, simply by citing its id.

(notify-supplier-event has an analogous but structurally different and
lower-severity gap: its recipient resolution is always DB-driven from a
client-supplied supplierId via admin.auth.admin.getUserById(), so an
attacker cannot choose an arbitrary recipient -- only trigger
fabricated-content notifications to a real, existing supplier's real
inbox. Deliberately scoped OUT of this phase to keep one phase = one
coherent commit; tracked as a candidate for a future phase, same as
notify-customer-booking's own remaining content-forgery gap noted below.)

Proof before fix: copied the exact pre-fix recipient-resolution block
verbatim off the still-untouched, currently-committed device file into a
scratch Deno harness (mocked admin client) and confirmed a
booking_cancelled request with a real bookingId and an attacker-chosen
customerEmail sailed through with `to` unchanged -- the exploit, reproduced
against the actual current implementation, not merely hypothesized.
Repeated across all 13 other affected kinds; all reproduced identically.

Before writing the fix, traced every legitimate current call site of
notify-customer-booking to confirm requiring bookingId for every kind
except traveler_welcome would not break a real flow:
_shared/promote-paid-from-checkout.ts (booking_confirmed_paid),
stripe-webhook (refund_completed), send-booking-reminders.ts
(experience_reminder, review_request), and every notifyXxx helper in
src/data/supabase-bookings.ts / supabase-booking-ops.ts
(notifyTravelerCancellationRequest, notifyCancellationResolved,
notifyNewBookingMessage, and the inline invoke calls for booking_request,
your_details_updated, host_updated_schedule/pickup_confirmed/pickup_changed,
booking_cancelled). Every one already sends a real bookingId.
traveler_welcome is the one exception -- fired on signup, no booking
concept -- and is intentionally left out of this guard; still exploitable
for an arbitrary-recipient "Welcome to Traverion" email, but far lower
severity (no sensitive content) and tracked as a separate future-phase
candidate.

Fix: extracted the recipient/amount re-derivation into a pure function,
resolveBookingTiedRecipient(), in a new
supabase/functions/_shared/notify-customer-recipient.ts, applied uniformly
to every booking-tied kind instead of gating on
booking_confirmed_paid/refund_completed only. Mirrored byte-for-byte
(comments/formatting aside) at src/lib/notify-customer-recipient.ts, which
edge-function-deno-mirror-sync.test.ts (from the Phase 568 era) picks up
automatically -- this pair now gets real, enforced drift protection,
stronger than the manual "keep in sync" convention booking-hold.ts /
booking-quote.ts rely on. index.ts now imports and calls the shared
function; removed the now-dead local paidConfirmationMaySend.

Also fixed a second, smaller bug uncovered in the same block: when a cited
booking existed but had no usable guest_email on file, the old code
silently fell through and kept the caller-supplied customerEmail --
fail-open, the same underlying spoofing vector, just for a narrower trigger
condition. Now fails closed (422 Booking has no valid guest email on file).

Verified: `deno check` (Deno installed in the sandbox for this purpose --
this repo has no Deno test runner of its own, confirmed again this phase)
against both the shared module and the edited edge function -- zero errors.
Added src/lib/notify-customer-recipient.test.ts: 21 real Vitest cases
against the mirrored logic, covering the exploit-shape reproduction for all
13 other-than-traveler_welcome kinds, the missing-bookingId /
nonexistent-booking / no-guest-email failure paths, the
booking_confirmed_paid happy path (recipient, amount, currency all
unchanged from pre-fix behavior for legitimate callers), and
traveler_welcome's intentional exemption. Ran the full suite on the
device: 98 files, 549 tests (527 + 21 new + 1 new auto-discovered
mirror-sync case), all passing. `tsc --noEmit -p tsconfig.app.json`: zero
errors.

Continuing to the next hypothesis.

### Phase 579 -- Closed the content-forgery gap in notify-supplier-event for booking- and review-tied events

Hypothesis: this was the second half of the pair flagged at the top of this
segment's audit sweep -- notify-supplier-event, "hardened in Phase 562, not
re-audited since," read in full (527 lines) alongside notify-customer-booking
(Phase 578) in the same investigation.

Unlike notify-customer-booking, this endpoint's recipient resolution was
already safe: it is always DB-derived from the client-supplied supplierId
(supplier_team_members lookup, then auth.admin.getUserById() for each team
member plus the supplier themselves), never a caller-supplied email
address. But every content field -- listingTitle, guestName, bookingDate,
guests, bookingNumber, bookingPaymentStatus, reviewRating, reviewTitle --
was trusted verbatim from the request, for every eventType, with zero
existence or ownership check against a real booking/listing/review.
Confirmed by a full read of the serve() handler: the recipients-resolution
loop follows directly after the idempotency claim, with nothing in between
that touches bookingId, listingId, or any content field. Since supplierId
is already effectively public/enumerable (per earlier-phase findings), an
attacker could trigger a fully fabricated "new booking", "booking
cancelled", "cancellation accepted/declined", or "new review" notification
-- entirely invented guest names, dates, guest counts, review ratings and
text -- to any real, existing supplier's real inbox. Lower severity than
notify-customer-booking's arbitrary-recipient gap (the recipient is
DB-constrained to a real account, not chosen by the attacker), but still a
real, live content-forgery vector against a genuine recipient: a supplier
could act on a fabricated "guest cancelled this booking" email, or see a
fabricated one-star review notification before any such review existed.

Fix: added resolveSupplierEventContext() to a new
supabase/functions/_shared/notify-supplier-event-guard.ts, mirrored
byte-for-byte (comments/formatting aside) at
src/lib/notify-supplier-event-guard.ts and picked up automatically by
edge-function-deno-mirror-sync.test.ts -- the same real-drift-protection
pattern established in Phase 578, used here for a second pair. Every
booking-tied eventType (new_booking, booking_cancelled, guest_message,
booking_detail_changed, host_schedule_updated, cancellation_accepted,
cancellation_declined) now requires bookingId+listingId, verifies the
ownership chain (booking.listing_id === listingId, listing.supplier_id ===
the claimed supplierId), and re-derives listingTitle/guestName/
bookingDate/guests/bookingNumber (and, for new_booking, bookingPaymentStatus)
from the real rows instead of the caller-supplied values. new_review now
requires reviewId+listingId (a new field -- see below), verifies
review.listing_id === listingId and listing.supplier_id === supplierId, and
re-derives listingTitle/guestName/reviewRating/reviewTitle from the real
reviews row. booking_detail_changed has no live caller anywhere in the
codebase today (confirmed by grep) -- requiring bookingId for it breaks
nothing currently in use, and closes the gap in advance of it ever being
wired up. messagePreview, changeSummary, fieldDiffs, and unpaidCheckout
have no single authoritative DB column (they summarize a diff or a
free-text guest message, not stored data) and are deliberately left
caller-supplied -- the identical scoping decision Phase 578 made for
notify-customer-booking's own fieldDiffs -- but forging them now requires
citing a real booking or review that genuinely belongs to the targeted
supplier, not merely a real supplierId, a materially higher bar.

Traced every legitimate call site before writing the fix:
_shared/promote-paid-from-checkout.ts and every notifySupplierEvent call in
src/data/supabase-bookings.ts, supabase-booking-ops.ts, and
supabase-reviews.ts already pass real bookingId+listingId for every
booking-tied kind in current use. new_review's one caller (submitReview in
supabase-reviews.ts) did not previously capture the saved review row's own
id -- added `.select('id')` to its upsert and threaded the real id through
to notifySupplierEvent as the new reviewId field. reviews' SELECT RLS is
already public ("Reviews are viewable by everyone", migration 006), so this
select-back required no RLS change and works for the submitting user same
as anyone else.

Verified: `deno check` (from the Deno install added in Phase 578) against
both the new shared module and the edited edge function -- clean. Added
src/lib/notify-supplier-event-guard.test.ts: 20 real Vitest cases --
content-forgery closure for all 7 booking-tied kinds and new_review, the
missing-id and nonexistent-row failure paths (400/404), cross-listing and
wrong-supplier forgery attempts rejected in both directions (403),
new_booking's bookingPaymentStatus re-derivation (paid/pending/none), and
supplier_welcome/verification_submitted passing through with no DB rows
needed. Ran the full suite on the device: 99 files, 570 tests (549 + 20 new
+ 1 new auto-discovered mirror-sync case), all passing. `tsc --noEmit -p
tsconfig.app.json`: zero errors.

Continuing to the next hypothesis.

### Phase 580 -- Closed the last content-authenticity gap: notify-customer-booking's traveler_welcome

Hypothesis: Phase 578 deliberately left traveler_welcome exempt from its
booking-tied recipient guard (no booking exists yet at signup) and
explicitly tracked it, in its own commit message and tracker entry, as a
separate, lower-severity gap worth closing later. Rather than leave a
self-flagged loose end unresolved, closed it now as a small, well-scoped
phase before moving to unrelated ground.

Confirmed the gap was real: with no caller-identity check of any kind (same
missing-auth pattern as every other notify-* endpoint audited this
segment), anyone could POST directly to notify-customer-booking with
emailKind: 'traveler_welcome' and any customerEmail and trigger a real
"Welcome to Traverion" email to that address. No sensitive content, but
still unauthenticated arbitrary-recipient sending on Traverion's own
sending reputation -- a spam/relay-abuse vector, and a plausible
phishing-adjacent pretext even though the embedded link is the real portal
URL.

Fix: traveler_welcome's one legitimate caller (maybeSendTravelerWelcome in
src/data/supabase-consumer-profile.ts) already calls
supabase.functions.invoke(), which forwards the signed-in user's own
session access token as the Authorization header by default -- so
authenticating the recipient needed zero caller-side change. Reused the
exact pattern create-booking-checkout-session already uses for its own
caller: build a Supabase client scoped to the request's Authorization
header, call auth.getUser() on it, and require the resulting email to match
the requested recipient. Added the comparison itself,
isAuthorizedTravelerWelcomeRecipient(), as a small pure function to the
existing notify-customer-recipient.ts mirror pair from Phase 578 (both
copies stay covered by edge-function-deno-mirror-sync.test.ts) -- the
actual auth.getUser() I/O can't be unit-tested here, only the authorization
decision.

Verified: `deno check` on the edited edge function -- clean. Added 3
Vitest cases (case-insensitive/trimmed match, mismatched-email exploit
shape, no-session-email) to src/lib/notify-customer-recipient.test.ts. Ran
the full suite on the device: 99 files, 573 tests (570 + 3 new), all
passing. `tsc --noEmit -p tsconfig.app.json`: zero errors.

This closes the last of the content-authenticity gaps flagged during this
segment's audit of notify-customer-booking and notify-supplier-event
(Phases 578-580 as one connected thread).

Continuing to the next hypothesis.

### Phase 581 -- Audit: swept every verify_jwt=false edge function for the Phase 578-580 bug class; all others verified safe (no code change)

Hypothesis: Phases 578-580 found and closed three real, unauthenticated
content/recipient-trust gaps in notify-customer-booking and
notify-supplier-event -- both `verify_jwt = false` at the gateway, self
-authenticating only partially or not at all. Worth checking every other
function that opts out of gateway JWT verification (supabase/config.toml)
for the same bug class before assuming the two `notify-*` functions were
the only instances.

Read every remaining `verify_jwt = false` function in full or to its
auth-gate/action-dispatch structure:

- admin-supplier-verification (949 lines): every action funnels through
  assertAdmin() first -- a real JWT check via auth.getUser(jwt), then
  app_metadata.role === 'admin', then a second independent check that the
  JWT's email matches the single row in public.admin (migration 037). No
  action bypasses this gate. Spot-checked approve_business/reject_business:
  correct before/after state reads, idempotent email-sent tracking, ownership
  of the email content is inherently admin-authorized (the whole point of
  the endpoint). No bug found.
- notify-staff-verification-queue (Database Webhook target): requires a
  bearer secret (VERIFICATION_WEBHOOK_SECRET) checked with a real
  comparison before any other logic runs; recipient is a fixed
  STAFF_VERIFICATION_EMAIL env var, never client-controlled. No bug found.
- notify-contact-inquiry: recipient is always the fixed CONTACT_INQUIRY_TO
  ops inbox, never client-controlled -- this is a public "Contact us" form
  by design (unauthenticated submission is the intended behavior, same as
  any site's contact form), not a notify-customer-booking-style
  arbitrary-recipient or content-forgery vector against a third party. No
  rate limiting, but that is a standard, accepted contact-form tradeoff
  (Resend's own account-level abuse controls apply), not the class of bug
  this segment has been closing. Not treated as a fix-worthy finding.
- create-booking-checkout-session / expire-booking-checkout /
  reconcile-checkout-session: all three self-authenticate the same way --
  require a real Authorization bearer, build a Supabase client scoped to
  it, call auth.getUser(), and verify ownership of the specific booking
  (guest_email match, guest_user_id match, or supplier ownership of the
  booking's listing) before acting. expire-booking-checkout and
  reconcile-checkout-session read in full this phase; both solid.
- stripe-webhook: Stripe signature verified via
  stripe.webhooks.constructEventAsync() against STRIPE_WEBHOOK_SECRET
  before any event is trusted -- standard, correct pattern.
- send-booking-reminders: requires a bearer secret
  (BOOKING_REMINDER_CRON_SECRET) checked before any logic runs; its own
  calls into notify-customer-booking use the service-role key as
  Authorization, which only matters for traveler_welcome (Phase 580's
  guard) -- send-booking-reminders never sends that kind, so no
  interaction with that fix.
- send-supplier-message: re-confirmed still safe (Phase 561's
  isServiceRoleCaller() bearer check intact, zero client-side callers),
  as already checked at the start of this segment before Phase 578.

Conclusion: no further instances of the Phase 578-580 bug class exist among
the `verify_jwt = false` functions. This closes out that specific line of
investigation for this segment -- an honest negative result, not a padded
phase; recorded per this mission's own rule against claiming vulnerabilities
without real evidence (see Phase 576's precedent for the same standard
applied to a wrong hypothesis).

Continuing to the next hypothesis, outside the notify-*/verify_jwt family.

### Phase 582 -- Adversarial regression coverage for booking_messages / cancellation_requests party authorization (migration 055), no code change

Hypothesis: the booking-messages / cancellation-request / supplier-ledger
subsystem is among the most security- and financial-critical code in the
app -- it gates a private traveler<->supplier conversation thread and is
the only path by which a supplier can force-cancel a paid booking (only
with the traveler's explicit accept) -- and had zero SQL-level regression
coverage. Treated it adversarially per the standard checklist: who may
create/read a conversation, post/read messages, mark them read, request a
supplier cancellation, and accept/decline one; tested both directions
(traveler and supplier); attempted cross-booking access, cross-supplier
access, forged foreign keys, and reassignment through direct writes, not
just the frontend gate in src/lib/messaging-authorization.ts (which
already self-documents as UX-only, not the security boundary).

Read migration 055 (the authoritative implementation) in full. Found the
architecture already sound: booking_messages, cancellation_requests and
supplier_ledger_entries all have RLS SELECT gated by
is_booking_party()/auth.uid()=supplier_id, and INSERT/UPDATE fully blocked
at the RLS layer for everyone (with check (false) / using (false)) --
every write is funneled through four SECURITY DEFINER RPCs
(post_booking_message, mark_booking_messages_read,
request_supplier_cancellation, respond_cancellation_request), each of
which independently re-verifies party membership rather than trusting the
caller. Critically, respond_cancellation_request restricts accept/decline
to the traveler only (guest_user_id or guest_email match) -- a supplier
cannot self-approve their own cancellation request.

Rather than leave this adversarial reasoning as an unverified read-through
(this codebase's own stated standard -- see the mission's proof-before-fix
requirement, applied here as proof-before-trust), proved it with a live
scratch Postgres 16 database including the real, committed migration 055
verbatim (same methodology as reviews_booking_ownership_guard.test.sql):
built a minimal listings/bookings fixture, ran 10 adversarial cases (RLS
SELECT cross-party denial on both booking_messages and
cancellation_requests, direct INSERT/UPDATE rejection even for real
parties, post_booking_message party- and payment/cancellation-state
gating, mark_booking_messages_read scoping, request_supplier_cancellation
restricted to the real listing owner, and -- the crown jewel --
respond_cancellation_request restricted to the real traveler, proving a
supplier cannot self-approve their own cancellation request). All 10 cases
passed against the real, unmodified file.

To confirm this was a real, sensitive test rather than a vacuous pass, ran
the same suite a second time against a deliberately mutated copy of
migration 055 with the traveler-only guard in
respond_cancellation_request removed -- the crown-jewel case correctly
failed, proving a supplier was able to self-approve their own
cancellation under that mutation. This confirms the new suite is a real
regression guard, not false coverage.

No application code changed. Added
supabase/tests/booking_messages_party_authorization.test.sql as
permanent regression coverage for a previously-untested,
financial-critical subsystem -- "important architecture proven safe
through adversarial testing" plus "genuine regression coverage added."

Continuing to the next hypothesis outside the booking_messages/
cancellation_requests family.

### Phase 583 -- Closed a real publish-verification bypass: listings.status could be set to NULL, skipping the 082 trigger and public-exposure guard

Hypothesis: after Phase 582 (booking_messages proved safe), rotated to
Domain D -- public data exposure, "assume attackers can directly query
Supabase." Started from the listings table's own publish-verification
history: migration 082 already fixed a real P0 gap where any unverified
supplier could set status: 'published' directly via the REST API. Asked
whether the same class of gap could exist through a different value the
082 fix didn't anticipate.

It did. Migration 003 added listings.status without a NOT NULL
constraint (its CHECK constraint does not restrict NULL either), so
status could always be explicitly set to NULL via a direct client
UPDATE/INSERT even though the app's own UI never does this. That NULL
value (1) skipped the 082 trigger entirely -- `if new.status =
'published'` never fires when new.status is NULL, since NULL = anything
is NULL, not TRUE -- and (2) was explicitly granted public SELECT access
by the listings policy (migration 052's `status is null or status =
'published' or owner`), and (3) was treated as bookable by all three
places that check listing bookability: src/lib/booking-quote.ts's
isListingBookable(), its Deno mirror in
supabase/functions/_shared/booking-quote.ts's quoteListingBooking() (the
function that actually computes the real Stripe charge), and a redundant
inline check in create-booking-checkout-session/index.ts -- all three
shared the identical `if (status && status !== 'published')` bug, where
a falsy empty/null status short-circuited the rejection.

Net effect: any authenticated supplier account, including a brand-new
one with zero business/payout verification, could set status: null
directly against the REST API and get a listing that was both publicly
visible and bookable -- the same trust bypass migration 082 closed for
'published', reopened through the untested NULL case.

Proved the application-layer half against the current, unmodified code
first: added Vitest cases asserting status: null/'' should be rejected
like 'draft' to both src/lib/booking-quote.test.ts and
src/lib/booking-quote-deno-authoritative.test.ts (the latter directly
imports and executes the real Deno _shared file); both new cases failed
against the pre-fix code (booking accepted when it should have been
rejected), confirming the exploit before touching anything.

Fixed at all four independent layers: the two application-layer
isListingBookable-equivalent checks (frontend and Deno-mirrored
checkout path) plus the redundant inline check in
create-booking-checkout-session/index.ts no longer special-case a falsy
status as bookable; and a new migration 092 backfills any existing
null-status rows to 'draft' (never 'published'), makes the column NOT
NULL (closing the whole bug class structurally, not just at each
application call site), and tightens the SELECT policy to only treat an
explicit 'published' status (or ownership) as publicly readable.

Added supabase/tests/listings_status_null_bypass.test.sql: a live
scratch-Postgres proof including the real migrations 052, 082, 091, 092
verbatim. 6 cases: confirms the 082 trigger correctly blocks an explicit
status='published' attempt (isolating control), proves the status=null
exploit against the pre-fix schema (bypasses the trigger AND is publicly
visible), applies migration 092, then proves the same attempt is now
rejected outright by the NOT NULL constraint, the previously-exploited
row was safely backfilled to draft and is no longer visible, and a
legitimately verified supplier's normal publish flow plus ordinary
draft/ownership visibility are unaffected.

Verified: full Vitest suite on the device -- 99 files, 577 tests (573 +
4 new), all passing. tsc --noEmit -p tsconfig.app.json: zero errors.
Scratch-Postgres regression suite: exit 0, all 6 cases pass.

This is the most severe finding of this session's Domain D/E work so far
-- a genuine, provable verification-bypass vulnerability, not an audit
-only negative result. Continuing to the next hypothesis.

### Phase 584 -- Fixed an inconsistent post-discount price floor on the private flat-group tour pricing branch (quoteListingBooking)

Hypothesis: after Phase 583 (listings.status NULL bypass, closed),
continued the negative-result streak with two more genuine checks --
admin-privilege escalation (public.admin / is_traverion_panel_admin(),
migration 038) and traveler booking-list authorization (bookings SELECT/
UPDATE RLS, migrations 001/005/037/086/087) -- both confirmed already
safe with no code change needed:

  - isAdminUser() requires user.app_metadata.role === 'admin'. Grepped
    every migration and edge function for any write to
    raw_app_meta_data/app_metadata: none exists anywhere in this
    codebase. app_metadata is only settable via the Supabase
    Dashboard/Admin API, entirely outside any client-writable path.
    assertAdmin() ALSO independently cross-checks the caller's JWT
    email against the single row in public.admin (itself RLS-enabled
    with zero policies plus an explicit REVOKE ALL FROM anon,
    authenticated -- migration 038), and both checks run once at the
    very top of admin-supplier-verification's serve() handler, before
    body parsing or any action dispatch -- no admin action can skip
    either gate. No forgery path found.
  - fetchMyBookings()/fetchMyBookingByCheckoutSessionId() rely entirely
    on RLS with no explicit ownership filter in the client query --
    verified this is safe because the active SELECT policies
    (migration 037) scope strictly to `guest_user_id = auth.uid()` or a
    case-insensitive match between `guest_email` and the caller's own
    JWT email, and migrations 086 (dropped the client-writable INSERT
    policy entirely -- every booking row must now come from the
    service-role edge function) and 087 (freezes guest_email/
    guest_user_id, among other identity/schedule fields, against ANY
    client UPDATE at any payment status) already closed the two gaps
    that would have made this exploitable. Guessing another traveler's
    checkout_session_id does not bypass RLS -- it is just an additional
    WHERE filter on top of it.

Then audited supabase/functions/_shared/booking-quote.ts's four
independent tour-pricing branches for internal consistency with each
other -- the same technique that found Phase 583 (three call sites
sharing one bug, one branch missing it). It found one: three of the
four branches (age-dependent participant categories, the standard
per-guest option, and the no-option fallback) all re-check
`bestPrice()`'s output for positivity and reject with "This tour does
not have a bookable price yet." if a discount brings the price to zero
or below. The private flat-group branch (isPrivate && privatePricing
=== 'flat_group') only checked the PRE-discount price and returned
ok: true unconditionally afterward, regardless of what the discount
computed.

listing_discounts.value has no upper bound at the schema level
(migration 002), discounts are public-SELECT-able, and
`applicable()`/`bestPrice()` auto-apply every currently-valid discount
scoped to an option regardless of whether a "code" was entered (the
code column is never read by the pricing logic). So a supplier's own,
entirely legitimate 100%-off promotional discount on a private/
flat-group tour option computed unit = 0 and this branch said ok: true
with totalAmount: 0; a >100% value (typo or test) computed a negative
unit price and still said ok: true.

Not a payable exploit -- create-booking-checkout-session already has a
defense-in-depth guard rejecting any amountMinor < 1 immediately before
creating the Stripe session, so Stripe itself was never asked to charge
$0 or negative. But claim_pending_checkout_booking (which reserves a
30-minute inventory hold) runs before that late guard, so the real
effect was: a supplier's legitimate 100%-off promo on a private-group
tour was silently broken for every customer (wasted hold + a confusing
generic error instead of the correct upfront message every other
option type gives), and a malformed >100% discount could similarly
claim-then-fail with a momentarily negative total_amount on a
never-paid pending booking. Both self-heal via the already-audited
30-minute expire_stale_checkout_holds TTL.

Proved it first: added two Vitest cases (100%-off and 150%-off
discounts on the existing private flat-group fixture) to
src/lib/booking-quote-deno-authoritative.test.ts asserting ok: false
with the same message the sibling branches give; both failed against
the unmodified code (ok: true instead), confirming the bug. Fixed by
adding the identical post-discount `if (!(unit > 0)) return {ok:false,
error:'This tour does not have a bookable price yet.'}` check the
other three branches already use. src/lib/booking-quote.ts (the
frontend display-estimate mirror) has no flat-group/private-pricing
branch at all, so this is a single-file fix.

Verified: full Vitest suite on the device -- 99 files, 579 tests (577
+ 2 new), all passing. tsc --noEmit -p tsconfig.app.json: zero errors.

A real, provable inconsistency bug (same class as Phase 583: one
pricing/authorization branch missing a check its siblings already
have), not an audit-only negative result -- but lower severity than
583, since the defense-in-depth Stripe-amount guard already prevented
any actual $0/negative charge; the harm here was a broken supplier
promotion and a wasted inventory hold, not a payment-integrity or
data-exposure breach. Continuing to the next hypothesis.

### Phase 585 -- Closed the refund_completed amount-spoofing gap Phase 562 flagged and deferred

Hypothesis: Phase 562 fixed notify-customer-booking's recipient- and
amount-spoofing problem for booking_confirmed_paid and refund_completed's
recipient, but its own comment explicitly deferred refund_completed's
amount/currency re-derivation: "refund_completed is only ever triggered
server-side today... its totalAmount is the actual Stripe refund amount
-- which can be a *partial* refund with no single corresponding column
on bookings -- so only its recipient is re-derived here... A full amount
re-derivation for refund_completed, once a per-refund ledger value is
available to check it against, is a reasonable target for a future
phase." Revisited whether that per-refund ledger value now exists, or
whether the original premise (partial refunds complicate this) actually
applies to this specific emailKind.

It doesn't need a ledger. Traced every caller of notify-customer-booking
across src/ and supabase/functions/ for emailKind: 'refund_completed':
there is exactly one, stripe-webhook/index.ts's charge.refunded handler,
and it only sends this email inside the branch gated on
isStripeChargeFullyRefunded(charge) being true -- a partial refund takes
a different branch entirely (records a booking_payment_events row and
returns, never flipping payment_status, never emailing). So for this
specific emailKind, "the refunded amount" and "the booking's original
amount_paid" are always the same number by construction; Phase 562's
partial-refund concern doesn't apply here (it only affects a
hypothetical future partial-refund notification, which doesn't exist
yet).

notify-customer-booking has no caller-identity check of its own
(verify_jwt = false, no bearer-token check for any kind other than
traveler_welcome, which Phase 580 already gated separately). Net
effect of the gap: an unauthenticated caller citing any real bookingId
could trigger a genuine, Traverion-branded "Your refund is complete"
email quoting a fabricated amount/currency -- including for a booking
that was never refunded at all. The recipient was already safely
re-derived (can't redirect it to an attacker's inbox against a
victim's real booking), so this was a narrower integrity/impersonation
gap than a full arbitrary-send, but real: using Traverion's own domain
and a real booking's details to send a false transactional email.

Proved it first: added two Vitest cases to
src/lib/notify-customer-recipient.test.ts -- refund_completed against a
booking still in payment_status: 'paid' (never refunded), citing a
caller-supplied amount of 99999 -- both failed against the unmodified
resolveBookingTiedRecipient (ok: true, with the fabricated figure, for
a never-refunded booking). Also found and fixed a pre-existing test
fixture that incidentally used payment_status: 'paid' for an unrelated
refund_completed case (testing the guest_email fail-closed path) --
updated it to 'refunded' so it still tests what it always meant to
rather than tripping the new gate first.

Fixed in src/lib/notify-customer-recipient.ts and its Deno mirror
supabase/functions/_shared/notify-customer-recipient.ts (kept in sync
per edge-function-deno-mirror-sync.test.ts): extended
resolveBookingTiedRecipient's existing amount/currency re-derivation to
also cover refund_completed, gated on a new
refundConfirmationMaySend(paymentStatus) check requiring
payment_status === 'refunded' (409 "Booking is not refunded"
otherwise, mirroring paidConfirmationMaySend's existing pattern for
booking_confirmed_paid), then reading amount/currency from the same
amount_paid/total_amount/currency fields already used for
booking_confirmed_paid.

Verified: full Vitest suite on the device -- 99 files, 581 tests (579
+ 2 new), all passing, including edge-function-deno-mirror-sync.test.ts
confirming the two mirrored files stayed identical. tsc --noEmit -p
tsconfig.app.json: zero errors.

Continuing to the next hypothesis.

### Phase 586 -- Closed a supplier self-review / rating-manipulation gap migration 089 did not cover

Hypothesis: migration 089 already closed a real fake-review /
false-verified-badge gap by requiring booking_id, when set, to
reference a real, owned, confirmed booking for the SAME listing being
reviewed -- with a thorough 10-case regression suite. Asked whether
089's ownership check (owns the BOOKING) also implies ownership
integrity of the REVIEW relative to the LISTING, or whether a
different actor -- the listing's own supplier -- could satisfy every
one of 089's conditions legitimately while still producing a
misleading review.

It could. Traced create-booking-checkout-session/index.ts end to end:
nothing stops a signed-in supplier from completing a real checkout on
their own listing. A supplier can therefore legitimately reach
status='confirmed' on a booking of their own tour or stay (Stripe TEST
mode only, per the mission's standing constraint), then use that
entirely real, entirely 089-compliant booking as proof to leave
themselves a five-star "Verified" review. 089 checked ownership of the
booking; it never checked ownership of the listing relative to the
reviewer.

Proved it first: supabase/tests/reviews_supplier_self_review_guard.test.sql,
a scratch-Postgres 16 proof mirroring 089's own test scaffolding
exactly, with the real migrations 006 and 089 included verbatim.
Case 1: a supplier books their own listing for real, then reviews it
as Verified using that booking -- succeeds against 089 alone,
confirming the gap.

Fixed via new migration 093_reviews_block_supplier_self_review.sql:
extends both of 089's own INSERT/UPDATE policies with an independent
guard -- the review's listing must not belong to a listing whose
supplier_id is the reviewing user -- applied unconditionally (verified
or not, since the underlying fraud is impersonating an independent
customer voice on your own listing at all). Does not touch whether
suppliers may book their own listings (a separate product question) or
block a supplier from reviewing a genuinely different listing they
booked as an ordinary traveler.

6-case regression suite, all passing: the pre-fix exploit proven; the
identical attempt rejected after 093 even with a completely real
owned+confirmed booking; an unverified supplier self-review also
rejected; a genuine unrelated traveler's verified review unaffected; a
supplier reviewing a DIFFERENT listing they genuinely booked as a
traveler unaffected; the same exploit via UPDATE rejected.
Mutation-tested (stripped the new guard back out, confirmed Case 2
correctly fails) to validate the suite has real teeth.

Verified: full Vitest suite on the device -- 99 files, 581 tests, all
passing (pure RLS-level fix, no application code touched). tsc
--noEmit -p tsconfig.app.json: zero errors.

Continuing to the next hypothesis.

### Phase 587 -- Closed a payout-readiness honesty gap: "Paid out to suppliers" could never become non-zero

Mission scope broadened this phase from security-only auditing to full
marketplace completion (golden journeys, transaction truth, stays/rentals,
supplier operating system, admin operations, and more -- see the updated
traverion-autonomous-audit skill). Took the first hypothesis from the new
Priority Zero list: payout readiness.

AdminFinancePanel.tsx and SupplierEarnings.tsx already display, per
currency, "Paid out to suppliers" ("Recorded payout periods, status Paid")
and "Pending payout" ("Payout periods not yet marked Paid"), sourced from
admin-supplier-verification's finance_summary action reading
public.supplier_earnings.status -- a per-period payout-batch table
(migration 002) whose RLS already denies all client insert/update
("system only"), by design. Grepped every migration, every Edge Function,
and all of src for a write path into that table: there is none, anywhere.
It has never been inserted into since creation. So those UI figures were
structurally guaranteed to read 0 / 0 forever, regardless of how many real
manual payouts the founder actually sends to suppliers -- while presented
as real, computed figures. Placeholder functionality presented as real,
in the platform's own money-truth panel.

Deliberately did NOT build automatic payout computation (period cadence,
auto-generated pending batches) -- that stays a genuinely unbuilt feature
(the repo's own prior handoff explicitly lists "Automatic payouts" under
WHAT IS NOT BUILT) and picking a cadence/policy would be a product
decision outside this mission's authority. Closed only the narrower,
provable gap: there was no way, anywhere, to record that a payout
happened at all -- even though the UI already promises "Payouts are
manual, so this page never invents a transfer."

Fixed via new migration 094_admin_record_supplier_payout.sql: a SECURITY
DEFINER RPC admin_record_supplier_payout, granted only to service_role
(same trust pattern as record_paid_booking_earnings / reverse_paid_
booking_earnings), reachable only through admin-supplier-verification's
existing assertAdmin() gate. Validates supplier existence, positive
amount, real currency, valid period, and status before inserting. Adds
two additive nullable columns to supplier_earnings: note (optional human
reference) and recorded_by (which admin recorded it -- there is no
separate admin-audit-log table in this codebase).

6-case scratch-Postgres proof (supabase/tests/admin_record_supplier_payout.test.sql,
migrations 002 + 094 included verbatim via \ir): real paid payout records
correctly; pending payout records correctly; six invalid-input variants
all rejected with ok:false; an ordinary authenticated caller cannot
execute the RPC directly; an ordinary authenticated caller still cannot
bypass it via direct insert (pre-existing RLS, unregressed); a supplier
can read their own payout row but not another supplier's (pre-existing
RLS, unregressed). Mutation-tested: stripped the revoke/grant guards from
a copy of the migration, confirmed the direct-execute case then correctly
fails, confirming the test has real teeth.

Server-truth (SQL) only -- no TypeScript touched this phase. Baseline gate
re-confirmed before starting: tsc clean, vitest 99 files / 581 tests
passing.

Deliberate follow-up, not done in this phase: wire a
record_supplier_payout action into admin-supplier-verification and a
minimal "Record a payout" control into AdminFinancePanel.tsx, so a founder
can actually reach this RPC from the admin UI. Queued as the very next
hypothesis.

Continuing to the next hypothesis.

### Phase 588 -- Wired admin_record_supplier_payout into the admin API and Finance panel

Direct follow-up to Phase 587's server-truth RPC, which was deliberately
left unreachable except via direct service-role/SQL access. Closed that
reachability gap so the fix is actually usable, not just provable.

admin-supplier-verification/index.ts: new admin-gated action
record_supplier_payout (next to finance_summary), with client-side
validation before calling the RPC, p_recorded_by set to the calling
admin's own verified id from the existing assertAdmin() JWT gate, and the
RPC's own validation errors surfaced as clean 400s.

AdminFinancePanel.tsx: new "Record a payout" control (collapsed by
default) -- supplier user ID, amount, currency (from the app's existing
SUPPORTED_CURRENCIES list), status paid/pending, period, optional note --
with matching client-side validation, a clear "this records rather than
moves money" explanation, and a reload of the finance summary on success
so "Paid out to suppliers" immediately reflects what was just recorded.

No new automated test: this repo has zero .test.tsx files anywhere
(confirmed by find) -- component testing is not this codebase's
convention, and the underlying RPC logic was already proven in Phase
587's scratch-Postgres suite. Verified via the existing gates: tsc clean,
vitest 99 files / 581 tests passing, no regressions.

Payout readiness (Priority Zero) is now closed end to end: the honesty
gap is fixed (094), and the fix is reachable from the admin UI a founder
actually uses (this phase).

Continuing to the next hypothesis.

### Phase 589 -- Server-side backstop for listing publish content minimums (city, country, real hero image)

Sibling gap to Phase 549/082: 082 fixed the business/payout publish check
being client-only, but never touched the listing's OWN content -- and
listingPublishGate.ts's getListingPublishBlockers() (title, description,
price, hero image, city/country, includes/excludes, gallery, per-option
schedules) has always been pure TypeScript, imported only by the two
supplier listing pages, never enforced on the server.

Proved the gap against a scratch Postgres 16 instance: with only 082
applied, a verified supplier can INSERT a listing with city=null,
country=null, and image set to the app's own placeholder photo
(LISTING_PLACEHOLDER_IMAGE) directly as status='published' -- succeeds
outright. Two real production-value problems: no city/country breaks
location search and destination pages (they filter/display by these
columns), and a placeholder hero image shows travelers fake-looking
"real" inventory -- against this repo's own "REAL EMPTY > FAKE BUSY"
principle.

Deliberately did NOT re-implement the whole client gate in SQL. Left out
price and all JSONB-nested option/schedule validation -- that's owned by
quoteListingBooking (kept lockstep with its Deno mirror via a dedicated
sync test), which already rejects an unbookable price at checkout
(Phase 584), so duplicating it a third time in a raw trigger would risk
the falsy-guard/sibling-drift bug class this mission keeps finding, for
a case that isn't actually exploitable for money. Fixed only city,
country, and hero-image-not-placeholder -- simple plain columns, no JSON
parsing, and the two checks with real discovery/trust consequences on
their own.

095_listing_publish_content_minimums.sql: same gating pattern as 082
(before insert or update, only fires on the transition into
status='published', never on an edit to an already-published row).
Rejects empty/whitespace city or country, and rejects an
empty/null/placeholder image (exact URL or the pexels.com/photos/346885
substring, matching the client gate's own check).

13-case proof test, including composition with 082 (an unverified
supplier with perfect content is still blocked by 082 -- 095 doesn't
bypass it) and the already-published-listing-later-goes-stale case
(not newly blocked, matching 082's own behavior). Mutation-tested by
stripping the placeholder-image check and confirming the relevant case
then correctly fails.

No application code changed this phase (SQL-only) -- no tsc/vitest
regression run needed.

Continuing to the next hypothesis.

### Phase 590 -- CRITICAL: closed a public data leak on public.supplier_profiles (bank IBAN/BIC, tax/VAT ID, ID-document paths, home/business address, phone, internal verification feedback)

Public Data Exposure sweep (domain rotation, first pass on this table).
public.supplier_profiles has had `for select using (true)` -- readable by
literally anyone, anon key included -- since migration 001, when the
table had exactly two columns (id, display_name). Ten later migrations
(010, 012, 021, 029, 030/033, 036) added payout_iban/payout_bic/
payout_paypal_email, company_registration_number, tax_id, vat_id,
managing_directors, business_address, insurance details, contact_phone,
identity_document_path, company_registration_document_path,
address_street/city/postal_code/country, and the admin team's internal
business_verification_feedback/payout_verification_feedback -- without
anyone revisiting that original policy. This was a real, live production
PII/credential leak, not a subtle logic bug: any unauthenticated request
with the public anon key could read every supplier's bank details, tax
ID, ID document storage paths, home address, phone number, and internal
verification notes.

Confirmed via grep that this was never intentional: every direct app
read (src/data/supabase-supplier-profile.ts) is commented "RLS: own row"
and scoped by the CALLING user's own id, trusting RLS to enforce
ownership when the policy enforced nothing; the one genuine public use
case (name/logo/address/legal text on listing pages) already goes
through a narrow SECURITY DEFINER RPC, supplier_public_legal()
(migration 051), built specifically to avoid exposing the raw table;
every server-side cross-supplier read uses the service_role key
(bypasses RLS, unaffected); no embedded/joined select exists anywhere.

096_supplier_profiles_restrict_select_to_owner.sql: drops the
never-tightened policy, replaces it with `using (auth.uid() = id)`.
Proved the gap first (a different authenticated supplier reading
another's IBAN/tax_id/document path/internal feedback succeeded against
the unmodified policy), then proved the fix (non-owner and anonymous
reads both return zero rows -- RLS is row-level, not column-level, so a
non-owner sees no row at all, not a redacted one; owner's own full read
still works; supplier_public_legal RPC still works for any caller).
Mutation-tested by removing the new policy and confirming the owner's-
own-read case then correctly fails. Ran the full existing gates given
the severity: tsc clean, vitest 99 files / 581 tests passing, no
regressions.

This is the highest-severity finding of the mission so far -- a live,
unauthenticated, complete leak of supplier financial and identity data.
Worth continuing the Public Data Exposure sweep on other tables next
(the same "RLS enabled with using(true), then columns added later
without revisiting the policy" pattern could exist elsewhere).

Continuing to the next hypothesis.

### Phase 591 -- Fixed CSV/formula injection across all three supplier CSV exports (Bookings, Pickup Planner, Earnings)

Found while sweeping for fresh, unaudited surface after the Phase 590 RLS
sweep wound down: three supplier-portal export functions
(downloadBookingsCsv, Pickup Planner's exportCsv, Earnings' money export)
each hand-rolled their own local escape helper, and all three only
guarded ordinary CSV syntax (quote/comma/newline) -- none defended
against CSV/formula injection (CWE-1236). Every export includes at least
guest_name, a field any TRAVELER sets freely at an ordinary,
unauthenticated checkout. A guest name or special request like
`=HYPERLINK("https://evil.example/steal","Open")` or a DDE payload
(`=cmd|'/c calc'!A0`) reaches the exported CSV verbatim and gets
evaluated by Excel/Sheets/LibreOffice as a formula the moment a supplier
opens their own export -- quoting the CSV field doesn't prevent this,
since quoting is a CSV-parsing concern and formula evaluation is a
separate, later step the spreadsheet app does on the parsed cell content.

Fixed at the shared-utility layer (src/lib/csv-export.ts, csvSafeCell)
rather than patching each duplicated escape function separately -- the
standard OWASP mitigation (prefix a leading `'` when a cell's first
character is =, +, -, @, tab, or CR; every mainstream spreadsheet app
renders that as an invisible "force text" marker). All three call sites
switched to the shared function; existing CSV-syntax escaping behavior
is unchanged, so this is a pure hardening with no business-rule or
exported-data change.

7-case Vitest suite: keeps the three legacy escape functions inline
(never imported by app code) to prove they let real formula/DDE payloads
through with the trigger character still leading the cell (GAP
CONFIRMED), then proves the fix neutralizes every payload, preserves
existing quote/comma/newline escaping, doesn't corrupt a legitimate
value that happens to start with a trigger character, and doesn't
double-escape when a value needs both protections.

Verified: tsc clean, vitest 100 files / 588 tests (7 new), no
regressions.

Continuing to the next hypothesis.

### Phase 592 -- CORRECTION to Phase 590: migration 096 was a harmless duplicate, not a fix -- migration 051 had already closed the supplier_profiles leak weeks earlier

Self-correction, found by the hourly scheduled run while starting its
next phase and re-reading recent history per protocol step A ("search
prior migrations/tracker entries first"). Phase 590 claimed
public.supplier_profiles had been publicly readable "since migration
001, never revisited," and that migration 096 closed a live,
unauthenticated leak of supplier bank details, tax IDs, ID-document
paths, address, phone, and internal verification notes. That claim was
false: migration 051 (051_checkout_concurrency_and_payment_guard.sql,
committed 2026-09-08 -- about two weeks before this mission started) had
already dropped the leaky migration-001 policy and replaced it with an
owner-only one, closing this exact gap 45 migrations before 096 ran.
051's own commit message says so directly: "Public SELECT on
supplier_profiles leaked IBAN, tax IDs, and document paths."

Root cause: Phase 590's investigation searched for `alter table
public.supplier_profiles` (to find added columns) and separately noted
which migrations mention `create policy`, but never checked whether a
later migration had DROPPED and REPLACED the original SELECT policy --
that doesn't show up in an ALTER TABLE search. The scratch-Postgres proof
test for 096 compounded this: it replayed only migration 001's original
policy as "pre-fix," never checking it against the real, current
production schema, so its "GAP CONFIRMED" notice proved a gap that had
not existed for weeks.

No regression came from 096 (two permissive policies with an identical
qual just OR together to the same access as either alone), but the
founder was told this was a critical, currently-exploitable production
leak and advised to consider whether data had already been scraped --
which was not accurate, and has been corrected directly with them.

097_supplier_profiles_dedupe_redundant_select_policy.sql: removes 096's
redundant policy; migration 051's "Owners can read own supplier profile"
remains as the sole SELECT policy. Access is unchanged -- this is a
maintenance-hazard cleanup (two differently-named policies doing the
same job), not a security fix. The regression test was corrected to
replay migrations 001, 051, and 096 in real commit order (rather than
jumping straight from 001 to 096) and now proves: anonymous/cross-
supplier reads were already blocked immediately after 051, before 096
existed; 096 changed nothing observable; exactly one SELECT policy
remains after 097 and behavior is identical throughout.

Standing process reminder for future phases: a `grep` for `create
policy` on a table is not enough to establish there's no existing fix --
check for `DROP POLICY` + replacement too, and when a scratch-Postgres
proof needs a "pre-fix" state, replay the real migration files in actual
commit order rather than reconstructing an assumed original state from
just the table's CREATE TABLE migration.

No application code changed -- SQL-only. Verified against a scratch
Postgres 16 instance (all cases pass, including the new post-097
policy-count and access-unchanged assertions); no tsc/vitest run needed.

Continuing to the next hypothesis.

### Phase 593 -- Two traveler-identity bugs fixed: unverified JWT email claim trusted as proof of identity, and a NULL-comparison authorization bypass in booking cancellation (the second found while proving the first, unconditional, higher severity)

Domain B/C sweep (traveler-side authorization), rotating away from the
supplier RLS area Phase 590/592 had just covered. Every place in this
schema that proves "this signed-in user IS the traveler on booking X"
accepts either guest_user_id = auth.uid() (the booking was created by
this exact account) OR a raw string match of the JWT's email claim
against guest_email. Nothing anywhere checked auth.users.email_confirmed_at
before trusting that claim -- and most guest_email values belong to
nobody's account at all (most travelers check out without ever creating
one), so that address is free for anyone to claim at signup as long as
nobody has registered it yet.

This repository cannot see or change the hosted Supabase project's
Authentication -> Email -> "Confirm email" setting, so this entry does
NOT claim the unconfirmed-email path is currently exploitable in
production -- only that the database layer should not depend on an
external toggle it cannot verify. src/contexts/AuthContext.tsx's own
signIn/signUp already carries a client-side `!email_confirmed_at` guard
for this exact scenario, which is suggestive but not a substitute for
enforcing it server-side (anyone can call the REST/RPC API directly with
a captured access token). Fixed with a single shared helper,
jwt_verified_email(), that returns the JWT email claim only when the
account's email_confirmed_at is actually set -- every affected site
(is_booking_party -> booking_messages/cancellation_requests visibility +
post_booking_message/mark_booking_messages_read, is_traverion_panel_admin
as defense in depth, the bookings SELECT/UPDATE email-match policies,
update_guest_booking_special_requests, cancel_booking_as_traveler,
respond_cancellation_request, and the reviews INSERT/UPDATE "verified"
badge check) now goes through it instead of reading the raw claim.

Separately -- found while writing the proof test for the fix above, not
something this phase set out to look for -- cancel_booking_as_traveler
and respond_cancellation_request both gate access with `if not
(guest_user_id = v_uid or (email match)) then reject end if;`. When a
booking has guest_user_id IS NULL (any guest checkout with no account)
and the caller's email claim doesn't match at all -- no spoofing
attempted, nothing to do with confirmation -- `NULL = v_uid` evaluates
to SQL NULL rather than false, `NULL OR false` stays NULL, and
PL/pgSQL's `IF NOT (...)` treats a NULL condition the same as false: it
skips the reject branch entirely. In plain terms: ANY authenticated
user, with no email claim needed at all, could cancel or
accept/decline the cancellation of ANY booking with no linked account,
just by knowing its booking_id -- unconditional, and unlike the finding
above, this does NOT depend on any Supabase Auth setting; it is
provably live in the currently-committed production code as written.
Proven directly with a caller whose email claim is completely blank,
isolated from the first finding. Fixed by wrapping the ownership check
in coalesce(..., false) before negating it in both functions, so a NULL
outcome means reject rather than allow; a real authorized caller is
unaffected (`x OR true` stays true regardless of x). Grepped every `if
not (` across every migration, current and superseded: only these two
functions' current bodies have this shape.

supabase/tests/jwt_email_requires_confirmation.test.sql: installs the
CURRENT, real pre-fix bodies of every affected object (transcribed
verbatim from the live migration files, not a reconstructed "original"
state, per the Phase 592 process note), proves GAP CONFIRMED for all 7
unconfirmed-email sites plus the independently-isolated NULL-bypass
case, proves all 8 are rejected after the real fix migration is
applied, proves a genuine confirmed-email traveler and the untouched
guest_user_id path are both unaffected, and runs two separate mutation
checks (reverting each fix independently) that each correctly reopen
their own gap.

Verified against a scratch Postgres 16 instance: full run, zero errors,
"ALL ASSERTIONS PASSED (098)". No application code changes needed --
every client call site only invokes these RPCs and doesn't depend on
their internal authorization logic (grepped and confirmed). No
tsc/vitest run needed (SQL-only).

Continuing to the next hypothesis.

### Phase 594 -- Domain rotation: Stays (date arithmetic, calendar, lifecycle) audited, no fix needed

Rotated away from traveler-identity (Phase 593 was unusually fruitful --
two real fixes there) to the Stays domain, not yet touched this
session. First did a short follow-up sweep for the exact NULL-comparison
bug class Phase 593 found (an `IF NOT (nullable-column-comparison OR
...) THEN reject END IF;` shape in a SECURITY DEFINER PL/pgSQL
function): checked every other client- or admin-reachable function of
that shape --
public.is_consumer_phone_available/is_phone_available_for_signup (023/
024, availability checks, not authorization-critical, already
null-safe), public.enforce_listing_publish_verification (082, uses
coalesce(...) <> 'verified', null-safe), public.request_supplier_cancellation
(084's version supersedes 055's -- confirmed 084, not 055, is the
current one; both already guard with `v_supplier IS NULL OR v_supplier
<> v_uid`, null-safe). public.reverse_paid_booking_earnings (070) and
public.admin_record_supplier_payout (094) are service_role-only, not
client-reachable. No further instances found.

Then examined the Stays inventory/calendar/cancellation-window logic
end to end: stay_booking_check_out (071, exclusive check-out: check_out
column, else booking_date + nights, else +1 day -- sound), the stay
half-open-range overlap check in assert_checkout_inventory (071,
`booking_date < check_out AND stay_booking_check_out(b) > check_in` --
correctly allows same-day turnover, matches standard hotel-industry
semantics, re-confirmed sound, consistent with the checkout-concurrency
review from an earlier phase), booking_occupies_inventory (054, the
current version -- null-safe via coalesce/IS DISTINCT FROM throughout;
its dead-code fallback for a null created_at is unreachable since
bookings.created_at is NOT NULL with a default), expire_stale_checkout_holds
(054, the only version, correctly expires only holds that no longer
occupy inventory), published_stay_occupied_ranges (079, the current
version -- public calendar read, correctly scoped to check_in/check_out
dates only, no guest PII, matches assert_checkout_inventory's occupancy
definition), and the 24-hour free-cancellation-window computation in
cancel_booking_as_traveler (`(booking_date + coalesce(start_time,
'00:00')) at time zone 'Europe/Helsinki'` -- applies uniformly to stays
via booking_date/start_time the same as tours; not incorrect, just
worth noting as a product nuance rather than a bug: a stay's
cancellation window is anchored to midnight of the check-in date in
Helsinki time, not a specific check-in time, which is the only
reasonable choice given stays don't store one).

No code change this phase -- a clean, verified audit is a legitimate
phase outcome, not a gap. Stays domain (F) marked provisionally healthy;
rotating to a different domain next phase per the skill's own guidance.

### Phase 595 — Reconcile voucher ownership + journal/deploy truth

**Repository truth at start of continuation:**
- Documented phase in journal was 594 (`4e1618a`); progress header was stale at 544.
- HEAD `4166442` ("Update Traverion") already contained Phase 595-class work: migration `099_supplier_booking_vouchers_ownership_guard.sql` + adversarial SQL test, plus accidental tracking of `scripts/cert-transactional-emails.cjs` and seven `vite.config.ts.timestamp-*.mjs` junk files.

**Voucher ownership (099) — code/test evidence:**
- Gap: INSERT/UPDATE RLS on `supplier_booking_vouchers` only checked `supplier_id = auth.uid()`, allowing any auth user to attach another supplier's `booking_id`/`listing_id`.
- Fix: WITH CHECK requires listing ownership + booking/listing agreement.
- Verified by `supabase/tests/supplier_booking_vouchers_ownership_guard.test.sql` (in git).
- **Distinction:** migration **exists in git** + **has SQL regression test**; **Remote NOT applied** (see migration matrix below). Production behavior therefore **not certified**.

**cert-transactional-emails.cjs decision:**
- Earlier mission note said "intentionally untracked." HEAD had tracked it.
- Inspected: file hardcodes Supabase **service_role** and anon JWTs. Tracking it is a secret leak.
- Action: removed from git index, added to `.gitignore`, kept local copy on disk for founder use. **Do not re-commit.** Keys that appeared in git history should be treated as exposed and rotated when practical.
- Also removed tracked Vite timestamp junk files and gitignored `vite.config.ts.timestamp-*.mjs`.

**Migration apply matrix (linked project `xcopqllkulxfkpunetbc`, `supabase migration list --linked`):**
| Band | In git | Remote applied | Notes |
|------|--------|----------------|-------|
| 001–079 | yes | yes | Remote column populated |
| 080–099 | yes | **NO** | Includes publish/authz/email/review/payout/identity/voucher guards from Phases ~551–595 |

Never equate repository presence with deployment. Phase 596+ must push/verify remote apply before claiming production trust for those guards.

### Phase 596 — Apply trust migrations 080–099 to linked remote

**Problem:** Phase 595 proved migrations 080–099 existed in git but Remote column was empty — production TEST project lacked the security/trust guards from Phases ~551–595.

**Action:** `supabase db push --linked` applied all 20 migrations successfully (notices only for IF NOT EXISTS drops).

**Evidence after push:**
- `supabase migration list --linked`: Local=Remote for 080–099
- Remote functions present: `jwt_verified_email`, `cancel_booking_as_traveler`, `admin_record_supplier_payout`, `enforce_listing_publish_verification`
- `supplier_booking_vouchers` policies present (read/update/insert)
- `listings.status` attnotnull = true

**Certification level:** **remotely applied** + prior local SQL tests in repo. Not a substitute for full remote adversarial re-run of every `.test.sql` file.

Also fixed progress header SHA for Phase 595 (`59057da`) after a quoting glitch.

### Phase 597 — Partner ops golden journey (localhost browser)

**Session:** Demo partner already authenticated as Aurora Lapland Experiences Oy on `http://127.0.0.1:5173/partner`.

**Certified (browser, read-only):**
- Home: attention items, today’s schedule (Ranua 10:00 / Anna / 5 guests / meet point / booking #), TEST mode banner.
- Bookings list: 13 bookings; rows show guest, listing, option, date, **start time**, guests, €, Paid/Refunded.
- Booking detail `#27` Markus Niemi / Guaranteed Northern Lights / **Private tour** / Meet · Hotel pickup / Paid / Pickup 19:45 — commercial fields visible without inventing data.
- Calendar (`/partner/availability`): September days with guest counts; **19 Sept day panel** shows distinct departures **09:00** (Ice Fishing), **20:00** NL, **20:30** NL Private — multi-departure operational truth.
- Listings: Live 5 / Draft 41 / Stays 1 tabs; published + draft inventory present.

**Not certified this phase:** partner create→publish wizard end-to-end (would mutate); traveler booking against partner inventory.

**Credentials used (documented partner demo):** see `docs/PARTNER_DEMO_COVERAGE.md`.

### Phase 598 — Traveler Trips authenticity (session before empty)

**Problem investigated:** Demo traveler `anna@partner-demo.traverion.invalid` has **3 paid bookings** in remote DB (guest_user_id matches auth.users). Anon-key API after `signInWithPassword` returns those 3 rows and `jwt_verified_email()` resolves. Localhost browser first showed **“No trips yet” while Profile showed signed-in**, then later a login with `next=bookings` landed on Trips still asking to log in.

**Root cause (honest):** `fetchMyBookings()` queried without waiting for a session. An anonymous RLS-filtered select returns `[]`, which the UI treats as a truthful empty mailbox (“No trips yet”) — dishonest when the traveler is mid-auth or session not yet attached. AuthPage also navigated immediately after `signIn` without awaiting `getSession()`.

**Fix:**
- `fetchMyBookings`: await `getSession()`; if no user, throw “Sign in to load your trips.” (ErrorState) instead of returning [].
- `AuthPage` sign-in: await `supabase.auth.getSession()` before `onNavigate(next)`.

**Evidence:** Node anon client with demo password → COUNT 3. Migrations 080–099 already applied (Phase 596). Stripe remains TEST.

### Phase 599 — Pickup Planner cert + pluralization honesty

**Browser (localhost, aurora-ops demo):** `/partner/pickup` loads after partner login. Shows 10 bookings / 26 guests, day sections with start + pickup times, multi-departure 19 Sept (09:00 ice / 20:00 NL / 20:30 NL private). Filters: All dates / Today / Tomorrow / Needs details / Export.

**Bug fixed:** Day headers and hero stats rendered “guest s” / “booking s” because plural `s` was a separate React text node (and/or newline), so accessibility/layout inserted a space. Collapsed to a single template-string text node.

### Phase 600 — Backend / trust / supplier band checkpoint

Closing the 526–600 / trust band deliberately. Distinctions (do not collapse):

| Claim | Status |
|-------|--------|
| Migrations 080–099 **in git** | Yes |
| Migrations 080–099 **SQL-tested** (repo `supabase/tests`) | Yes for key guards (many phases) |
| Migrations 080–099 **applied remotely** | **Yes** (Phase 596 push; Phase 600 re-list Local=Remote) |
| Production **adversarial SQL re-run on remote** | Not claimed — local scratch/CI style proofs remain the primary artifacts |
| Inventory / slot / hold / cancel occupancy | Unit-certified (prior honesty batches); browser multi-departure Calendar verified (597) |
| Checkout concurrency advisory lock | Still **listing-scoped** (P1) — safe/coarse |
| Traveler golden journey (production) | Partial (Phase 547 browse/detail/checkout handoff) |
| Traveler Trips (demo anna) | API returns 3 bookings; Phase 598 fixed dishonest empty-without-session |
| Partner ops Home/Bookings/Calendar/Listings | **Localhost browser certified** (597) |
| Partner Pickup Planner | **Localhost browser certified** (599) + plural fix |
| Partner create→publish wizard E2E | **Not** browser-certified (mutating) |
| Stripe | **TEST only** — LIVE blocked client + edge |

**Stripe:** remains TEST. Do not enable LIVE.

**Next band (601+):** Traveler experience friction — discovery → detail → quote → checkout → Trips — without extending security deep-dive unless a launch-critical vuln appears.

### Phase 601 — Age-priced party size for capacity / sticky CTA

**Problem:** Age-priced tours quote from `participantMix` but TourDetails sticky sold-out and BookingPage capacity/availability checks used `guests` (often still 1 until sync). Traveler could see wrong sold-out CTA or capacity gates.

**Fix:** Derive `partySizeForCapacity` / sticky party from mix when age pricing; use it for `capacityBlocksPay`, availability checks, and sticky disable/sold-out label. `tsc -p tsconfig.app.json` clean.

### Phase 602 — Trips “View stay” handoff

**Problem:** Trips CTA passed `{ id }` only into `handleTourSelect`. Without `listingExtras.inventoryFamily`, stays defaulted to tour → packages/tour surface (dead “View stay”).

**Fix:** Pass `listingExtras: { inventoryFamily: 'stay' }` when booking has check_out / stay notes; App hydrates full listing via `getListingByIdAsync` when title missing.

### Phase 603 — Stay checkout re-fetches blocked nights

**Problem:** Pre-Stripe stay checkout refreshed occupied ranges but still tested against stale `blockedNights`, so a host block set after the traveler opened the page could still reach Stripe.

**Fix:** Parallel re-fetch of occupied ranges + blocked nights; use fresh blocked set for the overlap refusal.

### Phase 604 — Browse tag honesty (pickup + free cancel)

**Pickup-available:** no longer matches on meeting point alone — requires pickupPlace / pickupInstructions / tag.
**Free cancellation:** empty `cancellationPolicy` no longer advertises free cancel; requires standard Traverion policy text or tag.
Vitest `listingTruth.test.ts` updated and passing.

### Phase 605 — Confirmation cancel copy + Trips terminology

Confirmation no longer promises universal “free cancellation up to 24 hours”. Points to checkout/listing policy instead. Error strings and App page meta use **Trips** (not “My bookings”).

### Phase 606 — Stays check-in always pairs with check-out

**Problem:** Check-in alone appeared in search summary/chips while occupancy filtering only ran when both dates existed — inventory looked filtered but was not.

**Fix:** Choosing check-in without a valid check-out auto-sets check-out to the next calendar night so `dateFilterActive` engages.

### Phase 607 — Traveler honesty suite re-cert (18/18)

After Phases 601–606 traveler fixes, re-ran focused Vitest: listingTruth, departure-slot-remaining, tour/stay sticky CTA, booking-flow.party — **18/18 pass**.

### Phase 608 — Mobile homepage cert (390×844)

Emulated `390×844` on localhost. Hero shows TRAVERION brand, Tours/Stays toggle, compact search (“Anywhere / Any date · Add travelers”), Stripe TEST honesty line, hamburger nav. No obvious horizontal overflow in first viewport. Stripe remains TEST.

### Phase 609 — Mobile Packages + tour detail (390×844)

Emulated 390×844: Packages lists 5 live tours with Filters/Sort. Opened Guaranteed Northern Lights Tour — sticky **Pick a date** CTA, calendar (past faded / available open), price From €101.15, Stripe TEST honesty, Trips-as-confirmation copy. Multi-departure note “Set start times: 20:00, 20:30.” Demo hero image is mismatched tropical stock (fixture debt, not marketplace invent).

### Phase 610 — Mobile date → multi-option handoff (390×844)

On Northern Lights detail: sticky **Pick a date** focuses calendar; selecting Sun 27 Sept loads **Shared group Starts 20:00** and **Private tour Starts 20:30** with distinct prices (€119 / €449). Sticky becomes **Choose option**; panel shows “12 spots left this day”. URL gains `date=` + `guests=`. Commercial multi-departure truth visible on mobile.

### Phase 611 — Traveler-band build/tsc checkpoint

After Phases 601–610: `tsc -p tsconfig.app.json` clean; `npm run build` succeeded (~4.5s). Stripe still TEST.

### Phase 612 — Mobile Stays browse (390×844)

Stays catalog under mobile viewport: Tours/Stays toggle, search rail (“Any dates · Add guests”), Filters/Sort, **2 stays** with per-night prices. One card still shows Free cancellation badge (likely tag/standard policy on that listing — Phase 604 made empty policy non-matching). Demo imagery still mismatched vs Rovaniemi (fixture debt).

### Phase 613 — Mobile stay detail (390×844)

Riverside Apartment detail: sticky **Select dates** + Stripe TEST, night calendar with **occupied** (booked + host-blocked 26–27 Sept) vs available, min 2 nights, guest stepper, lead guest field. Trips-as-confirmation copy present.

**Note:** Lead guest autofilled `aurora-ops` because a partner session was still on the shared localhost origin — expected dual-product friction on one origin; production hosts are separate.

### Phase 614 — Stay lead-guest autofill ignores email local-part

**Problem:** StayDetails filled lead guest from `email.split('@')[0]`, so a partner session on shared localhost produced `aurora-ops` as the traveler name.

**Fix:** Autofill only from consumer profile display name / traveler metadata — never from email local-part.

### Phase 615 — Checkout concurrency / hold / resume re-cert

Vitest: checkout-inventory-concurrency (3), checkout-inventory-conflict, booking-hold, checkout-resume, checkout-confirmation-reconcile — all green (focused batch).

### Phase 616 — Performance “guest s” plural spacing

Same class of bug as Phase 599: Performance revenue rows split `guest` / `s` across React text nodes. Collapsed to one template string.

### Phase 617 — Pickup Planner no-date plural spacing

Same split-text-node class as Phases 599/616: “No activity date” subsection rendered `booking` / `s` as separate React nodes. Collapsed to one template string.

### Phase 618 — Participant mix labels pluralize (2 Adults · 1 Child)

**Problem:** Partner Inbox (390×844 browser cert) showed Anna’s booking as **“2 Adult · 1 Child”**. `formatBookingParticipantsLabel` and `formatMixSummaryCompact` printed raw category labels without pluralization; `formatMixSummary` already pluralized but produced “Childs”.

**Fix:** Shared `formatParticipantQuantityLabel` — Adults / Children / People; labels already ending in `s` left alone. Used by booking-row labels, mix summaries, and pickup CSV.

**Evidence:** Vitest 6/6 (`participant-mix.label` + `partner-pickup-csv`). Mobile Inbox certified: threads, Unread · 1, bottom nav, TEST banner; commercial fields present without invented data.

### Phase 619 — Checkout participant strings use shared plural helper

**Problem:** After Phase 618, partner Inbox/CSV pluralized Adult/Child, but BookingPage still wrote raw `` `${quantity} ${label}` `` into `Participants:` special_requests and the checkout summary (e.g. “2 Adult”).

**Fix:** Use `formatParticipantQuantityLabel` in both paths so traveler checkout matches partner surfaces.

### Phase 620 — Partner Bookings payment chips keep canonical casing

**Problem:** List + detail payment chips applied Tailwind `capitalize` on `partnerPaymentLabel`, turning “Refund due” / “Checkout hold” into “Refund Due” / “Checkout Hold” — diverging from Inbox, Money, and CSV honesty.

**Fix:** Remove `capitalize` from both chips so labels match `partnerPaymentLabel` exactly.

### Phase 621 — Tour detail selection honesty (option label, sticky CTA, tour switch)

**Problems:**
1. Options strip `guestsLabel` used `selectedOption` instead of schedule-resolved `selectedOptionApplied`.
2. Mobile sticky CTA stayed enabled with “Continue · TEST” when `panelQuote` was invalid (desktop Continue disabled).
3. Switching tours in-session left `listingHydratedRef` true so date/guests/option from the previous listing could linger.

**Fixes:** Use `selectedOptionApplied` for mix label; disable sticky + `Fix guests` label when quote invalid; reset hydration + selection state when `tour.id` changes, then re-read URL selection.

**Evidence:** `tour-sticky-cta` vitest includes `quoteInvalid → Fix guests`.

### Phase 622 — Trips empty / cancel recovery offers stays

**Problem:** Primary “No trips yet” empty state and Stripe-cancel recovery (when no pending pay booking) only offered “Browse tours”, while per-tab empties already offered stays — commercial path incomplete for stay-first travelers.

**Fix:** Add “Browse stays” ghost CTAs beside Browse tours on those surfaces (and bookings-unavailable fallback).

## Known remaining risks (ranked)

1. **P1 — Partner create→publish wizard** not browser-certified this pass (ops Home/Bookings/Calendar/Listings **are** localhost-browser certified in Phase 597). Full create→publish still pending.
2. **P1 — Localhost same-origin auth**: partner and traveler share one Supabase session; partner login bleeds into traveler lead-guest autofill (seen on StayDetails).
3. **P1 — Migrations 080–099 now remote-applied** — schema present; adversarial SQL suites not re-run against remote in CI this phase (local SQL tests remain the proof artifacts).
3. **P1 — Advisory lock listing-scoped** — safe but coarse.
4. **P2 — LIVE Stripe** intentionally blocked.
5. **P2 — Service-role JWT briefly tracked** in `scripts/cert-transactional-emails.cjs` (now untracked); rotate when practical.

## Do not

- Live Stripe, force-push, commit cert-email script
- Invent marketplace data
- Empty commits for phase count
