import type { ReactNode } from 'react';

export function profileInputClass(disabled?: boolean): string {
  return `tv-input w-full text-[13px]${disabled ? ' opacity-70 cursor-not-allowed bg-black/[0.02]' : ''}`;
}

export function ProfileCard({
  id,
  title,
  description,
  children,
  actions,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section
      id={id}
      className="rounded-2xl border border-black/[0.06] bg-white p-4 sm:p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h2>
          {description ? (
            <p className="mt-1 text-[13px] text-ink-muted leading-snug max-w-2xl">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  const empty =
    value == null ||
    (typeof value === 'string' && !value.trim()) ||
    value === false;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[10.5rem_1fr] gap-1 sm:gap-4 py-2.5 border-b border-black/[0.05] last:border-0">
      <dt className="text-[12px] font-medium text-ink-faint pt-0.5">{label}</dt>
      <dd className="text-[14px] text-ink leading-snug break-words">
        {empty ? <span className="text-ink-faint">—</span> : value}
      </dd>
    </div>
  );
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
