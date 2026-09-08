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
  return (
    <div className={`rounded-2xl px-4 py-3 ${TONE[tone]}`}>
      <p className="text-sm font-semibold">{title}</p>
      {children ? <div className="mt-1 text-sm leading-relaxed opacity-90">{children}</div> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
