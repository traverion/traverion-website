import SetNewPasswordForm from '../auth/SetNewPasswordForm';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import { PARTNER_LOGIN_PATH } from '../../lib/partnerPortalPaths';

export default function PartnerResetPasswordPage() {
  const mainSiteUrl = publicSiteBaseUrl();

  return (
    <div className="min-h-[100dvh] bg-paper text-ink flex flex-col">
      <header className="flex items-center justify-between px-5 sm:px-8 py-5">
        <a href={PARTNER_LOGIN_PATH} className="flex items-center gap-2.5 text-ink">
          <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain" />
          <span className="font-sans text-sm font-semibold tracking-[0.18em]">TRAVERION</span>
        </a>
        <a href={mainSiteUrl} className="lux-flat text-sm text-ink-muted hover:text-ink">
          Browse tours
        </a>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-5 pb-16">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">Traverion Partner</p>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl text-ink tracking-tight">Set a new password</h1>
        <p className="mt-2 text-sm text-ink-muted leading-relaxed mb-8">
          This page only works from the secure link in your reset email.
        </p>
        <SetNewPasswordForm
          minPasswordLength={8}
          description="Enter a new password for your partner account. When you are done, sign in to the supplier portal."
          onSuccess={() => {
            window.location.replace(PARTNER_LOGIN_PATH);
          }}
          loginHref={PARTNER_LOGIN_PATH}
          loginLabel="Back to partner log in"
          successHint="Sign in to the supplier portal with your new password."
        />
      </main>
    </div>
  );
}
