# P9.37 Phase 03 — Global Layout Architecture

| | |
|---|---|
| Status | **DONE** |

## Changes
- Root `html`/`body`: `overflow-x: clip` and `max-width: 100%` to stop horizontal page scroll.
- Partner main pane: `overflow-x: clip` (replaces hidden) with `min-width: 0` retained.
- Deduplicated 1440px partner gutter media query.
- `.tv-shell` keeps call-site gutters (`px-4 sm:px-6…`); only reinforces `min-width: 0` + `box-sizing`.
