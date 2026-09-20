import { Check } from 'lucide-react';
import type { ListingCreationNavItem } from '../../../lib/listing-creation-workspace';

export function ListingCreationNavButton({
  item,
  onClick,
  compact = false,
}: {
  item: ListingCreationNavItem;
  onClick?: () => void;
  compact?: boolean;
}) {
  const current = item.state === 'current';
  const complete = item.state === 'complete';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? 'step' : undefined}
      aria-label={`${item.label}${complete ? ', complete' : current ? ', current' : ''}`}
      className={
        compact
          ? `lux-flat flex min-h-11 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-center text-[11px] leading-tight ${
              current
                ? 'font-semibold text-finland'
                : complete
                  ? 'font-medium text-ink'
                  : 'font-medium text-ink-muted'
            }`
          : `lux-flat flex w-full min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
              current
                ? 'bg-finland/[0.08] font-semibold text-finland'
                : complete
                  ? 'font-medium text-ink hover:bg-black/[0.04]'
                  : 'text-ink-muted hover:bg-black/[0.04] hover:text-ink'
            }`
      }
    >
      {compact ? (
        <>
          <span className="flex h-4 items-center justify-center" aria-hidden>
            {complete ? (
              <Check className="h-3 w-3 text-ink-muted" strokeWidth={2.25} />
            ) : (
              <span
                className={`block rounded-full ${
                  current ? 'h-1.5 w-1.5 bg-finland' : 'h-1 w-1 bg-ink-faint'
                }`}
              />
            )}
          </span>
          <span className="max-w-full truncate">{item.label}</span>
        </>
      ) : (
        <>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
            {complete ? (
              <Check className="h-3.5 w-3.5 text-ink-muted" strokeWidth={2.25} />
            ) : current ? (
              <span className="block h-2 w-2 rounded-full bg-finland" />
            ) : (
              <span className="block h-1.5 w-1.5 rounded-full bg-ink-faint" />
            )}
          </span>
          <span className="min-w-0 truncate">{item.label}</span>
        </>
      )}
    </button>
  );
}
