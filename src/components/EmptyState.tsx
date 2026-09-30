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
    <div className={`tv-state-panel motion-safe:animate-fade-in-up ${className}`}>
      {Icon ? (
        <div className="tv-state-panel__icon tv-state-panel__icon--empty" aria-hidden>
          <Icon className="h-5 w-5" strokeWidth={1.85} />
        </div>
      ) : null}
      <h2 className="font-display text-xl sm:text-2xl text-ink tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed">{body}</p>
      {action ? (
        <div className="mt-5 flex flex-wrap gap-2 [&_a]:min-h-11 [&_button]:min-h-11">{action}</div>
      ) : null}
    </div>
  );
}
