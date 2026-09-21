import { Check, Lock } from 'lucide-react';
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
  const locked = item.state === 'locked';

  const stateLabel = complete
    ? ', complete'
    : current
      ? ', current'
      : locked
        ? ', locked. Complete the previous step first'
        : '';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? 'step' : undefined}
      aria-disabled={locked || undefined}
      aria-label={`${item.label}${stateLabel}`}
      className={
        compact
          ? `lux-flat flex min-h-11 w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-center text-[11px] leading-tight transition-colors duration-150 ${
              current
                ? 'font-semibold text-finland'
                : complete
                  ? 'font-medium text-ink'
                  : locked
                    ? 'font-medium text-ink-faint'
                    : 'font-medium text-ink-muted'
            }`
          : `lux-flat flex w-full min-h-11 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-[background-color,box-shadow,color] duration-160 ${
              current
                ? 'bg-finland/[0.1] font-semibold text-finland shadow-[inset_0_0_0_1px_rgba(0,53,128,0.18)]'
                : complete
                  ? 'font-medium text-ink hover:bg-black/[0.04]'
                  : locked
                    ? 'text-ink-faint'
                    : 'text-ink-muted hover:bg-black/[0.04] hover:text-ink'
            }`
      }
    >
      {compact ? (
        <>
          <span className="flex h-4 items-center justify-center" aria-hidden>
            {complete ? (
              <Check className="h-3 w-3 text-finland" strokeWidth={2.5} />
            ) : locked ? (
              <Lock className="h-3 w-3 text-ink-faint" strokeWidth={2} />
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
              <Check className="h-3.5 w-3.5 text-finland" strokeWidth={2.5} />
            ) : current ? (
              <span className="block h-2 w-2 rounded-full bg-finland" />
            ) : locked ? (
              <Lock className="h-3.5 w-3.5 text-ink-faint" strokeWidth={2} />
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
