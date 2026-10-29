import { Lock } from 'lucide-react';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';

/** Shared Traverion checkout chrome — logo back control + secure badge. */
export default function CheckoutSecureHeader({
  onBrandClick,
  srBackLabel,
}: {
  onBrandClick: () => void;
  srBackLabel: string;
}) {
  return (
    <header className="shrink-0 border-b border-black/[0.08] bg-white pt-[env(safe-area-inset-top,0px)]">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onBrandClick}
          className="lux-flat inline-flex h-11 min-w-0 items-center gap-2 rounded-md pr-2 text-ink"
        >
          <img src={BRAND_LOGO_SRC} alt="" className="h-8 w-8 object-contain" />
          <span className="font-sans text-[13px] font-bold tracking-tight">Traverion</span>
          <span className="sr-only">{srBackLabel}</span>
        </button>
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
          <Lock className="h-3.5 w-3.5 text-finland" aria-hidden />
          Secure checkout
        </p>
      </div>
    </header>
  );
}
