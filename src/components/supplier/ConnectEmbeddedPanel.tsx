import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ConnectAccountOnboarding,
  ConnectAccountManagement,
  ConnectComponentsProvider,
} from '@stripe/react-connect-js';
import { loadConnectAndInitialize, type StripeConnectInstance } from '@stripe/connect-js';
import {
  connectOnboardingUserMessage,
  fetchConnectAccountSessionSecret,
  type ConnectEmbeddedComponent,
} from '../../data/supabase-connect-onboarding';
import { EXPRESS_STRIPE_AUTH_LIMITATION } from '../../lib/connect-requirement-labels';
import { resolveStripePublishableKey } from '../../lib/stripe-payment-mode';

/** Force English for Traverion supplier UI regardless of browser language. */
export const CONNECT_EMBEDDED_LOCALE = 'en-GB';

type Props = {
  component: ConnectEmbeddedComponent;
  onExit: () => void;
  onHostedFallback: (url: string) => void;
  /** Called once when session init fails. Parent should show a single alert and restore Continue verification. */
  onError?: (message: string) => void;
  /** When true, show Express Stripe-auth explainer above the embedded component. */
  expectStripeAuth?: boolean;
};

/**
 * Embedded payout verification / account management inside Traverion.
 * Client secret is always fetched server-side; never trusts supplier-supplied account IDs.
 * Locale is fixed to English (en-GB) so browser language cannot switch the component to Finnish.
 */
export default function ConnectEmbeddedPanel({
  component,
  onExit,
  onHostedFallback,
  onError,
  expectStripeAuth = false,
}: Props) {
  const [stripeConnectInstance, setStripeConnectInstance] = useState<StripeConnectInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [painted, setPainted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // Keep parent callbacks out of the init effect deps — inline props remounted the session in a loop.
  const onHostedFallbackRef = useRef(onHostedFallback);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onHostedFallbackRef.current = onHostedFallback;
  }, [onHostedFallback]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const reportedErrorRef = useRef<string | null>(null);

  const reportError = useCallback((raw: string) => {
    const msg = connectOnboardingUserMessage(raw);
    setError(msg);
    if (reportedErrorRef.current === msg) return;
    reportedErrorRef.current = msg;
    onErrorRef.current?.(msg);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cachedSecret: string | null = null;
    reportedErrorRef.current = null;

    const fetchClientSecret = async () => {
      if (cachedSecret) {
        const once = cachedSecret;
        cachedSecret = null;
        return once;
      }
      const session = await fetchConnectAccountSessionSecret(component);
      if (session.url) {
        onHostedFallbackRef.current(session.url);
        throw new Error('hosted_fallback');
      }
      if (!session.clientSecret) {
        throw new Error(session.error || 'Could not start verification session');
      }
      return session.clientSecret;
    };

    void (async () => {
      setLoading(true);
      setPainted(false);
      setError(null);
      setStripeConnectInstance(null);
      try {
        const session = await fetchConnectAccountSessionSecret(component);
        if (cancelled) return;
        if (session.url) {
          onHostedFallbackRef.current(session.url);
          return;
        }
        if (!session.clientSecret) {
          throw new Error(session.error || 'Could not start verification session');
        }
        cachedSecret = session.clientSecret;
        const pk =
          session.publishableKey ||
          (typeof import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY === 'string'
            ? import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
            : '');
        const pkGate = resolveStripePublishableKey({
          publishableKey: pk,
          livePaymentsEnabledRaw: import.meta.env.VITE_STRIPE_LIVE_PAYMENTS_ENABLED,
        });
        if (!pkGate.ok) {
          throw new Error(pkGate.error);
        }
        const instance = loadConnectAndInitialize({
          publishableKey: pk,
          fetchClientSecret,
          locale: CONNECT_EMBEDDED_LOCALE,
          appearance: {
            // Prefer drawer overlays so regulated sub-steps stay framed in Traverion (not a detached popup).
            overlays: 'drawer',
            variables: {
              colorPrimary: '#073b83',
              colorBackground: '#ffffff',
              colorText: '#18181b',
              colorDanger: '#b91c1c',
              borderRadius: '10px',
              fontFamily: 'inherit',
              spacingUnit: '8px',
            },
          },
        });
        if (!cancelled) setStripeConnectInstance(instance);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof Error && e.message === 'hosted_fallback') return;
        reportError(e instanceof Error ? e.message : 'Could not start verification session');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [component, retryNonce, reportError]);

  if (loading) {
    return (
      <div
        className="rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-12 text-center text-[13px] text-[#52525b]"
        role="status"
      >
        Loading secure verification…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-900" role="alert">
        <p>{error}</p>
        <button
          type="button"
          className="tv-btn-secondary mt-3 h-10 px-3 text-[13px]"
          onClick={() => {
            reportedErrorRef.current = null;
            setError(null);
            setRetryNonce((n) => n + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (!stripeConnectInstance) return null;

  return (
    <div className="tv-connect-embed relative w-full min-w-0 min-h-[24rem] overflow-visible bg-white">
      {!painted ? (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center rounded-[10px] border border-[#e5e7eb] bg-white px-4 text-center text-[13px] text-[#52525b]"
          role="status"
        >
          Loading secure verification…
        </div>
      ) : null}
      {expectStripeAuth ? (
        <div
          className="mb-3 rounded-[10px] border border-[#dbe4f0] bg-[#f0f4fa] px-3 py-2.5 text-[12px] leading-relaxed text-[#1e3a5f]"
          role="note"
        >
          <p className="font-semibold text-[#073b83]">Secure Stripe sign-in may open</p>
          <p className="mt-1">
            Stripe may ask you to confirm your email or phone before collecting identity or bank details. Stay in this
            Traverion page — complete the short authentication step, then continue here. Traverion never sees your Stripe
            password or identity documents.
          </p>
          <p className="mt-1 text-[11px] text-[#52525b]">{EXPRESS_STRIPE_AUTH_LIMITATION}</p>
        </div>
      ) : null}
      <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
        {component === 'account_management' ? (
          <ConnectAccountManagement
            collectionOptions={{
              fields: 'eventually_due',
              futureRequirements: 'include',
            }}
          />
        ) : (
          <ConnectAccountOnboarding
            collectionOptions={{
              fields: 'eventually_due',
              futureRequirements: 'include',
            }}
            onLoaderStart={() => setPainted(true)}
            onLoadError={({ error: loadError }) => {
              reportError(loadError?.message || 'Could not load verification');
            }}
            onExit={() => {
              onExit();
            }}
          />
        )}
      </ConnectComponentsProvider>
    </div>
  );
}
