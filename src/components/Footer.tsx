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
  'lux-flat text-left bg-transparent border-0 cursor-pointer text-sm text-[#C5D0E0] transition-colors duration-200 hover:text-white';

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
      <div className="tv-shell px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          <div className="col-span-2 md:col-span-1">
            <a href="/" className="relative mb-3 inline-flex items-center gap-2.5" aria-label="Traverion home">
              <span className="tv-footer-logo-glow" aria-hidden />
              <img src={BRAND_LOGO_SRC} alt="" className="relative h-10 w-auto object-contain" />
              <span className="relative font-sans text-lg font-semibold tracking-tight text-white">TRAVERION</span>
            </a>
            <p className="m-0 max-w-xs text-sm leading-relaxed text-[#C5D0E0]">
              Discover and book tours and stays from independent operators worldwide.
            </p>
          </div>

          {/* Support */}
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-tight text-white">Support</h3>
            <ul className="space-y-2">
              <li><button type="button" onClick={() => nav('contact')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Contact</button></li>
              <li><button type="button" onClick={() => nav('legal-notice')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Legal Notice</button></li>
              <li><button type="button" onClick={() => nav('privacy')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Privacy Policy</button></li>
              <li><button type="button" onClick={() => nav('cookies')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Cookies and marketing preferences</button></li>
              <li><button type="button" onClick={() => nav('terms')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>General Terms and Conditions</button></li>
              <li><button type="button" onClick={() => nav('sitemap')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Sitemap</button></li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-tight text-white">Company</h3>
            <ul className="space-y-2">
              <li><button type="button" onClick={() => nav('about')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>About Us</button></li>
              <li><button type="button" onClick={() => nav('packages')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Tours</button></li>
              <li><button type="button" onClick={() => nav('stays')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Stays</button></li>
              {/* Phase 1623: Trips beside Tours/Stays — match primary nav wayfinding. */}
              <li><button type="button" onClick={() => nav('cart')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Cart</button></li>
              <li><button type="button" onClick={() => nav('bookings')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Trips</button></li>
              {/* Phase 1664: Saved beside Trips — match primary nav wishlist wayfinding. */}
              <li><button type="button" onClick={() => nav('wishlist')} className={`${linkClass} text-left bg-transparent border-0 cursor-pointer`}>Saved</button></li>
            </ul>
          </div>

          {/* Want to work with us? */}
          <div>
            <h3 className="mb-3 text-sm font-semibold tracking-tight text-white">Work with us</h3>
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
              <li><a href={supplierPortalLandingHref()} className={linkClass}>Become a supplier</a></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar – copyright + social */}
      <div className="border-t border-white/10">
        <div className="tv-shell flex flex-col items-center justify-between gap-3 px-4 py-4 sm:flex-row sm:px-6 lg:px-8">
          <p className="text-center text-sm text-[#9AABC4] sm:text-left">
            © 2026 Traverion – Original from Finland
          </p>
          <div className="flex items-center gap-2">
            <a
              href="https://instagram.com/traverionco"
              target="_blank"
              rel="noopener noreferrer"
              className="lux-tap-target rounded-lg p-2 text-[#C5D0E0] transition-colors duration-200 hover:bg-white/10 hover:text-white"
              aria-label="Instagram"
            >
              <Instagram className="w-5 h-5" />
            </a>
            <a
              href="https://tiktok.com/@traverion.com"
              target="_blank"
              rel="noopener noreferrer"
              className="lux-tap-target rounded-lg p-2 text-[#C5D0E0] transition-colors duration-200 hover:bg-white/10 hover:text-white"
              aria-label="TikTok"
            >
              <TikTokIcon className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
