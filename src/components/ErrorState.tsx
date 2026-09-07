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
    <div className={`py-10 sm:py-16 max-w-md motion-safe:animate-fade-in-up ${className}`} role="alert">
      <div
        className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-black/[0.04] text-ink-muted"
        aria-hidden
      >
        <Icon className="w-5 h-5" />
      </div>
      <h2 className="font-display text-2xl sm:text-3xl text-ink tracking-tight">{title}</h2>
      <p className="mt-3 text-sm sm:text-base text-ink-muted leading-relaxed">{body}</p>
      {retry || back || extra ? (
        <div className="mt-6 flex flex-wrap items-center gap-2">
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
