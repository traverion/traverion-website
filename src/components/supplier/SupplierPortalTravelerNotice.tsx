import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { supplierPortalHref } from '../../lib/partnerHost';

type Props = {
  email: string | null;
  onSignOut: () => void;
};

/**
 * Shown when a signed-in **traveler** (no `supplier_profiles` row) opens partner URLs.
 */
export default function SupplierPortalTravelerNotice({ email, onSignOut }: Props) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 text-gray-900">
            <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain" />
            <span className="font-semibold text-finland">TRAVERION</span>
          </a>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-gray-200 bg-white p-8 shadow-sm text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Traveler account</h1>
          <p className="text-sm text-gray-600 mb-1">
            You’re signed in as{' '}
            <span className="font-medium text-gray-800">{email?.trim() ? email : 'this account'}</span>.
          </p>
          <p className="text-sm text-gray-600 mb-6">
            This area is for <strong>tour partners</strong> (suppliers) with a Traverion partner profile. Bookings
            and your traveler profile are on the main site.
          </p>
          <div className="flex flex-col gap-2">
            <a
              href="/"
              className="inline-flex justify-center items-center rounded-xl bg-finland text-white font-semibold px-4 py-3 hover:bg-finland-dark transition-colors"
            >
              Go to Traverion home
            </a>
            <a
              href="/packages"
              className="inline-flex justify-center items-center rounded-xl border border-gray-200 text-gray-700 font-medium px-4 py-3 hover:bg-gray-50 transition-colors"
            >
              Browse tours
            </a>
            <button
              type="button"
              onClick={() => onSignOut()}
              className="inline-flex justify-center items-center rounded-xl text-finland font-medium px-4 py-3 hover:bg-finland/5 transition-colors"
            >
              Sign out
            </button>
            <p className="text-xs text-gray-500 pt-2 leading-relaxed">
              Want to list tours? Open{' '}
              <a href={supplierPortalHref('/login')} className="text-finland underline font-medium">
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
