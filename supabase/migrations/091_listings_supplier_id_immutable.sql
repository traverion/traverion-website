-- Defense-in-depth hardening for "Suppliers can update own listings"
-- (migration 001) -- NOT a fix for a currently-exploitable vulnerability.
--
-- Investigated whether a supplier could reassign their own listing's
-- supplier_id to a different user via a direct client UPDATE, since every
-- other RLS policy that scopes a supplier to "their" data (bookings,
-- supplier_earnings, supplier_ledger_entries, booking_messages) does so
-- via a LIVE join back to listings.supplier_id, not a snapshot -- so a
-- reassignment would, in principle, retroactively hand a listing's
-- booking history (and redirect future earnings) to whoever the new
-- supplier_id belongs to.
--
-- Proved this against a real Postgres 16 instance BEFORE writing any fix,
-- per this mission's standard: the original migration 001 policy --
--   create policy "Suppliers can update own listings" on public.listings
--     for update using (auth.uid() = supplier_id);
-- -- has no explicit WITH CHECK clause, but PostgreSQL's own documented
-- RLS semantics state that when an UPDATE policy omits WITH CHECK, the
-- USING expression is reused as the check against the resulting new row
-- too. Two independent scratch-database tests (a full multi-case
-- regression script and a minimal isolated repro) both confirmed the
-- reassignment attempt is already rejected today -- auth.uid() no longer
-- equals the NEW row's supplier_id after the attempted change, so the
-- implicit reused-USING check fails and the update has no effect. This
-- hypothesis, while a reasonable one to check given the recurring
-- "client-trusted value, no independent server-side re-check" bug class
-- found elsewhere this segment, does NOT hold here: the codebase was
-- already safe, and this migration does not close a real gap.
--
-- Shipping the explicit WITH CHECK anyway, as deliberate, documented
-- hardening: relying on an implicit, easy-to-misjudge Postgres default
-- (even this investigation's own working assumption, going in, was that
-- no restriction existed at all) is fragile. If anyone ever adds an
-- unrelated WITH CHECK clause to this same policy in the future -- for
-- example to gate some other column change -- doing so REPLACES the
-- implicit reused-USING behavior outright rather than adding to it,
-- which would silently reopen exactly this gap unless the new WITH CHECK
-- also happened to preserve the supplier_id invariant. Making it explicit
-- here removes that fragility and documents the invariant for whoever
-- touches this policy next. Every other column remains freely editable
-- by the owning supplier, unchanged.

drop policy if exists "Suppliers can update own listings" on public.listings;
create policy "Suppliers can update own listings"
  on public.listings for update
  using (auth.uid() = listings.supplier_id)
  with check (auth.uid() = listings.supplier_id);
