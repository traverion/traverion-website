import { Check, Lock } from 'lucide-react';
import type { ListingCreationNavItem } from '../../../lib/listing-creation-workspace';

const STATE_CAPTION: Record<ListingCreationNavItem['state'], string> = {
  complete: 'Complete',
  current: 'In progress',
  upcoming: 'Not started',
  locked: 'Locked',
};

export function ListingCreationNavButton({
  item,
  onClick,
  compact = false,
  step,
}: {
  item: ListingCreationNavItem;
  onClick?: () => void;
  compact?: boolean;
  /** 1-based step number shown in the rail marker. */
  step?: number;
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
          : `lux-flat relative flex w-full min-h-11 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-[background-color,box-shadow,color,transform] duration-180 ${
              current
                ? 'bg-finland/[0.09] font-semibold text-finland shadow-[inset_3px_0_0_0_var(--partner-accent,#003580)]'
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
          <span
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
              complete
                ? 'bg-finland text-white'
                : current
                  ? 'bg-white text-finland ring-2 ring-finland'
                  : locked
                    ? 'bg-black/[0.04] text-ink-faint ring-1 ring-black/10'
                    : 'bg-white text-ink-muted ring-1 ring-black/15'
            }`}
            aria-hidden
          >
            {complete ? (
              <Check className="h-3.5 w-3.5" strokeWidth={2.75} />
            ) : locked ? (
              <Lock className="h-3 w-3" strokeWidth={2} />
            ) : (
              (step ?? '')
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate leading-snug tracking-tight">{item.label}</span>
            <span
              className={`mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.08em] ${
                complete ? 'text-finland' : current ? 'text-finland/75' : 'text-ink-faint'
              }`}
            >
              {STATE_CAPTION[item.state]}
            </span>
            {item.summary ? (
              <span
                className="mt-0.5 block truncate text-[11px] font-normal normal-case tracking-normal text-ink-muted leading-snug"
                title={item.summary}
              >
                {item.summary}
              </span>
            ) : null}
          </span>
        </>
      )}
    </button>
  );
}
