import { useEffect, type ReactNode, type Ref } from 'react';
import CheckoutSecureHeader from './CheckoutSecureHeader';
import CheckoutMinimalFooter from './CheckoutMinimalFooter';
import { CHECKOUT_CONTENT_MAX } from './checkoutLayout';

export { CHECKOUT_CONTENT_MAX, CHECKOUT_TWO_COL } from './checkoutLayout';

type Props = {
  onBrandClick: () => void;
  srBackLabel: string;
  /** Right-side badge copy. Confirm page uses “Secure booking”. */
  secureLabel?: string;
  children: ReactNode;
  /** Optional sticky mobile CTA dock below scroll. */
  mobileDock?: ReactNode;
  /** When false, omit the legal footer (rare). */
  showFooter?: boolean;
  className?: string;
  /** Scroll container ref (e.g. reset scroll on step change). */
  scrollRef?: Ref<HTMLDivElement>;
};

/**
 * Full-viewport checkout chrome: secure header, single scroll body, footer dock outside content.
 * P9.30: no nested scroll traps; html+body locked while open (parity with payout wizard).
 */
export default function CheckoutPageShell({
  onBrandClick,
  srBackLabel,
  secureLabel = 'Secure checkout',
  children,
  mobileDock,
  showFooter = true,
  className = '',
  scrollRef,
}: Props) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
    };
  }, []);

  return (
    <div
      className={`tv-tour-checkout fixed inset-0 z-[10000] flex flex-col overflow-hidden bg-[#F7F8FA] ${className}`.trim()}
    >
      <CheckoutSecureHeader
        onBrandClick={onBrandClick}
        srBackLabel={srBackLabel}
        secureLabel={secureLabel}
        contentMaxClassName={CHECKOUT_CONTENT_MAX}
      />
      <div
        ref={scrollRef}
        className="tv-tour-checkout__scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        <div
          className={`tv-checkout-page mx-auto w-full ${CHECKOUT_CONTENT_MAX} px-4 py-4 sm:px-6 sm:py-5 lg:px-8 ${
            mobileDock ? 'pb-6 lg:pb-8' : ''
          }`}
        >
          {children}
          {showFooter ? <CheckoutMinimalFooter /> : null}
        </div>
      </div>
      {mobileDock ? (
        <div className="tv-tour-checkout__dock lg:hidden shrink-0 border-t border-black/[0.08] bg-white/97 px-4 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <div className={`mx-auto flex w-full min-w-0 ${CHECKOUT_CONTENT_MAX} flex-col gap-2`}>
            {mobileDock}
          </div>
        </div>
      ) : null}
    </div>
  );
}
