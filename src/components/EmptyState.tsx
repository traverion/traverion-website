import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
  className?: string;
};

/**
 * Intentional empty: what happened, that this can be normal, and one next step.
 * Prefer wrapping pages to add raised surfaces; keep this primitive borderless.
 */
export default function EmptyState({ icon: Icon, title, body, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`py-10 sm:py-16 max-w-md motion-safe:animate-fade-in-up ${className}`}>
      {Icon ? (
        <div
          className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-finland/10 text-finland ring-1 ring-finland/15"
          aria-hidden
        >
          <Icon className="w-5 h-5" />
        </div>
      ) : null}
      <h2 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">{title}</h2>
      <p className="mt-3 text-sm sm:text-base text-ink-muted leading-relaxed">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
