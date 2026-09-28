type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

const TONE: Record<Tone, string> = {
  neutral: 'bg-black/[0.04] text-ink-muted ring-black/[0.08]',
  good: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
  warn: 'bg-amber-50 text-amber-900 ring-amber-200/80',
  bad: 'bg-rose-50 text-rose-800 ring-rose-200/80',
  info: 'bg-finland/10 text-finland ring-finland/20',
};

export default function StatusChip({
  children,
  tone = 'neutral',
}: {
  children: string;
  tone?: Tone;
}) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export function toneForPaymentLabel(label: string): Tone {
  const l = label.toLowerCase();
  if (l === 'paid' || l === 'confirmed') return 'good';
  if (l === 'refunded') return 'info';
  if (l === 'refund due') return 'warn';
  if (l === 'no refund') return 'neutral';
  // Phase 1312: hold expiry is amber attention, not neutral.
  if (l === 'hold expired' || l === 'checkout hold') return 'warn';
  if (l.includes('pending')) return 'warn';
  if (l.includes('fail') || (l.includes('cancel') && !l.includes('none'))) return 'bad';
  if (l.includes('refund')) return 'info';
  return 'neutral';
}
