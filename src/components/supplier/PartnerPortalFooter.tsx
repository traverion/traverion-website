import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import {
  PARTNER_COOKIES_POLICY_PATH,
  PARTNER_LEGAL_NOTICE_PATH,
  PARTNER_LOGIN_PATH,
  PARTNER_PRIVACY_POLICY_PATH,
  PARTNER_SIGNUP_PATH,
  PARTNER_TERMS_OF_SERVICE_PATH,
} from '../../lib/partnerPortalPaths';
import { supplierPortalLandingHref } from '../../lib/partnerHost';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';

const linkClass =
  'lux-flat text-sm text-ink-muted hover:text-ink underline decoration-transparent underline-offset-2 hover:decoration-ink';

export default function PartnerPortalFooter() {
  const traveler = publicSiteBaseUrl();
  const landing = supplierPortalLandingHref();

  return (
    <footer className="mt-auto border-t border-black/[0.06] bg-paper text-ink">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <a href={landing} className="inline-flex items-center gap-2 mb-3" aria-label="Traverion Partner">
              <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-auto object-contain" />
              <span className="font-sans text-sm font-semibold tracking-[0.18em]">TRAVERION</span>
            </a>
            <p className="text-sm text-ink-muted leading-relaxed">
              The supplier product for tours and stays. Travelers book on traverion.com.
            </p>
          </div>
          <div>
            <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint mb-3">
              For partners
            </h3>
            <ul className="space-y-2">
              <li>
                <a href={landing} className={linkClass}>
                  Partner home
                </a>
              </li>
              <li>
                <a href={PARTNER_SIGNUP_PATH} className={linkClass}>
                  Get started
                </a>
              </li>
              <li>
                <a href={PARTNER_LOGIN_PATH} className={linkClass}>
                  Log in
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint mb-3">
              For travelers
            </h3>
            <ul className="space-y-2">
              <li>
                <a href={traveler} className={linkClass}>
                  Book tours
                </a>
              </li>
              <li>
                <a href={`${traveler}/packages`} className={linkClass}>
                  Tours
                </a>
              </li>
              <li>
                <a href={`${traveler}/stays`} className={linkClass}>
                  Stays
                </a>
              </li>
              <li>
                <a href={`${traveler}/contact`} className={linkClass}>
                  Traveler contact
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-faint mb-3">
              Company
            </h3>
            <ul className="space-y-2">
              <li>
                <a href="/contact" className={linkClass}>
                  Contact
                </a>
              </li>
              <li>
                <a href={PARTNER_PRIVACY_POLICY_PATH} className={linkClass}>
                  Privacy
                </a>
              </li>
              <li>
                <a href={PARTNER_TERMS_OF_SERVICE_PATH} className={linkClass}>
                  Terms
                </a>
              </li>
              <li>
                <a href={PARTNER_LEGAL_NOTICE_PATH} className={linkClass}>
                  Legal notice
                </a>
              </li>
              <li>
                <a href={PARTNER_COOKIES_POLICY_PATH} className={linkClass}>
                  Cookies
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="border-t border-black/[0.06] py-4 px-5 sm:px-8">
        <p className="text-center text-xs text-ink-faint">© 2026 Traverion – Original from Finland</p>
      </div>
    </footer>
  );
}
