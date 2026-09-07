/**
 * Partner landing at /login. Visual atmosphere + account action.
 * Auth opens as a focused panel — not an admin form dump.
 */
import { useState, useRef } from 'react';
import { X } from 'lucide-react';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import SupplierAuth from '../../pages/supplier/SupplierAuth';
import SkipLink from '../SkipLink';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import { HERO_IMG } from '../../lib/heroImages';

interface SupplierLoginPageProps {
  onAuthenticated: () => void;
  isSupabase: boolean;
}

export default function SupplierLoginPage({ onAuthenticated, isSupabase }: SupplierLoginPageProps) {
  const mainSiteUrl = publicSiteBaseUrl();
  const [auth, setAuth] = useState<'signup' | 'signin' | null>(null);
  const authSheetRef = useRef<HTMLDivElement>(null);
  const closeAuth = () => setAuth(null);
  useDialogFocus(auth !== null, authSheetRef, closeAuth);

  return (
    <div className="relative isolate min-h-[100dvh] w-full text-white bg-ink">
      <SkipLink />
      <div className="pointer-events-none fixed inset-0 -z-10">
        <img
          src={HERO_IMG.vacation}
          alt=""
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/45 to-black/25" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 sm:px-8 py-5">
        <a href={mainSiteUrl} className="flex items-center gap-2.5 text-white no-lux-interaction" aria-label="Traverion home">
          <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain" />
          <span className="font-sans text-sm font-semibold tracking-[0.18em]">TRAVERION</span>
        </a>
        <a
          href={mainSiteUrl}
          className="lux-flat text-sm text-white/80 hover:text-white transition-colors"
        >
          Browse tours
        </a>
      </header>

      <main id="main-content" tabIndex={-1} className="relative z-10 flex min-h-[calc(100dvh-5.5rem)] flex-col justify-end sm:justify-center px-5 sm:px-10 lg:px-16 pb-10 sm:pb-16 outline-none">
        <div className="max-w-xl motion-safe:animate-fade-in-up">
          <p className="text-xs uppercase tracking-[0.22em] text-white/70 mb-4">Traverion Partner</p>
          <h1 className="font-display text-[2.35rem] sm:text-5xl lg:text-6xl leading-[1.05] text-white mb-5">
            Sell your tours.
            <br />
            Run the day.
          </h1>
          <p className="text-base sm:text-lg text-white/80 max-w-md mb-8 leading-relaxed font-sans">
            Publish tours, take bookings, and operate — without an admin maze.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => setAuth('signup')}
              className="h-12 px-7 rounded-full bg-white text-ink font-semibold hover:bg-paper transition-colors"
            >
              Create account
            </button>
            <button
              type="button"
              onClick={() => setAuth('signin')}
              className="lux-flat h-12 px-7 rounded-full border border-white/40 text-white font-semibold hover:bg-white/10 transition-colors"
            >
              Log in
            </button>
          </div>
        </div>
      </main>

      {auth && (
        <div
          ref={authSheetRef}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="partner-auth-title"
        >
          <button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            className="absolute inset-0 bg-black/50 no-lux-interaction"
            onClick={closeAuth}
          />
          <div className="relative w-full sm:max-w-md bg-paper-raised text-ink rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 max-h-[92dvh] overflow-y-auto shadow-soft-xl motion-safe:animate-slide-up">
            <div className="flex items-start justify-between mb-4">
              <h2 id="partner-auth-title" className="font-display text-2xl text-ink">
                {auth === 'signin' ? 'Log in' : 'Create account'}
              </h2>
              <button
                type="button"
                onClick={closeAuth}
                className="lux-flat p-2 rounded-full text-ink-muted hover:text-ink"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SupplierAuth
              onAuthenticated={onAuthenticated}
              isSupabase={isSupabase}
              initialMode={auth}
              compact
              onModeChange={(mode) => setAuth(mode)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
