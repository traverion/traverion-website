import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import {
  PARTNER_COOKIES_POLICY_PATH,
  PARTNER_LEGAL_NOTICE_PATH,
  PARTNER_PRIVACY_POLICY_PATH,
  PARTNER_TERMS_OF_SERVICE_PATH,
} from '../../lib/partnerPortalPaths';

const linkClass =
  'lux-flat text-sm text-ink-muted hover:text-ink underline decoration-transparent underline-offset-2 hover:decoration-ink';

/**
 * Compact footer for partner.traverion.com: partner-specific legal pages + link to traveler site.
 */
export default function PartnerPortalFooter() {
  const origin = publicSiteBaseUrl();

  return (
    <footer className="mt-auto border-t border-black/[0.06] bg-paper text-ink">
      <div className="max-w-3xl mx-auto px-5 sm:px-6 py-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
              Traverion Partner
            </p>
            <p className="text-sm text-ink-muted mt-2 max-w-md leading-relaxed">
              Listings and bookings for suppliers. Travelers book on the main site.
            </p>
          </div>
          <a href={origin} className="tv-btn-secondary inline-flex justify-center shrink-0">
            Browse tours
          </a>
        </div>
        <nav className="mt-8 flex flex-wrap gap-x-5 gap-y-2" aria-label="Partner legal pages">
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
      <div className="border-t border-black/[0.06] py-4 px-5 sm:px-6">
        <p className="text-center text-xs text-ink-faint">© 2026 Traverion – Original from Finland</p>
      </div>
    </footer>
  );
}
