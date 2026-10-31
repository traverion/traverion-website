# Mission 05.1 — Rental reserved quantity display defect

## Symptom
Partner Rental Calendar header could show e.g. Sony A7 IV **Total 1 · Reserved 2 · Available 0** while day cells showed **0 free** across many dates even when bookings did not overlap.

## Root cause (display / RPC helper — not claim engine)
`public.rental_variant_reserved_quantity` (migration 284) and the windowless partner calendar call summed `quantity` for **every** hold overlapping the query window:

```sql
select coalesce(sum(h.quantity), 0) ... and h.starts_at < v_end and v_start < h.ends_at
```

When `p_starts_at` / `p_ends_at` are null, the window is `[-infinity, infinity)`. Sequential non-overlapping bookings (each qty 1) all match, so Reserved becomes 2 on stock 1.

The same sum pattern appears in client `reservedQuantityInWindow` when the window is a whole month — correct for **evaluating one requested interval**, incorrect as a calendar **headline** reserved total.

## Mission 05.1 fix (no reservation-engine change)
- Partner Rental Calendar header now uses client `maxConcurrentReservedQuantity` (sweep line) over holds loaded for the visible month.
- Claim / `evaluate_rental_availability` paths unchanged.
- Backend follow-up (optional): change `rental_variant_reserved_quantity` to return peak concurrent occupancy, or document that callers must pass a tight interval and never treat a wide-window sum as “units reserved today.”

## Related
Day cells already used `previewDayAvailability` with a single-day window; sequential same-day non-overlapping rentals remain fine. Overlapping same-day rentals correctly consume stock.
