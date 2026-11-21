import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  AUTH_TRANSITION_STALL_MS,
  authTransitionCloseDelay,
  authTransitionSuccessHold,
  beginAuthTransition,
  completeAuthTransition,
  continueAuthCheckEmail,
  dismissAuthTransition,
  failAuthTransition,
  markAuthTransitionNavigated,
  showConfirmedAuthTransition,
  subscribeAuthTransition,
  succeedAuthTransition,
  type AuthTransition,
} from '../lib/auth-transition';
import { sanitizeTravelerAuthNext } from '../lib/travelerAuthLinks';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function BlueCheck() {
  const reduced = prefersReducedMotion();
  return (
    <div className="tv-auth-transition__badge" aria-hidden>
      <svg viewBox="0 0 52 52" className={reduced ? 'is-static' : ''}>
        <circle className="tv-auth-transition__ring" cx="26" cy="26" r="23" />
        <path className="tv-auth-transition__tick" d="M15.5 27.2l6.4 6.4 14.6-16" />
      </svg>
    </div>
  );
}

function AuthTransitionCard({ state, page }: { state: AuthTransition; page: string }) {
  const titleId = `auth-transition-title-${state.id}`;

  useEffect(() => {
    if (state.phase !== 'pending') return;
    const id = state.id;
    const timer = window.setTimeout(() => {
      failAuthTransition(id, 'This is taking longer than expected. You can try again.');
    }, AUTH_TRANSITION_STALL_MS);
    return () => window.clearTimeout(timer);
  }, [state.id, state.phase]);

  useEffect(() => {
    if (state.phase !== 'success' || state.navigated) return;
    const id = state.id;
    const timer = window.setTimeout(() => markAuthTransitionNavigated(id), authTransitionSuccessHold(prefersReducedMotion()));
    return () => window.clearTimeout(timer);
  }, [state.id, state.phase, state.navigated]);

  useEffect(() => {
    if (state.phase !== 'success' || !state.navigated) return;
    const id = state.id;
    const matched = !state.page || state.page === page;
    const delay = matched ? authTransitionCloseDelay(prefersReducedMotion()) : 4_000;
    const timer = window.setTimeout(() => completeAuthTransition(id), delay);
    return () => window.clearTimeout(timer);
  }, [state.id, state.phase, state.navigated, state.page, page]);

  const recoverable = state.phase === 'error' || state.phase === 'check-email';

  return (
    <div
      className="tv-auth-transition"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-live="polite"
      tabIndex={-1}
    >
      <div className="tv-auth-transition__card">
        {state.phase === 'pending' ? <span className="tv-auth-transition__spinner" aria-hidden /> : null}
        {state.phase === 'success' ? <BlueCheck /> : null}
        {state.phase === 'check-email' ? <span className="tv-auth-transition__mail" aria-hidden /> : null}
        {state.phase === 'error' ? <span className="tv-auth-transition__alert" aria-hidden /> : null}
        <h2 id={titleId} className="tv-auth-transition__title">
          {state.title}
        </h2>
        {state.email ? <p className="tv-auth-transition__email">{state.email}</p> : null}
        <p className="tv-auth-transition__message">{state.message}</p>
        {recoverable ? (
          <button
            type="button"
            className="tv-auth-transition__action"
            onClick={() => (state.phase === 'check-email' && state.actionLabel ? continueAuthCheckEmail() : dismissAuthTransition())}
          >
            {state.phase === 'check-email' ? state.actionLabel || 'Back to sign in' : 'Try again'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function AuthTransitionModal({
  page,
  onNavigate,
  product = 'traveler',
}: {
  page: string;
  onNavigate: (page: string) => void;
  product?: 'traveler' | 'partner';
}) {
  const { user, loading } = useAuth();
  const [state, setState] = useState<AuthTransition | null>(null);
  const linkHandled = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeAuthTransition(setState), []);

  useEffect(() => {
    if (!state) return;
    document.querySelector<HTMLElement>('.tv-auth-transition')?.focus();
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        dialogRef.current?.querySelector<HTMLElement>('button')?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [state]);

  useEffect(() => {
    if (product !== 'traveler' || loading || !user?.email_confirmed_at || linkHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('via') !== 'link') return;
    linkHandled.current = true;
    params.delete('via');
    const path = window.location.pathname.replace(/\/$/, '') || '/';
    const query = params.toString();
    const destination =
      path === '/log-in' || path === '/login' || path === '/sign-up' || path === '/auth'
        ? sanitizeTravelerAuthNext(params.get('next'))
        : page;
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    );
    const id = beginAuthTransition({
      intent: 'login',
      title: 'Signing you in...',
      message: 'Checking your account.',
    });
    succeedAuthTransition(id, {
      title: 'Welcome back!',
      message: "You're signed in.",
      page: destination,
      navigate: () => {
        if (destination !== page) onNavigate(destination);
      },
    });
  }, [loading, user, page, onNavigate, product]);

  if (!state || typeof document === 'undefined') return null;

  return createPortal(
    <div ref={dialogRef}>
      <AuthTransitionCard state={state} page={page} />
    </div>,
    document.body
  );
}

export function openVerifiedWelcome(destination: string, onArrive: () => void): void {
  showConfirmedAuthTransition({
    intent: 'signup',
    title: 'Email verified!',
    message: 'Your email is confirmed. You can continue.',
    page: destination,
    navigate: onArrive,
  });
}
