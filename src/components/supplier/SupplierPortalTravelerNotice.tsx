import { useState } from 'react';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { supplierPortalHref } from '../../lib/partnerHost';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';

type Props = {
  email: string | null;
  onSignOut: () => Promise<void>;
};

/**
 * Shown when a signed-in **traveler** (no `supplier_profiles` row) opens partner URLs.
 *
 * Links must use the **traveler** site origin: on partner.traverion.com, `/` and `/packages` are not
 * in the partner SPA allowlist and get normalized to `/login`, so relative links would appear broken.
 */
export default function SupplierPortalTravelerNotice({ email, onSignOut }: Props) {
  const [signingOut, setSigningOut] = useState(false);
  const travelerSite = publicSiteBaseUrl();
  const travelerHome = `${travelerSite}/`;
  const travelerPackages = `${travelerSite}/packages`;

  const handleSignOut = () => {
    setSigningOut(true);
    void (async () => {
      try {
        await onSignOut();
        window.location.assign(supplierPortalHref('/login'));
      } finally {
        setSigningOut(false);
      }
    })();
  };

  return (
    <div className="min-h-[100dvh] bg-paper text-ink flex flex-col">
      <header className="px-5 sm:px-8 py-5 flex items-center">
        <a href={travelerHome} className="flex items-center gap-2.5 text-ink">
          <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain" />
          <span className="font-sans text-sm font-semibold tracking-[0.18em]">TRAVERION</span>
        </a>
      </header>
      <main className="flex-1 flex items-center justify-center px-5 pb-16">
        <div className="max-w-md w-full">
          <h1 className="font-display text-3xl text-ink tracking-tight">Partner workspace</h1>
          <p className="mt-3 text-sm text-ink-muted">
            You’re signed in as {email?.trim() ? email : 'this account'} — a traveler account.
          </p>
          <p className="mt-2 text-sm text-ink-muted leading-relaxed">
            This area is only for operators with a Traverion partner profile. Manage bookings and your traveler
            profile on the main site.
          </p>
          <div className="flex flex-col gap-2 mt-8">
            <a href={`${travelerSite}/trips`} className="tv-btn-primary inline-flex justify-center">
              Open your trips
            </a>
            <a href={travelerHome} className="tv-btn-secondary inline-flex justify-center">
              Go to Traverion home
            </a>
            <a href={travelerPackages} className="tv-btn-ghost inline-flex justify-center">
              Browse tours
            </a>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="tv-btn-ghost disabled:opacity-50"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
            <p className="text-xs text-ink-faint pt-2 leading-relaxed">
              Want to list tours? Open{' '}
              <a href={supplierPortalHref('/login')} className="font-medium text-ink underline">
                Partner sign-up
              </a>{' '}
              — sign out first. Partner and traveler are separate accounts; one email can only be one role (use e.g.{' '}
              <span className="font-mono text-[11px]">you+partner@gmail.com</span> for a second login to the same inbox).
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
