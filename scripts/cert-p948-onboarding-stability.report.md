# P9.48 — P0 onboarding stability + responsive layout

| | |
|---|---|
| **Date** | 2026-11-19 |
| **Supplier** | EM Global Oy (`eced0f8c-…`) |
| **Connect account** | **`acct_1UdHT6C7oDQnLYSF` preserved** |
| **Money gates** | create / transfers / payouts remain **0** |
| **Deploy** | `710d4c5d` (Vercel success) |
| **Verdict** | **PASS** (authenticated production journey) |

---

## Root cause

Bidirectional sync between the unified shell phase and embedded wizard `draft.step`:

1. Parent passed a new inline `onUnifiedPhaseChange` every render.
2. Child `useEffect([draft.step, onUnifiedPhaseChange])` pushed phase upward on every run.
3. Parent URL/sidebar updated while draft step lagged (or fought back), producing:
   - flashing / blank main content
   - sidebar “Representative” with Bank account form still visible
   - URL vs content mismatches

Secondary: lazy `Suspense` around wizards caused a blank frame when switching business ↔ payout mounts.

---

## Fix

1. **Parent owns phase/URL** — stabilized `handlePayoutPhaseChange` / `handleBusinessPhaseChange`; `setPhaseAndUrl` no-ops when unchanged.
2. **Embedded wizards sync step downward only** — removed upward `draft.step → onUnifiedPhaseChange` effects.
3. **Intentional navigation only** notifies parent (`goTo` / Continue / Back / finish → status).
4. **`useLayoutEffect`** aligns draft step before paint; `displayStep` covers first-frame safety.
5. **Eager wizard imports** — no Suspense blank between phases.
6. **Layout** — content canvas up to ~72–80rem; rail ~248px; two-column bank fields; status grid 2-col from tablet.

---

## Production browser certification (EM Global)

| Check | Result |
|---|---|
| Company ↔ Documents ↔ Representative ↔ Payouts ↔ Status | **PASS** (phase, h1, Continue aligned) |
| Direct URL `?phase=payout` / `representative` / `status` | **PASS** |
| Refresh on payout | **PASS** |
| Stripe return `?phase=status&connect=return` | **PASS** → cleans URL, CTA Continue verification |
| Desktop 1440 | canvas ~1112px, no H-overflow, Continue visible |
| Tablet 768 | rail hidden, content present, no H-overflow |
| Mobile 390 | rail hidden, chips + footer, no H-overflow |
| Connect account unchanged | **`acct_1UdHT6C7oDQnLYSF`** |
| Financial gates | all **0** |

Screenshots: `scripts/p948-screenshots/` (`before-payout-narrow.png`, `after-desktop-1440-payout.png`, `after-mobile-390-payout.png`).

---

## Remaining (non-blocking)

- Progress copy “4 of 4 complete” vs 5 sidebar steps is a labeling quirk (requirements vs phases), not a blank-screen bug.
- Stripe KYC for EM Global still outstanding (`restricted`) — separate from this stability mission.
