import LegalPageShell from '../components/LegalPageShell';
import { supplierPortalHref } from '../lib/partnerHost';

const partnerPortalLoginHref = supplierPortalHref('/login');

type SitemapLink = { label: string; page?: string; href?: string };

type SitemapSection = { title: string; items: SitemapLink[] };

const SECTIONS: SitemapSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Home', page: 'home' },
      { label: 'Tours', page: 'packages' },
      { label: 'Stays', page: 'stays' },
      { label: 'Trips', page: 'bookings' },
      { label: 'Contact', page: 'contact' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Sign in / Sign up', href: '/log-in?next=account' },
      { label: 'My account', page: 'account' },
      { label: 'Wishlist', page: 'wishlist' },
      { label: 'My bookings', page: 'bookings' },
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
      { label: 'Become a supplier', href: partnerPortalLoginHref },
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
      <div className="not-prose mb-8 rounded-2xl bg-finland/8 px-4 py-3 ring-1 ring-finland/15">
        <p className="text-sm text-ink leading-relaxed m-0">
          Jump to any section below. Supplier login opens the partner portal in the same window.
        </p>
      </div>

      <div className="not-prose grid gap-3 sm:grid-cols-2">
        {SECTIONS.map(({ title, items }) => (
          <section
            key={title}
            className="rounded-2xl bg-paper-raised p-4 sm:p-5 shadow-soft ring-1 ring-black/[0.06]"
          >
            <h2 className="font-display text-xl text-ink tracking-tight mb-3 mt-0">{title}</h2>
            <ul className="space-y-2 m-0 p-0 list-none">
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
