import type { ReactNode, Ref } from 'react';
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
 * Full-viewport checkout chrome: secure header, wide scroll body, minimal footer.
 * Callers own the two-column grid inside `children`.
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
  return (
    <div className={`fixed inset-0 z-[10000] flex flex-col bg-[#F7F8FA] ${className}`.trim()}>
      <CheckoutSecureHeader
        onBrandClick={onBrandClick}
        srBackLabel={srBackLabel}
        secureLabel={secureLabel}
        contentMaxClassName={CHECKOUT_CONTENT_MAX}
      />
      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 overflow-y-auto ${
          mobileDock ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0' : ''
        }`}
      >
        <div className={`tv-checkout-page mx-auto w-full ${CHECKOUT_CONTENT_MAX} px-4 py-4 sm:px-6 sm:py-5 lg:px-8`}>
          {children}
          {showFooter ? <CheckoutMinimalFooter /> : null}
        </div>
      </div>
      {mobileDock ? (
        <div className="lg:hidden shrink-0 border-t border-black/[0.08] bg-white/96 px-4 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <div className={`mx-auto flex w-full ${CHECKOUT_CONTENT_MAX} flex-col gap-1.5`}>{mobileDock}</div>
        </div>
      ) : null}
    </div>
  );
}
