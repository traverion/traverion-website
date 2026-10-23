import { useCallback, useEffect, useState } from 'react';
import {
  ConnectAccountOnboarding,
  ConnectAccountManagement,
  ConnectComponentsProvider,
} from '@stripe/react-connect-js';
import { loadConnectAndInitialize, type StripeConnectInstance } from '@stripe/connect-js';
import { fetchConnectAccountSessionSecret, type ConnectEmbeddedComponent } from '../../data/supabase-connect-onboarding';
import { isStripeTestPublishableKey, stripeLivePublishableBlockedMessage } from '../../lib/stripe-test-only';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';

/** Force English for Traverion supplier UI regardless of browser language. */
export const CONNECT_EMBEDDED_LOCALE = 'en-GB';

type Props = {
  component: ConnectEmbeddedComponent;
  onExit: () => void;
  onHostedFallback: (url: string) => void;
  onError?: (message: string) => void;
};

/**
 * Embedded payout verification / account management inside Traverion.
 * Client secret is always fetched server-side; never trusts supplier-supplied account IDs.
 * Locale is fixed to English (en-GB) so browser language cannot switch the component to Finnish.
 */
export default function ConnectEmbeddedPanel({ component, onExit, onHostedFallback, onError }: Props) {
  const [stripeConnectInstance, setStripeConnectInstance] = useState<StripeConnectInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClientSecret = useCallback(async () => {
    const session = await fetchConnectAccountSessionSecret(component);
    if (session.url) {
      onHostedFallback(session.url);
      throw new Error('hosted_fallback');
    }
    if (!session.clientSecret) {
      throw new Error(session.error || 'Could not start verification session');
    }
    return session.clientSecret;
  }, [component, onHostedFallback]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const session = await fetchConnectAccountSessionSecret(component);
        if (cancelled) return;
        if (session.url) {
          onHostedFallback(session.url);
          return;
        }
        if (!session.clientSecret) {
          throw new Error(session.error || 'Could not start verification session');
        }
        const pk =
          session.publishableKey ||
          (typeof import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY === 'string'
            ? import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
            : '');
        if (!pk || !isStripeTestPublishableKey(pk)) {
          throw new Error(stripeLivePublishableBlockedMessage());
        }
        const instance = loadConnectAndInitialize({
          publishableKey: pk,
          fetchClientSecret,
          locale: CONNECT_EMBEDDED_LOCALE,
          appearance: {
            overlays: 'dialog',
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
        const msg = userFacingError(e instanceof Error ? e.message : null, USER_ERROR.generic);
        setError(msg);
        onError?.(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [component, fetchClientSecret, onError, onHostedFallback]);

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
        {error}
      </div>
    );
  }

  if (!stripeConnectInstance) return null;

  return (
    <div className="w-full min-w-0 overflow-visible bg-white">
      <ConnectComponentsProvider connectInstance={stripeConnectInstance}>
        {component === 'account_management' ? (
          <ConnectAccountManagement />
        ) : (
          <ConnectAccountOnboarding
            onExit={() => {
              onExit();
            }}
          />
        )}
      </ConnectComponentsProvider>
    </div>
  );
}
