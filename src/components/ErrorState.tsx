import type { LucideIcon } from 'lucide-react';
import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

type ErrorAction = {
  label?: string;
  onClick: () => void;
};

type ErrorStateProps = {
  title?: string;
  body: string;
  icon?: LucideIcon;
  retry?: ErrorAction;
  back?: ErrorAction;
  extra?: ReactNode;
  className?: string;
};

/**
 * Recoverable failure: what happened, and what to do (retry, go back).
 * Matches EmptyState — no red bordered boxes, no raw backend text.
 */
export default function ErrorState({
  title = 'Something went wrong',
  body,
  icon: Icon = AlertCircle,
  retry,
  back,
  extra,
  className = '',
}: ErrorStateProps) {
  return (
    <div
      className={`tv-state-panel motion-safe:animate-fade-in-up ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="tv-state-panel__icon tv-state-panel__icon--error" aria-hidden>
        <Icon className="h-5 w-5" strokeWidth={1.85} />
      </div>
      <h2 className="font-display text-xl sm:text-2xl text-ink tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-ink-muted leading-relaxed">{body}</p>
      {retry || back || extra ? (
        <div className="mt-5 flex flex-wrap items-center gap-2 [&_a]:min-h-11 [&_button]:min-h-11">
          {retry ? (
            <button type="button" onClick={retry.onClick} className="tv-btn-primary">
              {retry.label ?? 'Try again'}
            </button>
          ) : null}
          {back ? (
            <button type="button" onClick={back.onClick} className="tv-btn-ghost">
              {back.label ?? 'Go back'}
            </button>
          ) : null}
          {extra}
        </div>
      ) : null}
    </div>
  );
}
