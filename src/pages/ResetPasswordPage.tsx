import { ArrowLeft } from 'lucide-react';
import { HERO_IMG } from '../lib/heroImages';
import { BRAND_LOGO_SRC } from '../lib/brandAssets';
import SetNewPasswordForm from '../components/auth/SetNewPasswordForm';
import { publicSiteBaseUrl } from '../lib/publicSiteUrl';

interface ResetPasswordPageProps {
  onNavigate: (page: string) => void;
}

function readNextAfterReset(): string {
  try {
    const next = new URLSearchParams(window.location.search).get('next');
    const allowed = new Set(['home', 'packages', 'cart', 'bookings', 'booking-confirmed', 'account', 'wishlist', 'contact']);
    if (next && allowed.has(next)) return next;
  } catch {
    /* ignore */
  }
  return 'account';
}

export default function ResetPasswordPage({ onNavigate }: ResetPasswordPageProps) {
  const nextPage = readNextAfterReset();
  const loginHref = `/log-in?next=${encodeURIComponent(nextPage)}`;

  return (
    <div className="relative min-h-screen pt-20">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center scale-110"
          style={{
            backgroundImage: `url(${HERO_IMG.vacation})`,
            filter: 'blur(12px)',
          }}
        />
        <div className="absolute inset-0 bg-white/55" />
      </div>
      <div className="max-w-md mx-auto px-4 py-8 pb-12">
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="mb-5 inline-flex items-center gap-2 text-gray-600 hover:text-finland"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-lg">
          <div className="px-6 pt-6 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3 mb-3">
              <img src={BRAND_LOGO_SRC} alt="" className="h-12 w-12 object-contain flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold text-gray-900">Set a new password</h1>
                <p className="text-sm text-gray-600 mt-0.5">
                  Traveler account on {publicSiteBaseUrl().replace(/^https?:\/\//, '')}
                </p>
              </div>
            </div>
          </div>
          <div className="p-6">
            <SetNewPasswordForm
              minPasswordLength={6}
              onSuccess={() => {
                window.location.replace(loginHref);
              }}
              loginHref={loginHref}
              successHint="You can sign in with your new password."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
