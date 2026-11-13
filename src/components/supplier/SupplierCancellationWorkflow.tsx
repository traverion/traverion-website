import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { SUPPLIER_CANCELLATION_REASON_CODES, snapshotSupplierCancellationPolicy, supplierCancellationReasonLabel } from '../../lib/cancellation-policy';
import {
  PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE,
  PARTNER_CANCEL_REQUEST_FEE_TIMING_NOTE,
  PARTNER_CANCEL_REQUEST_REFUND_POLICY,
} from '../../lib/booking-confirmation-copy';
import { formatMoney } from '../../lib/money';
import {
  CANCELLATION_BATCH_LIMIT,
  EMPTY_CANCELLATION_FILTERS,
  buildCancellationCandidate,
  cancellationFailureSummary,
  cancellationMoneyPreview,
  cancellationResultCounts,
  cancellationRunPhase,
  cancellationStatusMessage,
  cancellationTotals,
  candidatesByIds,
  classifyCancellationSelection,
  entireDepartureSelection,
  explicitCancellationSelection,
  filterCancellationCandidates,
  supplierCancellationExplanationMin,
  supplierCancellationExplanationReady,
  type CancellationCandidate,
  type CancellationFilters,
  type CancellationFamily,
} from '../../lib/supplier-cancellation-workflow';
import PartnerSelect from './PartnerSelect';

export type CancellationWorkflowResultRow = {
  bookingId: string;
  ok: boolean;
  error?: string;
  notification: 'accepted' | 'unconfirmed' | 'not_sent';
  refundNote: string;
};

const STEPS = ['Select', 'Reason', 'Review'] as const;

const FAMILIES: { value: '' | CancellationFamily; label: string }[] = [
  { value: '', label: 'Tours, stays, and rentals' },
  { value: 'tour', label: 'Tours' },
  { value: 'stay', label: 'Stays' },
  { value: 'rental', label: 'Rentals' },
];

function notificationLabel(status: CancellationWorkflowResultRow['notification']): string {
  if (status === 'accepted') return 'Mail provider accepted the notice';
  if (status === 'unconfirmed') return 'Email was not confirmed';
  return 'No email sent';
}

