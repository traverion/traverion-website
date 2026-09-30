import type { ReactNode } from 'react';

type Tone = 'info' | 'warn' | 'danger' | 'success';

const TONE: Record<Tone, string> = {
  info: 'tv-notice tv-notice--info',
  warn: 'tv-notice tv-notice--warn',
  danger: 'tv-notice tv-notice--danger',
  success: 'tv-notice tv-notice--success',
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
      className={TONE[tone]}
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
    >
      <p className="text-sm font-semibold leading-snug tracking-tight">{title}</p>
      {children ? <div className="mt-1.5 text-sm leading-relaxed opacity-90">{children}</div> : null}
      {action ? <div className="mt-3 flex flex-wrap gap-2 [&_button]:min-h-11 [&_a]:min-h-11">{action}</div> : null}
    </div>
  );
}
