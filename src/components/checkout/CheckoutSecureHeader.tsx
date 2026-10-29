import { Lock } from 'lucide-react';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { CHECKOUT_CONTENT_MAX } from './checkoutLayout';

/** Shared Traverion checkout chrome — mark + wordmark + secure badge. */
export default function CheckoutSecureHeader({
  onBrandClick,
  srBackLabel,
  secureLabel = 'Secure checkout',
  contentMaxClassName = CHECKOUT_CONTENT_MAX,
}: {
  onBrandClick: () => void;
  srBackLabel: string;
  secureLabel?: string;
  contentMaxClassName?: string;
}) {
  return (
    <header className="shrink-0 border-b border-black/[0.08] bg-white pt-[env(safe-area-inset-top,0px)]">
      <div
        className={`mx-auto flex h-14 w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 ${contentMaxClassName}`}
      >
        <button
          type="button"
          onClick={onBrandClick}
          className="lux-flat inline-flex h-11 min-w-0 items-center gap-2.5 rounded-md pr-2 text-ink"
        >
          <img src={BRAND_LOGO_SRC} alt="" className="h-8 w-8 object-contain" />
          <span className="font-sans text-[15px] font-bold tracking-tight">Traverion</span>
          <span className="sr-only">{srBackLabel}</span>
        </button>
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
          <Lock className="h-3.5 w-3.5 text-finland" aria-hidden />
          {secureLabel}
        </p>
      </div>
    </header>
  );
}
