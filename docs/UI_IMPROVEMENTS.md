# UI & UX improvement ideas

Quick list of what could be applied next (fonts, animations, pages).

---

## Done

- **Head banner:** Slim trust line (“Free cancellation on most tours · Best price guarantee”) + language only; contact moved to footer/nav.

---

## Fonts

- **Current:** Open Sans everywhere – safe but generic.
- **Suggestions:**
  - **Display / logo:** One of: Plus Jakarta Sans (600–700), Outfit, or DM Serif Display for “TRAVERION” to add character.
  - **Body:** Keep Open Sans or switch to **Plus Jakarta Sans** / **Source Sans 3** for a slightly more modern look.
- **Implementation:** Add a second Google Font in `index.html`, then in `index.css` use it for `.font-display` or a new `.font-brand` class and apply that to the logo and main headings.

---

## Animations

- **Already in use:** `fade-in`, `scale-in`, stagger on cards, hover transitions.
- **Optional adds:**
  - **Header:** Slight slide-down or fade when the page loads (e.g. `animate-[fade-in_0.3s_ease-out]` on the bar – already on top bar).
  - **Listing cards:** Subtle `hover:shadow-lg hover:-translate-y-0.5` for a small lift.
  - **Buttons (primary):** Light `active:scale-[0.98]` for press feedback.
  - **Page transitions:** If you add a router later, a short fade between routes.

---

## Pages & structure

- **Promo bar (Section 3):** The “Popular / Best-selling tours” bar under the main nav could be made collapsible on scroll or merged into the hero on the home page so the header feels lighter.
- **Footer:** Contact (email, phone, hours) is in the footer; ensure “Contact” in nav is obvious for help.
- **Account / profile:** After consumer login, consider a simple “Account” or “My bookings” page (dropdown link in header).
- **Supplier vs consumer:** Keep supplier area at `/supplier`; main site stays focused on browsing and booking.

---

## Head banner (reference)

The top bar now has:

- **Left:** One short trust line (translatable), hidden on very small screens.
- **Right:** Language selector (EN / FI) only.
- **Style:** Slim (`py-1.5`), same finland blue, light font, subtle fade-in.
- Contact details live in the footer and in the main “Contact” nav item.

If you want a rotating promo line or “Need help? Contact us” in the top bar later, add a second string to `topBanner` in translations and alternate or show conditionally.
