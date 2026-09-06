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
      { label: 'Contact', page: 'contact' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Sign in / Sign up', href: '/log-in?next=account' },
      { label: 'My account', page: 'account' },
      { label: 'Saved cart', page: 'cart' },
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
      title="Sitemap"
      subtitle="Every main page on Traverion — support, legal, company, and partner programs — in one place."
      onNavigate={onNavigate}
    >
      <p>
        Use the links below to jump to any section of the site. Supplier login opens the partner portal in the same
        window.
      </p>

      {SECTIONS.map(({ title, items }) => (
        <section key={title}>
          <h2>{title}</h2>
          <div className="space-y-2">
            {items.map((item) => (
              <p key={item.label} className="m-0">
                {item.page ? (
                  <button
                    type="button"
                    onClick={() => go(item.page!)}
                    className="lux-flat text-left text-ink underline underline-offset-2 decoration-black/25 hover:decoration-ink"
                  >
                    {item.label}
                  </button>
                ) : (
                  <a href={item.href}>{item.label}</a>
                )}
              </p>
            ))}
          </div>
        </section>
      ))}
    </LegalPageShell>
  );
}
