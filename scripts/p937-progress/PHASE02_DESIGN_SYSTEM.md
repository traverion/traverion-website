# P9.37 Phase 02 — Unified Premium Design System

| | |
|---|---|
| Status | **DONE** |
| Commit focus | Shared brand tokens, type stack unification |

## Changes
- Added `--tv-brand-*`, `--tv-font-*`, and `--tv-space-*` spacing scale on `:root`.
- Partner shell ink/accent soft tokens bridge to `--tv-brand-*`.
- Replaced residual Inter Display header nav with Plus Jakarta Sans.
- Updated `brandGuidelines.ts` to match production fonts (Plus Jakarta + Fraunces).

## Preserved (intentional product split)
- Traveler CTAs keep pill radius; partner ops keep soft `--partner-radius`.
- Partner accent `#073b83` slightly cooler than consumer `#003580` for operational chrome.
