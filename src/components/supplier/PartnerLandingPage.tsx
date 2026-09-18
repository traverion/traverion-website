/**
 * Partner marketing landing — distinct from /login and /signup.
 */
import { BedDouble, CalendarDays, Compass, CreditCard, MapPin, Store } from 'lucide-react';
import { useEffect } from 'react';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import { HERO_IMG } from '../../lib/heroImages';
import { PARTNER_LOGIN_PATH, PARTNER_SIGNUP_PATH } from '../../lib/partnerPortalPaths';
import { supplierPortalLandingHref } from '../../lib/partnerHost';
import { PARTNER_LANDING_LIST_NOTE, PARTNER_LANDING_GET_PAID_NOTE, PARTNER_LANDING_HOW_PUBLISH_NOTE } from '../../lib/booking-confirmation-copy';
import PartnerPortalFooter from './PartnerPortalFooter';
import SkipLink from '../SkipLink';
import { setPageMetaWithOg } from '../../lib/seo';

const CAPABILITIES = [
  {
    eyebrow: 'List',
    icon: Store,
    body: PARTNER_LANDING_LIST_NOTE,
  },
  {
    eyebrow: 'Operate',
    icon: CalendarDays,
    body: 'Today, calendar, and bookings show who is coming, what they bought, and whether they paid. Pickup sits next to the booking — not in a separate app.',
  },
  {
    eyebrow: 'Sell',
    icon: MapPin,
    body: 'Travelers find you on Traverion. They compare dates, understand the product, and pay — you do not rebuild a shopfront.',
  },
  {
    eyebrow: 'Get paid',
    icon: CreditCard,
    body: PARTNER_LANDING_GET_PAID_NOTE,
  },
] as const;

export default function PartnerLandingPage() {
  const traveler = publicSiteBaseUrl();

  useEffect(() => {
    setPageMetaWithOg(
      'Partner',
      'Sell tours and stays on Traverion. List products, run the day, and get paid with Stripe.'
    );
  }, []);

  return (
    <div className="min-h-[100dvh] bg-paper text-ink flex flex-col">
      <SkipLink />
      <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-paper-raised/95 backdrop-blur-md shadow-soft">
        <div className="flex items-center justify-between px-5 sm:px-8 py-3.5">
          <a href={supplierPortalLandingHref()} className="flex items-center gap-2.5 no-lux-interaction" aria-label="Traverion Partner">
            <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain" />
            <span className="flex flex-col leading-tight">
              <span className="font-sans text-sm font-semibold tracking-[0.18em]">TRAVERION</span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-finland">For business</span>
            </span>
          </a>
          <nav className="flex items-center gap-2 sm:gap-3">
            <a href={traveler} className="lux-flat hidden sm:inline rounded-full px-3 py-1.5 text-sm text-ink-muted hover:bg-finland/10 hover:text-finland">
              For travelers
            </a>
            <a href={PARTNER_LOGIN_PATH} className="tv-btn-ghost text-sm">
              Log in
            </a>
            <a href={PARTNER_SIGNUP_PATH} className="tv-btn-primary h-10 px-5 text-sm">
              Get started
            </a>
          </nav>
        </div>
      </header>

      <section className="relative text-white min-h-[78dvh] flex flex-col justify-end overflow-hidden">
        <div className="absolute inset-0" aria-hidden>
          <img src={HERO_IMG.vacation} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-black/25" />
        </div>
        <div className="relative z-10 w-full max-w-5xl mx-auto px-5 sm:px-8 pb-12 sm:pb-16">
          <div className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white ring-1 ring-white/25 mb-4 backdrop-blur-sm">
            Traverion Partner
          </div>
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
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight mb-3">What Traverion does</h2>
          <p className="text-ink-muted max-w-xl mb-10 leading-relaxed">
            One partner product for listing, day-of ops, marketplace sales, and payouts.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CAPABILITIES.map(({ eyebrow, icon: Icon, body }) => (
              <div
                key={eyebrow}
                className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]"
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-finland/10 text-finland">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint mb-2">{eyebrow}</p>
                <p className="text-base text-ink leading-relaxed m-0">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-y border-black/[0.06] bg-finland/[0.04]">
          <div className="max-w-5xl mx-auto px-5 sm:px-8 py-16 sm:py-20 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-finland/10 text-finland">
                <Compass className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="font-display text-2xl sm:text-3xl tracking-tight mb-3">Tours</h2>
              <p className="text-ink-muted leading-relaxed m-0">
                Day tours and activities with dates, guest capacity, Adult/Child prices inside each option, meeting or pickup, and a live traveler page.
              </p>
            </div>
            <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-finland/10 text-finland">
                <BedDouble className="h-5 w-5" aria-hidden />
              </div>
              <h2 className="font-display text-2xl sm:text-3xl tracking-tight mb-3">Stays</h2>
              <p className="text-ink-muted leading-relaxed m-0">
                Apartments and rooms with nights, guest capacity, and house rules — a different listing type from Tours, not a renamed tour.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-finland/8 p-5 sm:p-6 ring-1 ring-finland/15">
              <h2 className="font-display text-2xl sm:text-3xl tracking-tight mb-3">Money, plainly</h2>
              <p className="text-ink-muted leading-relaxed m-0">{PARTNER_LANDING_GET_PAID_NOTE}</p>
            </div>
            <div className="rounded-2xl bg-paper-raised p-5 sm:p-6 shadow-soft ring-1 ring-black/[0.06]">
              <h2 className="font-display text-2xl sm:text-3xl tracking-tight mb-3">A business product</h2>
              <p className="text-ink-muted leading-relaxed m-0">
                Listings, calendar, bookings, and payout details live in one partner account. Travelers never see this.
                Partners never land in a traveler trip inbox by accident.
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight mb-3">How it works</h2>
          <p className="text-ink-muted max-w-xl mb-8 leading-relaxed">Three steps from account to live listing.</p>
          <ol className="grid gap-3 sm:grid-cols-3 list-none m-0 p-0">
            {[
              'Create a partner account with your work email.',
              'Add the business details travelers and payouts need.',
              PARTNER_LANDING_HOW_PUBLISH_NOTE,
            ].map((text, i) => (
              <li
                key={i}
                className="rounded-2xl bg-paper-raised p-5 shadow-soft ring-1 ring-black/[0.06]"
              >
                <span className="font-display text-2xl text-finland tabular-nums">{i + 1}</span>
                <p className="mt-3 text-sm text-ink leading-relaxed m-0">{text}</p>
              </li>
            ))}
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
