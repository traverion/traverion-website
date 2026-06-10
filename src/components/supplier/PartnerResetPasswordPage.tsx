import { Globe, Lock } from 'lucide-react';
import SetNewPasswordForm from '../auth/SetNewPasswordForm';
import PartnerPortalFooter from './PartnerPortalFooter';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import { PARTNER_LOGIN_PATH } from '../../lib/partnerPortalPaths';

export default function PartnerResetPasswordPage() {
  const mainSiteUrl = publicSiteBaseUrl();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <a href={PARTNER_LOGIN_PATH} className="flex items-center gap-2 sm:gap-3 text-gray-900 min-w-0">
            <img src={BRAND_LOGO_SRC} alt="" className="h-11 w-11 sm:h-12 sm:w-12 object-contain flex-shrink-0" />
            <div className="min-w-0">
              <span className="font-semibold text-lg sm:text-xl text-finland tracking-tight block leading-tight">
                TRAVERION
              </span>
              <span className="hidden sm:block text-xs text-gray-600 font-light">Partner portal</span>
            </div>
          </a>
          <a
            href={mainSiteUrl}
            className="text-sm text-gray-600 hover:text-finland transition-colors whitespace-nowrap"
          >
            Back to main site
          </a>
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-10 sm:py-14">
        <div className="flex items-center gap-3 text-finland mb-6">
          <div className="w-12 h-12 rounded-xl bg-finland/10 flex items-center justify-center">
            <Globe className="w-6 h-6" />
          </div>
          <span className="font-semibold text-gray-900">Traverion for suppliers</span>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-lg overflow-hidden animate-fade-in-up">
          <div className="px-6 sm:px-8 pt-6 pb-4 border-b border-gray-100 bg-gradient-to-br from-slate-50/90 to-white">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-finland/10 flex items-center justify-center flex-shrink-0">
                <Lock className="w-5 h-5 text-finland" aria-hidden />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-gray-900">Set a new password</h1>
                <p className="text-sm text-gray-600 mt-1">Partner account on partner.traverion.com</p>
                <p className="text-xs text-gray-500 mt-2">
                  This page only works from the secure link in your reset email. Your session is verified before you can
                  choose a new password.
                </p>
              </div>
            </div>
          </div>
          <div className="px-6 sm:px-8 py-6">
            <SetNewPasswordForm
              minPasswordLength={8}
              description="Enter a new password for your partner account. When you are done, sign in to the supplier portal."
              onSuccess={() => {
                window.location.replace(PARTNER_LOGIN_PATH);
              }}
              loginHref={PARTNER_LOGIN_PATH}
              loginLabel="Back to partner sign in"
              successHint="Sign in to the supplier portal with your new password."
            />
          </div>
        </div>
      </main>

      <PartnerPortalFooter />
    </div>
  );
}
