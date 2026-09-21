import type { ReactNode } from 'react';

type Tone = 'info' | 'warn' | 'danger' | 'success';

const TONE: Record<Tone, string> = {
  info: 'bg-finland/8 text-ink ring-1 ring-finland/15',
  warn: 'bg-amber-50 text-amber-950 ring-1 ring-amber-200/70',
  danger: 'bg-rose-50 text-rose-950 ring-1 ring-rose-200/70',
  success: 'bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200/70',
};

export default function NoticeCallout({
  title,
  children,
  tone = 'info',
  action,
}: {
  title: string;
  children?: ReactNode;
  tone?: Tone;
  action?: ReactNode;
}) {
  const assertive = tone === 'danger' || tone === 'warn';
  return (
    <div
      className={`rounded-xl px-3.5 py-2.5 ${TONE[tone]}`}
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
    >
      <p className="text-sm font-semibold leading-snug">{title}</p>
      {children ? <div className="mt-1 text-sm leading-relaxed opacity-90">{children}</div> : null}
      {action ? <div className="mt-2.5">{action}</div> : null}
    </div>
  );
}
