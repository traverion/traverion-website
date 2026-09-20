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
    <div className={`py-6 sm:py-8 max-w-md motion-safe:animate-fade-in-up ${className}`}>
      {Icon ? (
        <div
          className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-finland/10 text-finland ring-1 ring-finland/15"
          aria-hidden
        >
          <Icon className="w-4 h-4" />
        </div>
      ) : null}
      <h2 className="font-display text-xl sm:text-2xl text-ink tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
