import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import {
  PARTNER_COOKIES_POLICY_PATH,
  PARTNER_LEGAL_NOTICE_PATH,
  PARTNER_PRIVACY_POLICY_PATH,
  PARTNER_TERMS_OF_SERVICE_PATH,
} from '../../lib/partnerPortalPaths';

const linkClass =
  'text-sm text-gray-400 hover:text-white transition-colors duration-300 ease-lux underline-offset-2 hover:underline decoration-gray-500';

/**
 * Compact footer for partner.traverion.com: partner-specific legal pages + link to traveler site.
 */
export default function PartnerPortalFooter() {
  const origin = publicSiteBaseUrl();

  return (
    <footer className="mt-auto border-t border-white/10 bg-[#0f172a] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white">Traverion partner portal</p>
            <p className="text-sm text-gray-400 mt-1 max-w-md">
              Listings and bookings for suppliers. Travelers book on the main site.
            </p>
          </div>
          <a
            href={origin}
            className="inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15 transition-colors duration-300 border border-white/10"
          >
            Browse traverion.com
          </a>
        </div>
        <nav
          className="mt-8 pt-6 border-t border-white/10 flex flex-wrap gap-x-5 gap-y-2"
          aria-label="Partner legal pages"
        >
          <a href="/contact" className={linkClass}>
            Contact
          </a>
          <a href={PARTNER_PRIVACY_POLICY_PATH} className={linkClass}>
            Privacy policy
          </a>
          <a href={PARTNER_TERMS_OF_SERVICE_PATH} className={linkClass}>
            Terms of service
          </a>
          <a href={PARTNER_LEGAL_NOTICE_PATH} className={linkClass}>
            Legal notice
          </a>
          <a href={PARTNER_COOKIES_POLICY_PATH} className={linkClass}>
            Cookies
          </a>
        </nav>
      </div>
      <div className="border-t border-white/10 py-4 px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs text-gray-500">© 2026 Traverion</p>
      </div>
    </footer>
  );
}
