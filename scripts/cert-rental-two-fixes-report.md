# Traverion Rentals — Final Two Release Fixes

**Date:** 2026-10-27  
**Baseline:** `origin/main` @ `a0804088`  
**Staging:** `gedktutbpfwnstcbffsc`  
**Production rental checkout:** still **OFF** (not enabled; gate 282 not lifted)

---

## Fixes

### 1. Photo persistence / counting

**Root cause:** Saves correctly split ordered slots into cover (`image`) + `galleryImageUrls`. Publish readiness counted gallery only, so 3 uploaded photos (1 cover + 2 gallery) looked like “2 photos” / “Add at least 3 photos.” Finish also raced `creatorComplete` via `setState` before `runSubmit` read `formRef`, and did not wait on in-flight uploads.

**Changes:**
- `listingPersistedPhotoCount` / publish gate counts cover + gallery
- Rental photo UI min = 3 (`RENTAL_PHOTO_MIN`); progress no longer demands a 4th tour photo
- Finish/Continue block while uploads are busy, with a clear recoverable message
- Finish syncs `creatorComplete` onto `formRef` before save

### 2. Partner listings card

**Root cause:** Card used tour `experienceKind` + `bookingOptions`, ignoring rental family/variants.

**Changes:**
- `partnerListingExperienceKind` / type label: **Rental**
- `partnerListingCommerceSummary`: €/day (or hour), option count, unit stock
- Tours/Stays keep existing bookingOptions / nightly paths

---

## Regression evidence (staging Partner `aurora-ops@…`)

Listing `ea1a4945-b4bd-4b8a-bcab-f065f5a06934` on Vite `127.0.0.1:5184` (CERT staging env):

| Check | Result |
| --- | --- |
| Photos after Finish | DB `image` + 2 gallery = **3**; UI “3/12 · Ready for publish”, Photos **Complete** |
| Draft resume / refresh | Resume edit shows Photo 1/2/3 of 3 (`cert-1.jpg`…`cert-3.jpg`) |
| Listings card | **Rental** · From **€45 / day** · **1 rental option · 4 units** · draft Ready — Rentals launches |
| Finish `creatorComplete` | **true** after Finish (was false before race fix) |
| Option pricing | Standard · 4 units · `pricePerDayMinor: 4500` unchanged |
| Unit tests | `listingPublishGate`, `partner-listings-filter`, `listingPhotoGrid`, rental creator/details — **pass** |

Tours/Stays commerce helpers covered by unit tests; this staging account had only the rental draft (no tour/stay rows to visually recheck).

---

## Production gates (unchanged)

- Do **not** set production `RENTAL_CHECKOUT_ENABLED`
- Do **not** lift publication gate 282
- Public traveler rental booking remains closed

---

## Owner approval request

Both confirmed defects are fixed and verified on staging Partner.

**Please give a separate explicit decision** before enabling production rental checkout or lifting gate 282.
