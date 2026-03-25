import { ArrowLeft, FileText } from 'lucide-react';
import LuxuryButton from '../components/ui/LuxuryButton';
import PageHero from '../components/PageHero';
import { HERO_IMG } from '../lib/heroImages';
import { navigateBackOrFallback } from '../lib/appRouting';

/** Matches supplier portal login path (see SupplierLayout). */
const SUPPLIER_LOGIN_HREF = '/supplier-log-in';

type SitemapLink = { label: string; page?: string; href?: string; external?: boolean };

type SitemapSection = { title: string; items: SitemapLink[] };

const SECTIONS: SitemapSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Home', page: 'home' },
      { label: 'Tours & activities', page: 'packages' },
      { label: 'Blog', page: 'blog' },
      { label: 'Contact', page: 'contact' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Sign in / Sign up', page: 'auth' },
      { label: 'My account', page: 'account' },
      { label: 'Cart', page: 'cart' },
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
    items: [
      { label: 'About Us', page: 'about' },
    ],
  },
  {
    title: 'Work with us',
    items: [
      { label: 'Become an affiliate', page: 'affiliate' },
      { label: 'Become a content creator', page: 'content-creator' },
      { label: 'Become a supplier', href: SUPPLIER_LOGIN_HREF },
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
    <div className="min-h-screen bg-gray-50 pt-20">
      <PageHero
        imageSrc={HERO_IMG.thailand}
        overlay="slateSoft"
        eyebrow="Navigation"
        title="Sitemap"
        subtitle="Every main page on Traverion — support, legal, company, and partner programs — in one place."
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <LuxuryButton
          variant="outline"
          onClick={() =>
            navigateBackOrFallback(() => {
              onNavigate?.('home');
            })
          }
          className="mb-8"
        >
          <ArrowLeft className="mr-2 w-4 h-4" />
          Back
        </LuxuryButton>

        <p className="text-gray-600 mb-8 max-w-2xl">
          Use the links below to jump to any section of the site. Supplier login opens the partner portal in
          the same window.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 lg:gap-8">
          {SECTIONS.map(({ title, items }) => (
            <div
              key={title}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:border-finland/20 transition-colors"
            >
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2 text-sm uppercase tracking-wide">
                <FileText className="w-4 h-4 text-finland" />
                {title}
              </h2>
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.label}>
                    {item.page ? (
                      <button
                        type="button"
                        onClick={() => go(item.page!)}
                        className="text-left text-finland hover:underline text-sm font-medium w-full py-1"
                      >
                        {item.label}
                      </button>
                    ) : (
                      <a
                        href={item.href}
                        className="text-finland hover:underline text-sm font-medium inline-block py-1"
                      >
                        {item.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
