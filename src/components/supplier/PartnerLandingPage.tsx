/**
 * Partner marketing landing — distinct from /login and /signup.
 */
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import { HERO_IMG } from '../../lib/heroImages';
import { PARTNER_LOGIN_PATH, PARTNER_SIGNUP_PATH } from '../../lib/partnerPortalPaths';
import { supplierPortalLandingHref } from '../../lib/partnerHost';
import { PARTNER_LANDING_LIST_NOTE } from '../../lib/booking-confirmation-copy';
import PartnerPortalFooter from './PartnerPortalFooter';
import SkipLink from '../SkipLink';

export default function PartnerLandingPage() {
  const traveler = publicSiteBaseUrl();

  return (
    <div className="min-h-[100dvh] bg-paper text-ink flex flex-col">
      <SkipLink />
      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 py-5">
        <a href={supplierPortalLandingHref()} className="flex items-center gap-2.5 no-lux-interaction" aria-label="Traverion Partner">
          <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain" />
          <span className="font-sans text-sm font-semibold tracking-[0.18em]">TRAVERION</span>
        </a>
        <nav className="flex items-center gap-2 sm:gap-3">
          <a href={traveler} className="lux-flat hidden sm:inline text-sm text-ink-muted hover:text-ink">
            For travelers
          </a>
          <a href={PARTNER_LOGIN_PATH} className="tv-btn-ghost text-sm">
            Log in
          </a>
          <a href={PARTNER_SIGNUP_PATH} className="tv-btn-primary h-10 px-5 text-sm">
            Get started
          </a>
        </nav>
      </header>

      <section className="relative text-white min-h-[78dvh] flex flex-col justify-end overflow-hidden">
        <div className="absolute inset-0" aria-hidden>
          <img src={HERO_IMG.vacation} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-black/25" />
        </div>
        <div className="relative z-10 w-full max-w-5xl mx-auto px-5 sm:px-8 pb-12 sm:pb-16">
          <p className="text-xs uppercase tracking-[0.22em] text-white/70 mb-4">Traverion Partner</p>
          <h1 className="font-display text-[2.35rem] sm:text-5xl lg:text-6xl leading-[1.05] max-w-2xl mb-5">
            Sell your travel products.
            <br />
            Run the operation.
          </h1>
          <p className="text-base sm:text-lg text-white/85 max-w-xl mb-8 leading-relaxed">
            Publish tours and stays, take bookings, and see who is coming — without an admin maze.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <a href={PARTNER_SIGNUP_PATH} className="h-12 px-7 rounded-full bg-white text-ink font-semibold inline-flex items-center justify-center hover:bg-paper">
              Get started
            </a>
            <a
              href={PARTNER_LOGIN_PATH}
              className="lux-flat h-12 px-7 rounded-full border border-white/40 text-white font-semibold inline-flex items-center justify-center hover:bg-white/10"
            >
              Log in
            </a>
          </div>
        </div>
      </section>

      <main id="main-content" className="flex-1">
        <section className="max-w-5xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight mb-10">What Traverion does</h2>
          <div className="space-y-10 max-w-2xl">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">List</p>
              <p className="text-lg text-ink leading-relaxed">
                {PARTNER_LANDING_LIST_NOTE}
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Operate</p>
              <p className="text-lg text-ink leading-relaxed">
                Today, calendar, and bookings show who is coming, what they bought, and whether they paid. Pickup sits next to the booking — not in a separate app.
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Sell</p>
              <p className="text-lg text-ink leading-relaxed">
                Travelers find you on Traverion. They compare dates, understand the product, and pay — you do not rebuild a shopfront.
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">Get paid</p>
              <p className="text-lg text-ink leading-relaxed">
                Travelers pay with Stripe. Money shows pending and paid as they actually are — never a fake payout date.
              </p>
            </div>
          </div>
        </section>

        <section className="border-y border-black/[0.06] bg-paper-raised">
          <div className="max-w-5xl mx-auto px-5 sm:px-8 py-16 sm:py-20 grid gap-12 md:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl tracking-tight mb-4">Tours</h2>
              <p className="text-ink-muted leading-relaxed">
                Day tours and activities with dates, guest capacity, adult and child options, meeting or pickup, and a live traveler page.
              </p>
            </div>
            <div>
              <h2 className="font-display text-3xl tracking-tight mb-4">Stays</h2>
              <p className="text-ink-muted leading-relaxed">
                Apartments and rooms with nights, guest capacity, and house rules — a different listing type from Tours, not a renamed tour.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight mb-4">Money, plainly</h2>
          <p className="text-ink-muted leading-relaxed max-w-2xl mb-8">
            Travelers pay with Stripe. Pending and paid are real ledger states. Payouts are reviewed by Traverion — there is no invented transfer date.
          </p>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight mb-4">A business product</h2>
          <p className="text-ink-muted leading-relaxed max-w-2xl">
            Listings, calendar, bookings, and payout details live in one partner account. Travelers never see this. Partners never land in a traveler trip inbox by accident.
          </p>
        </section>

        <section className="max-w-5xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight mb-8">How it works</h2>
          <ol className="space-y-6 max-w-xl text-ink">
            <li className="flex gap-4">
              <span className="font-display text-2xl text-finland w-8 shrink-0">1</span>
              <p className="pt-1 leading-relaxed">Create a partner account with your work email.</p>
            </li>
            <li className="flex gap-4">
              <span className="font-display text-2xl text-finland w-8 shrink-0">2</span>
              <p className="pt-1 leading-relaxed">Add the business details travelers and payouts need.</p>
            </li>
            <li className="flex gap-4">
              <span className="font-display text-2xl text-finland w-8 shrink-0">3</span>
              <p className="pt-1 leading-relaxed">Publish a tour or stay. Travelers book on traverion.com.</p>
            </li>
          </ol>
          <a href={PARTNER_SIGNUP_PATH} className="tv-btn-primary mt-10 inline-flex">
            Get started
          </a>
        </section>
      </main>

      <PartnerPortalFooter />
    </div>
  );
}
