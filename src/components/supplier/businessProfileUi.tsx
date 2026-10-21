import type { ReactNode } from 'react';

/** Desktop content width for Business Settings (~1000px). */
export const BUSINESS_SETTINGS_CONTENT_CLASS = 'mx-auto w-full max-w-[1000px]';

export function profileInputClass(disabled?: boolean): string {
  return `tv-input w-full text-[13px]${disabled ? ' opacity-70 cursor-not-allowed bg-black/[0.02]' : ''}`;
}

export function ProfileCard({
  id,
  title,
  description,
  children,
  actions,
  className = '',
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={`rounded-xl border border-black/[0.06] bg-white p-4 sm:p-5 ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Subsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-black/[0.05] pt-3 first:border-0 first:pt-0">
      <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-ink-muted">{title}</h3>
      {children}
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  const empty =
    value == null || (typeof value === 'string' && !value.trim()) || value === false;
  return (
    <div className="grid grid-cols-1 gap-0.5 border-b border-black/[0.04] py-2 last:border-0 sm:grid-cols-[9.5rem_1fr] sm:gap-3 sm:py-2">
      <dt className="text-[12px] font-medium text-ink-muted">{label}</dt>
      <dd className="break-words text-[14px] leading-snug text-ink">
        {empty ? <span className="text-ink-faint">—</span> : value}
      </dd>
    </div>
  );
}

/** Two-column InfoRow grid on desktop for denser verified data. */
export function InfoGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-8 md:grid-cols-2">{children}</dl>;
}

export function SaveBar({
  saving,
  disabled,
  label,
  savingLabel = 'Saving…',
  success,
  error,
  errorText,
  onClick,
}: {
  saving: boolean;
  disabled?: boolean;
  label: string;
  savingLabel?: string;
  success?: boolean;
  error?: boolean;
  errorText?: string | null;
  onClick: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <button
        type="button"
        disabled={disabled || saving}
        onClick={onClick}
        className="tv-btn-primary h-10 px-4 text-[13px] disabled:opacity-50"
      >
        {saving ? savingLabel : label}
      </button>
      {success ? <p className="text-[13px] font-medium text-emerald-800">Saved.</p> : null}
      {error ? (
        <p className="text-[13px] text-red-700" role="alert">
          {errorText?.trim() || 'Could not save. Try again.'}
        </p>
      ) : null}
    </div>
  );
}

export function PolicyDocRow({
  title,
  description,
  statusLabel,
  preview,
  onEdit,
  editDisabled,
  editLabel,
}: {
  title: string;
  description: string;
  statusLabel: string;
  preview?: string | null;
  onEdit: () => void;
  editDisabled?: boolean;
  editLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-black/[0.06] bg-white px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-[14px] font-semibold text-ink">{title}</p>
          <span className="text-[12px] font-medium text-ink-muted">{statusLabel}</span>
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">{description}</p>
        {preview ? (
          <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-ink-faint whitespace-pre-wrap">
            {preview}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        disabled={editDisabled}
        className="tv-btn-secondary h-9 shrink-0 px-3 text-[13px] disabled:opacity-50"
        onClick={onEdit}
      >
        {editLabel}
      </button>
    </div>
  );
}
