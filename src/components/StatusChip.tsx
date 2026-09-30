type Tone = 'neutral' | 'good' | 'warn' | 'bad' | 'info';

const TONE: Record<Tone, string> = {
  neutral: 'tv-status-chip tv-status-chip--neutral',
  good: 'tv-status-chip tv-status-chip--good',
  warn: 'tv-status-chip tv-status-chip--warn',
  bad: 'tv-status-chip tv-status-chip--bad',
  info: 'tv-status-chip tv-status-chip--info',
};

export default function StatusChip({
  children,
  tone = 'neutral',
}: {
  children: string;
  tone?: Tone;
}) {
  return <span className={TONE[tone]}>{children}</span>;
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

/** Collapsed Trips row left accent — payment label wins when it differs from lifecycle (Refund due, Paid, …). */
export function toneForTravelerTripCard(
  lifecycle: string,
  payLabel: string,
  opts?: { hostCancellation?: boolean }
): Tone {
  if (opts?.hostCancellation) return 'warn';
  return toneForPaymentLabel(payLabel !== lifecycle ? payLabel : lifecycle);
}
