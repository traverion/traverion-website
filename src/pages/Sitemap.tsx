import LegalPageShell from '../components/LegalPageShell';
import { supplierPortalLandingHref } from '../lib/partnerHost';
import { travelerLoginHref } from '../lib/travelerAuthLinks';

const partnerPortalHomeHref = supplierPortalLandingHref();

type SitemapLink = { label: string; page?: string; href?: string };

type SitemapSection = { title: string; items: SitemapLink[] };

const SECTIONS: SitemapSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Home', page: 'home' },
      { label: 'Tours', page: 'packages' },
      { label: 'Stays', page: 'stays' },
      // Phase 1642: label matches behavior — destination cards live on Home.
      { label: 'Destination guides', page: 'home' },
      { label: 'Trips', page: 'bookings' },
      { label: 'Saved', page: 'wishlist' },
      { label: 'Contact', page: 'contact' },
      { label: 'Stories', page: 'blog' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Sign in / Sign up', href: travelerLoginHref('account') },
      { label: 'My account', page: 'account' },
      { label: 'Saved', page: 'wishlist' },
      { label: 'Trips', page: 'bookings' },
    ],
  },
  {
    title: 'Legal & support',
    items: [
      { label: 'Legal notice', page: 'legal-notice' },
      { label: 'Privacy Policy', page: 'privacy' },
      { label: 'Cookies and marketing preferences', page: 'cookies' },
      { label: 'General Terms and Conditions', page: 'terms' },
    ],
  },
  {
    title: 'Company',
    items: [{ label: 'About Us', page: 'about' }],
  },
  {
    title: 'Work with us',
    items: [
      { label: 'Become an affiliate', page: 'affiliate' },
      { label: 'Become a content creator', page: 'content-creator' },
      { label: 'Partner portal (become a supplier)', href: partnerPortalHomeHref },
    ],
  },
];

type SitemapProps = {
  onNavigate?: (page: string) => void;
};

export default function Sitemap({ onNavigate }: SitemapProps) {
  const go = (page: string) => {
    if (onNavigate) onNavigate(page);
    else window.location.href = page === 'home' ? '/' : `/${page}`;
  };

  return (
    <LegalPageShell
      eyebrow="Explore"
      title="Sitemap"
      subtitle="Every main page on Traverion — support, legal, company, and partner programs — in one place."
      onNavigate={onNavigate}
    >
      <div className="not-prose mb-5 rounded-xl bg-finland/8 px-3.5 py-2.5 ring-1 ring-finland/15">
        <p className="text-sm text-ink leading-relaxed m-0">
          Jump to any section below. Destinations open Home, where live places from operators are listed. Partner
          portal opens the supplier marketing site on partner.traverion.com — not a traveler account page.
        </p>
      </div>

      <div className="not-prose grid gap-2 sm:grid-cols-2">
        {SECTIONS.map(({ title, items }) => (
          <section
            key={title}
            className="tv-card p-3.5 sm:p-4"
          >
            <h2 className="font-display text-lg text-ink tracking-tight mb-2 mt-0">{title}</h2>
            <ul className="space-y-1.5 m-0 p-0 list-none">
              {items.map((item) => (
                <li key={item.label}>
                  {item.page ? (
                    <button
                      type="button"
                      onClick={() => go(item.page!)}
                      className="lux-flat text-left text-sm font-medium text-finland hover:underline underline-offset-2"
                    >
                      {item.label}
                    </button>
                  ) : (
                    <a
                      href={item.href}
                      // Phase 1643: traveler auth links stay in the SPA when onNavigate is available.
                      onClick={(e) => {
                        if (!onNavigate || !item.href?.includes('log-in')) return;
                        e.preventDefault();
                        window.history.pushState({}, '', item.href);
                        onNavigate('auth');
                      }}
                      className="text-sm font-medium text-finland hover:underline underline-offset-2"
                    >
                      {item.label}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </LegalPageShell>
  );
}