function formatCancellationDate(iso: string): string {
  if (!iso) return 'Date open';
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function SupplierCancellationWorkflow({
  pool,
  initialSelectedIds,
  canSubmit,
  onClose,
  onConfirmPaid,
  onReleaseUnpaid,
}: {
  pool: readonly CancellationCandidate[];
  initialSelectedIds: readonly string[];
  canSubmit: boolean;
  onClose: () => void;
  onConfirmPaid: (input: {
    bookings: CancellationCandidate[];
    reasonCode: string;
    reasonText: string;
    evidenceNote: string;
    idempotencyKey: string;
  }) => Promise<{ ok: boolean; error?: string; rows: CancellationWorkflowResultRow[] }>;
  onReleaseUnpaid: (booking: CancellationCandidate) => Promise<{ ok: boolean; error?: string }>;
}) {
  const titleId = useId();
  const filtersPanelId = useId();
  const panes = useRef<Array<HTMLElement | null>>([]);
  const [step, setStep] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [filters, setFilters] = useState<CancellationFilters>(EMPTY_CANCELLATION_FILTERS);
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(explicitCancellationSelection(pool, initialSelectedIds))
  );
  const [frozenIds, setFrozenIds] = useState<string[] | null>(null);
  const [reasonCode, setReasonCode] = useState<string>('OPERATIONAL_ERROR');
  const [explanation, setExplanation] = useState('');
  const [evidence, setEvidence] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'form' | 'processing' | 'success' | 'partial' | 'failure'>('form');
  const [resultRows, setResultRows] = useState<CancellationWorkflowResultRow[]>([]);

  const visible = useMemo(() => filterCancellationCandidates(pool, filters), [pool, filters]);
  const departure = useMemo(() => entireDepartureSelection(visible), [visible]);
  const selectedRows = useMemo(
    () => candidatesByIds(pool, explicitCancellationSelection(pool, [...checked])),
    [pool, checked]
  );
  const reviewRows = useMemo(
    () => candidatesByIds(pool, frozenIds ?? []),
    [pool, frozenIds]
  );
  const kind = classifyCancellationSelection(reviewRows.length ? reviewRows : selectedRows);
  const paidFlow = kind === 'paid';
  const minChars = supplierCancellationExplanationMin(reasonCode);
  const explanationCount = explanation.trim().length;
  const reasonReady = supplierCancellationExplanationReady(reasonCode, explanation);
  const listings = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of pool) map.set(row.listingId, row.listingTitle);
    return [...map.entries()];
  }, [pool]);
  const options = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of pool) {
      if (filters.listingId && row.listingId !== filters.listingId) continue;
      if (row.optionId) map.set(row.optionId, row.optionLabel || 'Option');
    }
    return [...map.entries()];
  }, [pool, filters.listingId]);
  const times = useMemo(() => {
    const set = new Set<string>();
    for (const row of pool) if (row.startHm) set.add(row.startHm);
    return [...set].sort();
  }, [pool]);
  const advancedFilterCount = [filters.family, filters.listingId, filters.optionId, filters.startHm, filters.status]
    .filter(Boolean).length;
  const selectionTotals = cancellationTotals(selectedRows, reasonCode);
  const feePreview = cancellationMoneyPreview(
    reviewRows[0] ?? selectedRows[0] ?? emptyFeeRow(),
    reasonCode
  );

  useEffect(() => {
    panes.current.forEach((node, index) => {
      if (node) node.inert = step !== index;
    });
  }, [step]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && phase !== 'processing') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, phase]);

  const freezeAndContinue = (ids: string[]) => {
    const rows = candidatesByIds(pool, ids);
    const nextKind = classifyCancellationSelection(rows);
    if (nextKind === 'empty') {
      setFormError('Select at least one booking.');
      return;
    }
    if (nextKind === 'too_many') {
      setFormError(`Select at most ${CANCELLATION_BATCH_LIMIT} bookings.`);
      return;
    }
    if (nextKind === 'mixed') {
      setFormError('Paid bookings and unpaid holds use different rules. Cancel one group at a time.');
      return;
    }
    if (nextKind === 'unpaid_many') {
      setFormError('Release one unpaid hold at a time. Bulk release is not available.');
      return;
    }
    setFormError(null);
    setChecked(new Set(ids));
    setFrozenIds(ids);
    setAcknowledged(false);
    setStep(1);
  };

  const submit = async () => {
    if (!canSubmit || phase === 'processing') return;
    const rows = candidatesByIds(pool, frozenIds ?? []);
    const nextKind = classifyCancellationSelection(rows);
    if (nextKind === 'paid' && !reasonReady) return;
    if (!acknowledged) return;
    setPhase('processing');
    setFormError(null);
    if (nextKind === 'unpaid' && rows[0]) {
      const released = await onReleaseUnpaid(rows[0]);
      const outcome: CancellationWorkflowResultRow = {
        bookingId: rows[0].id,
        ok: released.ok,
        error: released.error,
        notification: 'not_sent',
        refundNote: 'No refund is due. Payment was not completed.',
      };
      setResultRows([outcome]);
      setPhase(released.ok ? 'success' : 'failure');
      return;
    }
    const ran = await onConfirmPaid({
      bookings: rows,
      reasonCode,
      reasonText: explanation.trim(),
      evidenceNote: evidence.trim(),
      idempotencyKey,
    });
    const listed = ran.rows.length ? ran.rows : rows.map((row) => ({
      bookingId: row.id,
      ok: false,
      error: ran.error || 'This booking was not cancelled.',
      notification: 'not_sent' as const,
      refundNote: 'Not submitted.',
    }));
    setResultRows(listed);
    const outcome = cancellationRunPhase(listed);
    setFormError(outcome === 'failure' ? cancellationFailureSummary(listed, ran.error) : null);
    setPhase(outcome);
    setDetailsOpen(true);
  };

  const resultById = new Map(resultRows.map((row) => [row.bookingId, row]));
  const resultCounts = cancellationResultCounts(resultRows);
  const settledRows = resultRows.length
    ? reviewRows.filter((row) => resultById.get(row.id)?.ok)
    : reviewRows;
  const previewTotals = cancellationTotals(settledRows, reasonCode);
  const statusMessage = resultRows.length ? cancellationStatusMessage(resultRows, formError) : null;
  const policy = snapshotSupplierCancellationPolicy(reasonCode);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#f4f5f7] text-ink" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="sticky top-0 z-10 border-b border-black/[0.06] bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 id={titleId} className="truncate text-[17px] font-semibold tracking-tight text-ink">Cancel bookings</h1>
          </div>
          <ol className="flex shrink-0 items-center rounded-full bg-[#f4f5f7] p-1" aria-label="Cancellation progress">
            {STEPS.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  className={`rounded-full px-2.5 py-1 text-[12px] font-medium sm:px-3 sm:text-[13px] ${
                    index === step ? 'bg-[#073B83] text-white' : index < step ? 'text-[#073B83]' : 'text-ink-faint'
                  }`}
                  aria-current={index === step ? 'step' : undefined}
                  disabled={phase === 'processing' || index > step}
                  onClick={() => {
                    if (index < step && phase === 'form') setStep(index);
                  }}
                >
                  <span className="lg:hidden">{index + 1}</span>
                  <span className="hidden lg:inline">{index + 1}. {label}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div
          className="flex h-full w-[300%] transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${step * (100 / 3)}%)` }}
        >
          <section ref={(node) => { panes.current[0] = node; }} className="h-full w-1/3 overflow-x-hidden overflow-y-auto px-4 py-5 [scrollbar-width:thin] sm:px-6" aria-label="Select bookings" aria-hidden={step !== 0}>
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Search</span>
                  <input
                    value={filters.query}
                    onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
                    className="tv-input w-full"
                    placeholder="Search reference, guest, or product"
                  />
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-2 sm:flex-none">
                    <input
                      type="date"
                      aria-label="From"
                      className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none sm:w-[8.5rem] sm:flex-none"
                      value={filters.dateFrom}
                      onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))}
                    />
                    <span className="text-ink-faint" aria-hidden>–</span>
                    <input
                      type="date"
                      aria-label="To"
                      className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none sm:w-[8.5rem] sm:flex-none"
                      value={filters.dateTo}
                      onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))}
                    />
                  </div>
                  <button
                    type="button"
                    className={`inline-flex h-10 shrink-0 items-center rounded-lg border px-3 text-[13px] font-medium ${
                      filtersOpen || advancedFilterCount > 0
                        ? 'border-[#073B83]/30 bg-white text-[#073B83]'
                        : 'border-black/10 bg-white text-ink-muted'
                    }`}
                    aria-expanded={filtersOpen}
                    aria-controls={filtersPanelId}
                    onClick={() => setFiltersOpen((open) => !open)}
                  >
                    Filters{advancedFilterCount > 0 ? ` ${advancedFilterCount}` : ''}
                  </button>
                </div>
              </div>

              {filtersOpen ? (
                <div id={filtersPanelId} className="grid gap-3 rounded-xl border border-black/[0.06] bg-white p-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="block text-[12px] font-medium text-ink-muted">
                    Product
                    <select
                      className="tv-input mt-1"
                      value={filters.family}
                      onChange={(event) => setFilters((prev) => ({ ...prev, family: event.target.value as CancellationFilters['family'] }))}
                    >
                      {FAMILIES.map((item) => <option key={item.label} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="block text-[12px] font-medium text-ink-muted">
                    Listing
                    <select
                      className="tv-input mt-1"
                      value={filters.listingId}
                      onChange={(event) => setFilters((prev) => ({ ...prev, listingId: event.target.value, optionId: '' }))}
                    >
                      <option value="">All listings</option>
                      {listings.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
                    </select>
                  </label>
                  <label className="block text-[12px] font-medium text-ink-muted">
                    Option
                    <select
                      className="tv-input mt-1"
                      value={filters.optionId}
                      onChange={(event) => setFilters((prev) => ({ ...prev, optionId: event.target.value }))}
                    >
                      <option value="">All options</option>
                      {options.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </label>
                  <label className="block text-[12px] font-medium text-ink-muted">
                    Departure time
                    <select className="tv-input mt-1" value={filters.startHm} onChange={(event) => setFilters((prev) => ({ ...prev, startHm: event.target.value }))}>
                      <option value="">Any time</option>
                      {times.map((time) => <option key={time} value={time}>{time}</option>)}
                    </select>
                  </label>
                  <label className="block text-[12px] font-medium text-ink-muted">
                    Status
                    <select className="tv-input mt-1" value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value as CancellationFilters['status'] }))}>
                      <option value="">Any status</option>
                      <option value="paid">Paid</option>
                      <option value="unpaid">Unpaid hold</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="pending">Pending</option>
                    </select>
                  </label>
                </div>
              ) : null}

              <div className="overflow-hidden rounded-xl border border-black/[0.06] bg-white">
                <div className="flex items-baseline justify-between gap-3 border-b border-black/[0.06] px-4 py-2.5">
                  <p className="text-[13px] text-ink-muted">
                    <span className="font-medium tabular-nums text-ink">{selectedRows.length}</span> selected
                    <span className="text-ink-faint"> · </span>
                    <span className="tabular-nums">{selectionTotals.customers}</span> {selectionTotals.customers === 1 ? 'customer' : 'customers'}
                  </p>
                  <p className="text-[13px] font-medium tabular-nums text-ink">
                    {formatMoney(selectionTotals.paid, selectionTotals.currency)}
                  </p>
                </div>
                {visible.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-ink-muted">No bookings match these filters.</p>
                ) : (
                  <ul>
                    {visible.map((row) => {
                      const selectable = row.eligiblePaid || row.eligibleUnpaid;
                      return (
                        <li key={row.id} className="border-b border-black/[0.05] last:border-b-0">
                          <label className={`flex items-center gap-3 px-3 py-3 sm:px-4 ${selectable ? 'cursor-pointer' : 'opacity-60'}`}>
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 rounded border-black/30 text-[#073B83] focus:ring-[#073B83]"
                              checked={checked.has(row.id)}
                              disabled={!selectable || phase !== 'form'}
                              aria-label={`Select ${row.reference}`}
                              onChange={() => {
                                setChecked((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(row.id)) next.delete(row.id);
                                  else next.add(row.id);
                                  return next;
                                });
                              }}
                            />
                            <div className="w-[4.5rem] shrink-0">
                              <p className="text-[13px] font-medium text-ink">{formatCancellationDate(row.date)}</p>
                              <p className="text-[12px] text-ink-muted">{row.startHm || '—'}</p>
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-ink">{row.guestName}</p>
                              <p className="truncate text-[13px] text-ink-muted">
                                {row.listingTitle}{row.optionLabel ? ` · ${row.optionLabel}` : ''}
                              </p>
                              <p className="truncate text-[12px] text-ink-faint">
                                {row.reference} · {row.guests} {row.guests === 1 ? 'guest' : 'guests'}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-medium tabular-nums text-ink">
                                {row.eligiblePaid ? formatMoney(row.amountPaid, row.currency) : 'Unpaid'}
                              </p>
                              {!selectable ? <p className="text-[12px] text-ink-faint">{row.blockReason || row.status}</p> : null}
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <p className="px-1 text-[12px] text-ink-faint">New bookings are not added after you continue.</p>
            </div>
          </section>

          <section ref={(node) => { panes.current[1] = node; }} className="h-full w-1/3 overflow-x-hidden overflow-y-auto px-4 py-8 [scrollbar-width:thin] sm:px-6" aria-label="Reason and policy" aria-hidden={step !== 1}>
            <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
              {paidFlow ? (
                <>
                  <div className="rounded-xl border border-black/[0.06] bg-white px-4 py-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-sm text-ink">Full refund due</p>
                      <p className="text-sm font-semibold tabular-nums text-ink">
                        Fee {formatMoney(feePreview.feeAmount, feePreview.currency)}
                      </p>
                    </div>
                    <p className="mt-1 text-[13px] leading-snug text-ink-muted">{PARTNER_CANCEL_REQUEST_FEE_TIMING_NOTE}</p>
                    <button
                      type="button"
                      className="mt-2 text-[13px] font-medium text-[#073B83]"
                      aria-expanded={policyOpen}
                      onClick={() => setPolicyOpen((open) => !open)}
                    >
                      {policyOpen ? 'Hide policy details' : 'Policy details'}
                    </button>
                    {policyOpen ? (
                      <div className="mt-2 space-y-2 border-t border-black/[0.06] pt-2 text-[13px] leading-snug text-ink-muted">
                        <p>{PARTNER_CANCEL_REQUEST_REFUND_POLICY}</p>
                        <p>{PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE}</p>
                        <p>Policy {policy.policy_id}.</p>
                      </div>
                    ) : null}
                  </div>
                  <div>
                    <span className="text-[13px] font-medium text-ink" id="supplier-cancel-reason-label">Reason</span>
                    <div className="mt-1.5">
                      <PartnerSelect
                        aria-labelledby="supplier-cancel-reason-label"
                        value={reasonCode}
                        onChange={setReasonCode}
                        options={SUPPLIER_CANCELLATION_REASON_CODES.map((code) => ({
                          value: code,
                          label: supplierCancellationReasonLabel(code),
                        }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[13px] font-medium text-ink" htmlFor="supplier-cancel-explanation">Explanation</label>
                    <textarea
                      id="supplier-cancel-explanation"
                      value={explanation}
                      onChange={(event) => setExplanation(event.target.value)}
                      rows={5}
                      className="tv-input mt-1.5 min-h-[8rem]"
                      placeholder="What happened, and why these travelers cannot take the booking."
                    />
                    <p className="mt-1.5 text-[13px] tabular-nums text-ink-muted" aria-live="polite">
                      {explanationCount} / {minChars} characters
                    </p>
                  </div>
                  <div>
                    <label className="text-[13px] font-medium text-ink" htmlFor="supplier-cancel-evidence">Evidence notes, optional</label>
                    <textarea
                      id="supplier-cancel-evidence"
                      value={evidence}
                      onChange={(event) => setEvidence(event.target.value)}
                      rows={3}
                      className="tv-input mt-1.5"
                      placeholder="Weather notice, staff note, or other record."
                    />
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-black/[0.06] bg-white px-4 py-4 text-sm leading-relaxed text-ink">
                  This unpaid hold has no completed payment. Releasing it does not create a refund or a supplier fee.
                  The traveler sees the cancellation on My bookings. {PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE}
                </div>
              )}
            </div>
          </section>

          <section ref={(node) => { panes.current[2] = node; }} className="h-full w-1/3 overflow-x-hidden overflow-y-auto px-4 py-8 [scrollbar-width:thin] sm:px-6" aria-label="Review and confirm" aria-hidden={step !== 2}>
            <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
              {phase === 'processing' ? (
                <p className="text-sm text-ink-muted" role="status">
                  Cancelling {reviewRows.length} booking{reviewRows.length === 1 ? '' : 's'}. Each booking is confirmed on its own.
                </p>
              ) : null}
              {statusMessage && phase !== 'processing' ? (
                <p
                  className={`text-sm ${phase === 'success' ? 'font-medium text-ink' : 'text-ink'} ${phase === 'partial' ? 'border-l-2 border-l-amber-500 pl-3' : ''}`}
                  role={phase === 'failure' ? 'alert' : 'status'}
                >
                  {statusMessage}
                </p>
              ) : null}

              <div className="overflow-hidden rounded-xl border border-black/[0.06] bg-white">
                <div className={`grid divide-y divide-black/[0.06] sm:divide-x sm:divide-y-0 ${resultRows.length ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
                  <SummaryStat label={resultRows.length ? 'Customers cancelled' : 'Customers'} value={String(previewTotals.customers)} />
                  <SummaryStat label="Bookings" value={String(resultRows.length ? resultCounts.total : reviewRows.length)} />
                  {resultRows.length ? (
                    <>
                      <SummaryStat label="Cancelled" value={String(resultCounts.cancelled)} />
                      <SummaryStat label="Not cancelled" value={String(resultCounts.notCancelled)} />
                    </>
                  ) : null}
                  <SummaryStat label={resultRows.length ? 'Refunds for cancelled bookings' : 'Refunds'} value={formatMoney(previewTotals.refunds, previewTotals.currency)} />
                  <SummaryStat label="Supplier fees" value={formatMoney(previewTotals.fees, previewTotals.currency)} />
                </div>
                <p className="border-t border-black/[0.06] px-4 py-3 text-[13px] leading-snug text-ink-muted">
                  Inventory for a successful cancellation releases that booking’s guests ({previewTotals.guests}).
                  Other bookings on the same departure stay unless they are in this selection.
                </p>
                <div className="border-t border-black/[0.06]">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-ink"
                    aria-expanded={detailsOpen}
                    onClick={() => setDetailsOpen((open) => !open)}
                  >
                    Booking details
                    <span className="text-[12px] font-normal text-ink-faint">{detailsOpen ? 'Hide' : 'Show'}</span>
                  </button>
                  {detailsOpen ? (
                    <ul className="border-t border-black/[0.06]">
                      {reviewRows.map((row) => {
                        const result = resultById.get(row.id);
                        const money = result && !result.ok
                          ? { refundAmount: 0, feeAmount: 0, currency: row.currency }
                          : cancellationMoneyPreview(row, reasonCode);
                        return (
                          <li key={row.id} className="border-b border-black/[0.05] px-4 py-3 last:border-b-0">
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="min-w-0 truncate text-sm font-medium text-ink">{row.guestName}</p>
                              <p className="shrink-0 text-[13px] tabular-nums text-ink-muted">
                                {formatMoney(money.refundAmount, money.currency)}
                              </p>
                            </div>
                            <p className="mt-0.5 truncate text-[13px] text-ink-muted">
                              {row.listingTitle}
                              {row.optionLabel ? ` · ${row.optionLabel}` : ''}
                              {row.date ? ` · ${formatCancellationDate(row.date)}` : ''}
                              {row.startHm ? ` · ${row.startHm}` : ''}
                            </p>
                            <p className="mt-1 break-words text-[12px] leading-snug text-ink-faint">
                              {row.reference}
                              <span> · Fee {formatMoney(money.feeAmount, money.currency)}</span>
                              {result ? (
                                <>
                                  <span> · {result.ok ? 'Cancelled' : result.error || 'Not cancelled'}</span>
                                  <span> · {notificationLabel(result.notification)}</span>
                                  <span> · {result.refundNote}</span>
                                </>
                              ) : (
                                <span> · Notification has not been sent</span>
                              )}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              </div>

              {phase === 'form' || phase === 'failure' ? (
                <label className="flex items-start gap-3 px-1 text-sm leading-snug text-ink">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-black/30 text-[#073B83] focus:ring-[#073B83]"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                  <span>I confirm this selection. Only these bookings will be submitted, and a later booking will not be added.</span>
                </label>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <footer className="sticky bottom-0 border-t border-black/[0.06] bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button type="button" className="tv-btn-ghost" onClick={onClose} disabled={phase === 'processing'}>
              Close
            </button>
            {step > 0 && phase === 'form' ? (
              <button type="button" className="tv-btn-ghost" onClick={() => setStep((value) => value - 1)}>
                Back
              </button>
            ) : null}
          </div>
          {formError && phase !== 'failure' ? <p className="min-w-0 flex-1 text-sm text-ink" role="alert">{formError}</p> : null}
          <div className="flex min-w-0 flex-wrap justify-end gap-2">
            {step === 0 ? (
              <>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-black/10 bg-white px-3 text-sm font-medium text-ink disabled:opacity-40"
                  disabled={!departure || !canSubmit}
                  onClick={() => departure && freezeAndContinue(departure.ids)}
                >
                  Cancel this departure
                </button>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-[#073B83] px-3 text-sm font-medium text-white disabled:opacity-40"
                  disabled={!canSubmit || selectedRows.length === 0}
                  onClick={() => freezeAndContinue(selectedRows.map((row) => row.id))}
                >
                  Continue with selected
                </button>
              </>
            ) : null}
            {step === 1 ? (
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[#073B83] px-4 text-sm font-medium text-white disabled:opacity-40"
                disabled={paidFlow && !reasonReady}
                onClick={() => {
                  setFormError(null);
                  setStep(2);
                }}
              >
                Continue
              </button>
            ) : null}
            {step === 2 && (phase === 'form' || phase === 'failure') ? (
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[#073B83] px-4 text-sm font-medium text-white disabled:opacity-40"
                disabled={!canSubmit || !acknowledged || (paidFlow && !reasonReady)}
                onClick={() => void submit()}
              >
                {phase === 'failure' ? 'Try again' : 'Confirm cancellation'}
              </button>
            ) : null}
            {phase === 'success' || phase === 'partial' ? (
              <button type="button" className="inline-flex h-10 items-center justify-center rounded-lg bg-[#073B83] px-4 text-sm font-medium text-white" onClick={onClose}>
                Done
              </button>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <p className="px-4 py-3">
      <span className="block text-[12px] text-ink-faint">{label}</span>
      <span className="mt-0.5 block text-sm font-semibold tabular-nums text-ink">{value}</span>
    </p>
  );
}

function emptyFeeRow(): CancellationCandidate {
  return buildCancellationCandidate({
    id: 'preview',
    reference: '',
    listingId: '',
    listingTitle: '',
    family: 'tour',
    paymentStatus: 'paid',
    status: 'confirmed',
    amountPaid: 0,
  });
}
