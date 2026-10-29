import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useDialogFocus } from '../hooks/useDialogFocus';
import TravelerAuthForm, { type TravelerAuthTab } from './auth/TravelerAuthForm';

const EXIT_MS = 200;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Shared traveler authentication modal for Tour, Stay, and Rental checkout gates.
 * Enter/exit motion is CSS-driven; reduced-motion skips slide/fade.
 */
export default function AuthModal() {
  const { authModalOpen, authIntent, closeAuthModal, triggerAuthSuccess } = useAuth();
  const [tab, setTab] = useState<TravelerAuthTab>('signin');
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<'enter' | 'open' | 'exit'>('enter');
  const dialogRef = useRef<HTMLDivElement>(null);
  const exitTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  const focusOpen = authModalOpen || (mounted && phase !== 'exit');
  useDialogFocus(focusOpen, dialogRef, closeAuthModal);

  useEffect(() => {
    mountedRef.current = mounted;
  }, [mounted]);

  useEffect(() => {
    if (authModalOpen) {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
      setMounted(true);
      setPhase('enter');
      const frame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => setPhase('open'));
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (!mountedRef.current) return;
    setPhase('exit');
    const delay = prefersReducedMotion() ? 0 : EXIT_MS;
    exitTimerRef.current = window.setTimeout(() => {
      setMounted(false);
      setPhase('enter');
      exitTimerRef.current = null;
    }, delay);
    return () => {
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = null;
      }
    };
  }, [authModalOpen]);

  useEffect(() => {
    if (!mounted) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mounted]);

  useEffect(() => {
    if (!authModalOpen) setTab('signin');
  }, [authModalOpen]);

  if (!mounted) return null;

  const overlayPhase =
    phase === 'open' ? 'tv-auth-overlay--open' : phase === 'exit' ? 'tv-auth-overlay--exit' : 'tv-auth-overlay--enter';
  const dialogPhase =
    phase === 'open' ? 'tv-auth-dialog--open' : phase === 'exit' ? 'tv-auth-dialog--exit' : 'tv-auth-dialog--enter';

  return (
    <div
      className={`tv-auth-overlay fixed inset-0 z-[30000] flex items-end justify-center sm:items-center sm:p-4 ${overlayPhase}`}
      onClick={closeAuthModal}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className={`tv-auth-dialog w-full sm:max-w-[26.5rem] ${dialogPhase}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex justify-end bg-white px-3 pt-3 sm:px-4 sm:pt-3.5">
          <button
            type="button"
            onClick={closeAuthModal}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition-colors duration-150 hover:bg-black/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finland/40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 pb-[max(1.15rem,env(safe-area-inset-bottom))] pt-0.5 sm:px-6 sm:pb-6">
          <TravelerAuthForm
            idPrefix="auth-modal"
            tab={tab}
            onTabChange={setTab}
            intent={authIntent}
            afterConfirmNext="account"
            showPartnerLink
            onAuthenticated={() => {
              void triggerAuthSuccess();
            }}
          />
        </div>
      </div>
    </div>
  );
}
