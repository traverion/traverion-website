/**
 * Shared presentation primitives for Tour and Stay booking detail pages.
 */
import type { ReactNode } from 'react';
import { ArrowLeft, CheckCircle, Copy, Mail, Trash2 } from 'lucide-react';

export type TourOpsDetailFinance = {
  state: 'loading' | 'ready' | 'missing' | 'error';
  customerPaid: string | null;
  commission: string | null;
  commissionRate: string | null;
  supplierEarnings: string | null;
  paymentStatus: string;
  commissionAdjusted?: boolean;
};

export function BookingOpsFact({ label, children }: { label: string; children: ReactNode }) {
  if (children == null || children === '') return null;
  return (
    <div className="tour-ops-detail__fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function BookingOpsBackLink({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button type="button" className="tour-ops-detail__back lux-flat" onClick={onBack}>
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}

export function BookingOpsRefBar({
  kindLabel,
  referenceLabel,
  statusLabel,
  statusClass,
  copied,
  onCopyReference,
}: {
  kindLabel: string;
  referenceLabel: string;
  statusLabel: string;
  statusClass: string;
  copied?: boolean;
  onCopyReference: () => void;
}) {
  return (
    <header className="tour-ops-detail__top">
      <div className="tour-ops-detail__ref-row">
        <p className="tour-ops-detail__ref">
          <span className="tour-ops-detail__ref-label">{kindLabel}</span>{' '}
          <span className="tour-ops-detail__ref-code">{referenceLabel}</span>
        </p>
        <button
          type="button"
          className="tour-ops-detail__copy lux-flat"
          onClick={onCopyReference}
          aria-label={`Copy ${kindLabel.toLowerCase()} reference ${referenceLabel}`}
        >
          <Copy className="h-3.5 w-3.5" aria-hidden />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <span className={`tour-ops-detail__status ${statusClass}`}>{statusLabel}</span>
    </header>
  );
}

export function BookingOpsExperience({
  imageUrl,
  title,
  subtitle,
  meta,
  note,
}: {
  imageUrl: string | null;
  title: string;
  subtitle?: string | null;
  meta: ReactNode;
  note?: string | null;
}) {
  return (
    <div className="tour-ops-detail__experience">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="tour-ops-detail__thumb" />
      ) : (
        <div className="tour-ops-detail__thumb tour-ops-detail__thumb--empty" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <h1 className="tour-ops-detail__title" title={title}>
          {title}
        </h1>
        {subtitle ? (
          <p className="tour-ops-detail__option" title={subtitle}>
            {subtitle}
          </p>
        ) : null}
        <div className="tour-ops-detail__exp-meta">{meta}</div>
        {note ? <p className="tour-ops-detail__note">{note}</p> : null}
      </div>
    </div>
  );
}

export function BookingOpsFinancePanel({
  finance,
  emptyLabel,
  onOpenFinancialStatement,
}: {
  finance: TourOpsDetailFinance;
  emptyLabel: string;
  onOpenFinancialStatement?: () => void;
}) {
  return (
    <section className="tour-ops-detail__aside-card">
      <h2 className="tour-ops-detail__heading">Payment</h2>
      <p className="tour-ops-detail__payment-status">{finance.paymentStatus}</p>
      {finance.state === 'loading' ? (
        <p className="mt-2 text-[13px] text-ink-muted">Loading…</p>
      ) : finance.state === 'ready' ? (
        <>
          <dl className="tour-ops-detail__finance">
            <div>
              <dt>Customer paid</dt>
              <dd className="tabular-nums">{finance.customerPaid || '—'}</dd>
            </div>
            <div>
              <dt>
                Traverion commission
                {finance.commissionRate ? ` (${finance.commissionRate})` : ''}
              </dt>
              <dd className="tabular-nums">{finance.commission ? `−${finance.commission}` : '—'}</dd>
            </div>
            <div className="tour-ops-detail__finance-earn-row">
              <dt>Supplier earnings</dt>
              <dd className="tabular-nums tour-ops-detail__earn">{finance.supplierEarnings || '—'}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[12px] leading-4 text-ink-faint">
            {finance.commissionAdjusted
              ? 'Amounts follow refunds on this booking. Earnings are not a payout.'
              : 'Supplier earnings are not a payout.'}
          </p>
          {onOpenFinancialStatement ? (
            <button
              type="button"
              className="mt-2 text-[12.5px] font-semibold text-finland hover:underline"
              onClick={onOpenFinancialStatement}
            >
              View financial statement
            </button>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-[13px] text-ink-muted">{emptyLabel}</p>
      )}
    </section>
  );
}

export function BookingOpsActionRail({
  busy,
  canEdit,
  showConfirm,
  showCancelRequest,
  cancelBlocked,
  onConfirm,
  onMessageGuest,
  onRequestCancel,
  requestActionsSlot,
}: {
  busy?: boolean;
  canEdit: boolean;
  showConfirm?: boolean;
  showCancelRequest?: boolean;
  cancelBlocked?: boolean;
  onConfirm?: () => void;
  onMessageGuest: () => void;
  onRequestCancel?: () => void;
  requestActionsSlot?: ReactNode;
}) {
  return (
    <div className="tour-ops-detail__actions">
      {requestActionsSlot}
      {canEdit && showConfirm && onConfirm ? (
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="tv-btn-secondary inline-flex h-9 w-full items-center justify-center gap-1.5 !px-3 text-[13px] disabled:opacity-50"
        >
          <CheckCircle className="h-3.5 w-3.5" aria-hidden />
          {busy ? 'Saving…' : 'Confirm'}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onMessageGuest}
        className="tv-btn-primary inline-flex h-9 w-full items-center justify-center gap-1.5 !px-3 text-[13px]"
      >
        <Mail className="h-3.5 w-3.5" aria-hidden />
        Message customer
      </button>
      {canEdit && showCancelRequest && onRequestCancel ? (
        <button
          type="button"
          disabled={busy || cancelBlocked}
          onClick={onRequestCancel}
          className="tv-btn-ghost inline-flex h-9 w-full items-center justify-center gap-1.5 !px-3 text-[13px] text-red-700 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Cancel booking
        </button>
      ) : null}
    </div>
  );
}

/** Compact house-rules / multi-line text as a readable list. */
export function BookingOpsRuleList({ text }: { text: string }) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  if (lines.length === 1) {
    return <p className="tour-ops-detail__rules-text">{lines[0]}</p>;
  }
  return (
    <ul className="tour-ops-detail__rules-list">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
