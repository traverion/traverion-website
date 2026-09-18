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
    body: 'From first search to cancellation, we explain what applies — and we don’t invent email receipts when Trips is the confirmation of record.',
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

  return (
    <LegalPageShell
      eyebrow="Company"
      title="About Traverion"
      subtitle="A Finland-rooted marketplace for tours and stays — built for travelers who want clarity, and operators who need real tools."
      onNavigate={onNavigate}
    >
      <div className="mb-8 rounded-2xl bg-finland/8 px-4 py-3 sm:px-5 sm:py-4 ring-1 ring-finland/15">
        <p className="text-sm sm:text-base text-ink leading-relaxed m-0">
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
        <div className="grid gap-3 sm:grid-cols-2 not-prose">
          <div className="rounded-2xl bg-paper-raised p-4 sm:p-5 shadow-soft ring-1 ring-black/[0.06]">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-finland/10 text-finland">
              <Compass className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="font-sans text-base font-semibold text-ink mb-1.5">Travelers</h3>
            <p className="text-sm text-ink-muted leading-relaxed m-0 mb-4">
              Find a destination, understand the experience, choose an option and participants, pay on Stripe, and manage
              everything in Trips.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href="/packages" onClick={goTours} className="tv-btn-secondary text-sm">
                Browse tours
              </a>
              <a href="/stays" onClick={goStays} className="tv-btn-ghost text-sm">
                Browse stays
              </a>
            </div>
          </div>
          <div className="rounded-2xl bg-paper-raised p-4 sm:p-5 shadow-soft ring-1 ring-black/[0.06]">
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-finland/10 text-finland">
              <Building2 className="h-5 w-5" aria-hidden />
            </div>
            <h3 className="font-sans text-base font-semibold text-ink mb-1.5">Operators</h3>
            <p className="text-sm text-ink-muted leading-relaxed m-0 mb-4">
              Create tours and stays, set options and age pricing, publish availability, and run today’s departures from
              one partner portal.
            </p>
            <a href={supplierPortalLandingHref()} className="tv-btn-secondary text-sm inline-flex">
              Partner portal
            </a>
          </div>
        </div>
      </section>

      <section className="!mt-10">
        <h2 className="!mb-4">How we work</h2>
        <div className="grid gap-3 sm:grid-cols-3 not-prose">
          {VALUES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl bg-paper-raised p-4 sm:p-5 shadow-soft ring-1 ring-black/[0.06]"
            >
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-finland/10 text-finland">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="font-sans text-base font-semibold text-ink mb-1.5">{title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed m-0">{body}</p>
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
