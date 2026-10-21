import { Shield, MapPin, HeartHandshake, Compass, Building2 } from 'lucide-react';
import LegalPageShell from '../components/LegalPageShell';
import NoticeCallout from '../components/NoticeCallout';
import { supplierPortalLandingHref } from '../lib/partnerHost';

type AboutProps = {
  onNavigate?: (page: string) => void;
};

const VALUES = [
  {
    icon: Shield,
    title: 'Clear booking truth',
    body: 'Options, participants, prices, and policies stay the same from product page through Trips and the operator’s bookings list.',
  },
  {
    icon: MapPin,
    title: 'Local operators',
    body: 'You book the people who run the day — not a generic reseller inventing inventory.',
  },
  {
    icon: HeartHandshake,
    title: 'Calm support',
    body: 'From first search to cancellation, we explain what applies — and Trips keeps your confirmed bookings in one place.',
  },
] as const;

export default function About({ onNavigate }: AboutProps) {
  const goContact = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('contact');
    }
  };

  const goTours = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('packages');
    }
  };

  const goStays = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('stays');
    }
  };

  const goTrips = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('bookings');
    }
  };

  const goSaved = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('wishlist');
    }
  };

  return (
    <LegalPageShell
      layout="marketing"
      eyebrow="Company"
      title="About Traverion"
      subtitle="A Finland-rooted marketplace for tours and stays — built for travelers who want clarity, and operators who need real tools."
      onNavigate={onNavigate}
    >
      <div className="not-prose mb-6 rounded-2xl border border-black/[0.06] bg-white px-5 py-5 sm:px-6 sm:py-6">
        <p className="m-0 text-[15px] leading-relaxed text-ink">
          Traverion connects travelers with independent operators. Tours and stays are separate products with their own
          calendars, options, and rules — so a departure never pretends to be a night, and a stay never inherits tour
          fields.
        </p>
      </div>

      <p>
        We started in Finland, and that shapes how we build: honest pricing, visible policies, and interfaces that feel
        finished — not like a pile of forms. Our goal is a global marketplace that still feels personal enough for a
        family-run tour company and clear enough for someone booking on a phone in another country.
      </p>

      <section className="!mt-10">
        <h2 className="!mb-4">Who Traverion is for</h2>
        <div className="not-prose grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-black/[0.06] bg-white p-5">
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-finland/10 text-finland">
              <Compass className="h-4 w-4" aria-hidden />
            </div>
            <h3 className="mb-1.5 font-sans text-[15px] font-semibold text-ink">Travelers</h3>
            <p className="m-0 mb-4 text-[14px] leading-relaxed text-ink-muted">
              Find a destination, understand the experience, choose an option and participants, pay to confirm, and
              manage everything in Trips.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href="/packages" onClick={goTours} className="tv-btn-secondary text-sm">
                Browse tours
              </a>
              <a href="/stays" onClick={goStays} className="tv-btn-ghost text-sm">
                Browse stays
              </a>
              {/* Phase 1624: Trips entry next to browse — matches footer/nav wayfinding. */}
              <a href="/bookings" onClick={goTrips} className="tv-btn-ghost text-sm">
                Your trips
              </a>
              {/* Phase 1675: Saved beside Trips — Footer 1664 / primary-nav parity. */}
              <a href="/wishlist" onClick={goSaved} className="tv-btn-ghost text-sm">
                Saved
              </a>
            </div>
          </div>
          <div className="rounded-xl border border-black/[0.06] bg-white p-5">
            <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-finland/10 text-finland">
              <Building2 className="h-4 w-4" aria-hidden />
            </div>
            <h3 className="mb-1.5 font-sans text-[15px] font-semibold text-ink">Operators</h3>
            <p className="m-0 mb-4 text-[14px] leading-relaxed text-ink-muted">
              Create tours and stays, set options and age pricing, publish availability, and run today’s departures from
              one partner portal.
            </p>
            <a href={supplierPortalLandingHref()} className="tv-btn-secondary inline-flex text-sm">
              Partner portal
            </a>
          </div>
        </div>
      </section>

      <section className="!mt-10">
        <h2 className="!mb-4">How we work</h2>
        <div className="not-prose grid gap-3 sm:grid-cols-3">
          {VALUES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-black/[0.06] bg-white p-5">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-finland/10 text-finland">
                <Icon className="h-4 w-4" aria-hidden />
              </div>
              <h3 className="mb-1.5 font-sans text-[15px] font-semibold text-ink">{title}</h3>
              <p className="m-0 text-[14px] leading-relaxed text-ink-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <p>
        Whether you are planning a week of tours in one city or a stay that anchors a longer trip, Traverion is built so
        you always know what you are selecting — and so operators always see the same truth on their side.
      </p>

      <div className="not-prose mt-8">
        <NoticeCallout
          title="Questions or partnerships"
          tone="info"
          action={
            <a href="/contact" onClick={goContact} className="tv-btn-primary inline-flex text-sm">
              Contact us
            </a>
          }
        >
          For media, supplier opportunities, or anything else — we read every message on Contact.
        </NoticeCallout>
      </div>
    </LegalPageShell>
  );
}
