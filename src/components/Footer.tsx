import { Instagram } from 'lucide-react';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import { supplierPortalLandingHref } from '../lib/partnerHost';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';

/** TikTok logo (Lucide has no brand icon). */
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
}

const linkClass =
  'lux-flat text-left bg-transparent border-0 cursor-pointer text-[13px] leading-snug text-[#C5D0E0] transition-colors duration-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[#071A3A] rounded';

/** Footer: Support, Company, Work With Us — partner login is on partner.traverion.com/login when live. */
export default function Footer({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const travelerSite = publicSiteBaseUrl();
  const affiliateUrl = `${travelerSite}/affiliate`;
  const contentCreatorUrl = `${travelerSite}/content-creator`;

  const nav = (page: string) => {
    if (onNavigate) {
      onNavigate(page);
    } else {
      window.location.href = page === 'home' ? '/' : `/${page}`;
    }
  };

  return (
    <footer className="bg-[#071A3A] text-white">
      <div className="tv-shell px-4 sm:px-6 lg:px-8 py-9 sm:py-11">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-10 lg:gap-12">
          <div className="col-span-2 md:col-span-1">
            <a
              href="/"
              className="relative mb-3 inline-flex items-center gap-2.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label="Traverion home"
            >
              <span className="tv-footer-logo-glow" aria-hidden />
              <img src={BRAND_LOGO_SRC} alt="" className="relative h-9 w-auto object-contain sm:h-10" />
              <span className="relative font-sans text-base font-semibold tracking-tight text-white sm:text-lg">
                Traverion
              </span>
            </a>
            <p className="m-0 max-w-[16rem] text-[13px] leading-relaxed text-[#C5D0E0]">
              Discover and book tours, stays, and rentals from independent operators worldwide.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-white">Support</h3>
            <ul className="space-y-2">
              <li>
                <button type="button" onClick={() => nav('contact')} className={linkClass}>
                  Contact
                </button>
              </li>
              <li>
                <button type="button" onClick={() => nav('legal-notice')} className={linkClass}>
                  Legal Notice
                </button>
              </li>
              <li>
                <button type="button" onClick={() => nav('privacy')} className={linkClass}>
                  Privacy Policy
                </button>
              </li>
              <li>
                <button type="button" onClick={() => nav('cookies')} className={linkClass}>
                  Cookies and marketing preferences
                </button>
              </li>
              <li>
                <button type="button" onClick={() => nav('terms')} className={linkClass}>
                  General Terms and Conditions
                </button>
              </li>
              <li>
                <button type="button" onClick={() => nav('sitemap')} className={linkClass}>
                  Sitemap
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-white">Company</h3>
            <ul className="space-y-2">
              <li>
                <button type="button" onClick={() => nav('about')} className={linkClass}>
                  About Us
                </button>
              </li>
              <li>
                <button type="button" onClick={() => nav('packages')} className={linkClass}>
                  Tours
                </button>
              </li>
              <li>
                <button type="button" onClick={() => nav('stays')} className={linkClass}>
                  Stays
                </button>
              </li>
              <li>
                <button type="button" onClick={() => nav('rentals')} className={linkClass}>
                  Rentals
                </button>
              </li>
              <li>
                <button type="button" onClick={() => nav('cart')} className={linkClass}>
                  Cart
                </button>
              </li>
              {/* Phase 1623: My bookings beside Tours/Stays — match primary nav wayfinding. */}
              <li>
                <button type="button" onClick={() => nav('bookings')} className={linkClass}>
                  My bookings
                </button>
              </li>
              {/* Phase 1664: Saved beside My bookings — match primary nav wishlist wayfinding. */}
              <li>
                <button type="button" onClick={() => nav('wishlist')} className={linkClass}>
                  Saved
                </button>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-[13px] font-semibold tracking-tight text-white">Work with us</h3>
            <ul className="space-y-2">
              <li>
                <a href={affiliateUrl} className={linkClass}>
                  Become an affiliate
                </a>
              </li>
              <li>
                <a href={contentCreatorUrl} className={linkClass}>
                  Become a content creator
                </a>
              </li>
              <li>
                <a href={supplierPortalLandingHref()} className={linkClass}>
                  Become a supplier
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="tv-shell flex flex-col items-center justify-between gap-3 px-4 py-3.5 sm:flex-row sm:px-6 lg:px-8">
          <p className="text-center text-[12px] text-[#9AABC4] sm:text-left">
            © 2026 Traverion – Original from Finland
          </p>
          <div className="flex items-center gap-1.5">
            <a
              href="https://instagram.com/traverionco"
              target="_blank"
              rel="noopener noreferrer"
              className="lux-tap-target rounded-lg p-2 text-[#C5D0E0] transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label="Instagram"
            >
              <Instagram className="h-5 w-5" />
            </a>
            <a
              href="https://tiktok.com/@traverion.com"
              target="_blank"
              rel="noopener noreferrer"
              className="lux-tap-target rounded-lg p-2 text-[#C5D0E0] transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              aria-label="TikTok"
            >
              <TikTokIcon className="h-5 w-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
