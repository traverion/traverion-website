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
import { TraverionDateRangeField } from '../calendar/TraverionDateRangeField';

export type CancellationWorkflowResultRow = {
  bookingId: string;
  ok: boolean;
  error?: string;
  notification: 'accepted' | 'unconfirmed' | 'not_sent';
  refundNote: string;
};

const STEPS = ['Select', 'Reason', 'Review'] as const;

const STEP_INTRO = [
  {
    title: 'Select bookings',
    description: 'Search or filter by date. Continuing freezes this selection.',
  },
  {
    title: 'Reason',
    description: 'Say why these bookings cannot run. A full refund is due.',
  },
  {
    title: 'Review',
    description: 'Check refunds, fees, and inventory, then confirm.',
  },
] as const;

const SHELL = 'mx-auto w-full max-w-5xl px-4 sm:px-6';
const PRIMARY_BTN =
  'inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#073B83] px-4 text-sm font-medium text-white transition-colors hover:bg-[#052c64] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073B83] disabled:cursor-not-allowed disabled:bg-[#073B83] disabled:opacity-40 sm:w-auto';
const SECONDARY_BTN =
  'inline-flex h-10 w-full items-center justify-center rounded-lg border border-black/10 bg-white px-4 text-sm font-medium text-ink transition-colors hover:bg-[#f4f5f7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073B83] disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto';
const PANE = 'h-full w-1/3 overflow-x-hidden overflow-y-auto overscroll-contain [scrollbar-width:thin]';

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const submittingRef = useRef(false);
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
      if (!node) return;
      node.inert = step !== index;
      if (index === step) node.scrollTop = 0;
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
    if (!canSubmit || phase === 'processing' || submittingRef.current) return;
    const rows = candidatesByIds(pool, frozenIds ?? []);
    const nextKind = classifyCancellationSelection(rows);
    if (nextKind === 'paid' && !reasonReady) return;
    if (!acknowledged) return;
    submittingRef.current = true;
    setPhase('processing');
    setFormError(null);
    try {
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
    } finally {
      submittingRef.current = false;
    }
  };

  const resultById = new Map(resultRows.map((row) => [row.bookingId, row]));
  const resultCounts = cancellationResultCounts(resultRows);
  const settledRows = resultRows.length
    ? reviewRows.filter((row) => resultById.get(row.id)?.ok)
    : reviewRows;
  const previewTotals = cancellationTotals(settledRows, reasonCode);
  const reasonTotals = cancellationTotals(reviewRows.length ? reviewRows : selectedRows, reasonCode);
  const statusMessage = resultRows.length ? cancellationStatusMessage(resultRows, formError) : null;
  const policy = snapshotSupplierCancellationPolicy(reasonCode);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#f4f5f7] text-ink" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="z-10 shrink-0 border-b border-black/[0.06] bg-white">
        <div className={`${SHELL} flex h-14 items-center justify-between gap-4`}>
          <h1 id={titleId} className="truncate text-[15px] font-semibold tracking-tight text-ink">Cancel bookings</h1>
          <ol className="flex shrink-0 items-center rounded-full bg-[#f4f5f7] p-0.5" aria-label="Cancellation progress">
            {STEPS.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  className={`rounded-full px-2.5 py-1 text-[12px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073B83] sm:px-3 sm:text-[13px] ${
                    index === step ? 'bg-[#073B83] text-white' : index < step ? 'text-[#073B83] hover:bg-white' : 'text-ink-faint'
                  }`}
                  aria-current={index === step ? 'step' : undefined}
                  disabled={phase === 'processing' || index > step}
                  onClick={() => {
                    if (index < step && phase === 'form') setStep(index);
                  }}
                >
                  <span className="md:hidden">{index + 1}</span>
                  <span className="hidden md:inline">{index + 1}. {label}</span>
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
          <section ref={(node) => { panes.current[0] = node; }} className={PANE} aria-label="Select bookings" aria-hidden={step !== 0}>
            <div className={`${SHELL} flex flex-col gap-5 py-6`}>
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-ink">{STEP_INTRO[0].title}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-snug text-ink-muted">{STEP_INTRO[0].description}</p>
              </div>
              <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Search</span>
                  <input
                    value={filters.query}
                    onChange={(event) => setFilters((prev) => ({ ...prev, query: event.target.value }))}
                    className="tv-input w-full"
                    placeholder="Search reference, guest, or product"
                  />
                </label>
                <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
                  <TraverionDateRangeField
                    id="cancel-bookings-dates"
                    className="w-full sm:w-[16.5rem]"
                    from={filters.dateFrom}
                    to={filters.dateTo}
                    placeholder="Travel dates"
                    aria-label="Travel dates"
                    onChange={({ from, to }) => setFilters((prev) => ({ ...prev, dateFrom: from, dateTo: to }))}
                  />
                  <button
                    type="button"
                    className={`inline-flex h-10 shrink-0 items-center rounded-lg border px-3 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073B83] ${
                      filtersOpen || advancedFilterCount > 0
                        ? 'border-[#073B83]/25 bg-[#eef3f9] text-[#073B83]'
                        : 'border-black/10 bg-white text-ink-muted hover:bg-[#f4f5f7]'
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

              <div className="grid grid-cols-3 divide-x divide-black/[0.06] overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(7,59,131,0.04)]">
                <SummaryStat label="Selected" value={String(selectedRows.length)} compact />
                <SummaryStat label={selectionTotals.customers === 1 ? 'Customer' : 'Customers'} value={String(selectionTotals.customers)} compact />
                <SummaryStat label="Paid" value={formatMoney(selectionTotals.paid, selectionTotals.currency)} compact />
              </div>

              <div className="overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(7,59,131,0.04)]">
                <div className="hidden border-b border-black/[0.06] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-faint md:grid md:grid-cols-[1.25rem_minmax(0,1.15fr)_7.25rem_minmax(0,1.35fr)_7.5rem_5.75rem] md:gap-3">
                  <span />
                  <span>Customer</span>
                  <span>Date</span>
                  <span>Listing</span>
                  <span>Reference</span>
                  <span className="text-right">Amount</span>
                </div>
                {visible.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-ink-muted">No bookings match these filters.</p>
                ) : (
                  <ul>
                    {visible.map((row) => {
                      const selectable = row.eligiblePaid || row.eligibleUnpaid;
                      const selected = checked.has(row.id);
                      return (
                        <li key={row.id} className="border-b border-black/[0.05] last:border-b-0">
                          <label className={`block px-4 py-3 transition-colors ${selected ? 'bg-[#eef3f9]' : 'hover:bg-[#f7f8fa]'} ${selectable ? 'cursor-pointer' : 'cursor-default opacity-60'}`}>
                            <span className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 md:grid-cols-[1.25rem_minmax(0,1.15fr)_7.25rem_minmax(0,1.35fr)_7.5rem_5.75rem] md:items-center md:gap-3">
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 rounded border-black/30 text-[#073B83] focus:ring-[#073B83] md:mt-0"
                                checked={selected}
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
                              <span className="min-w-0">
                                <span className="block text-sm font-medium text-ink">{row.guestName}</span>
                                <span className="mt-0.5 block text-[13px] text-ink-muted md:hidden">
                                  {formatCancellationDate(row.date)}{row.startHm ? ` · ${row.startHm}` : ''}
                                </span>
                                <span className="block text-[13px] text-ink-muted md:hidden">
                                  {row.listingTitle}{row.optionLabel ? ` · ${row.optionLabel}` : ''}
                                </span>
                                <span className="block text-[12px] text-ink-faint md:hidden">
                                  {row.reference} · {row.guests} {row.guests === 1 ? 'guest' : 'guests'}
                                </span>
                                <span className="mt-0.5 hidden text-[12px] text-ink-faint md:block">
                                  {row.guests} {row.guests === 1 ? 'guest' : 'guests'}
                                </span>
                              </span>
                              <span className="hidden md:block">
                                <span className="block text-sm text-ink">{formatCancellationDate(row.date)}</span>
                                <span className="block text-[12px] text-ink-muted">{row.startHm || '—'}</span>
                              </span>
                              <span className="hidden min-w-0 md:block">
                                <span className="block text-sm text-ink">{row.listingTitle}</span>
                                {row.optionLabel ? <span className="block text-[12px] text-ink-muted">{row.optionLabel}</span> : null}
                              </span>
                              <span className="hidden text-sm text-ink md:block">{row.reference}</span>
                              <span className="text-right">
                                <span className="block text-sm font-medium tabular-nums text-ink">
                                  {row.eligiblePaid ? formatMoney(row.amountPaid, row.currency) : 'Unpaid'}
                                </span>
                                {!selectable ? <span className="block text-[12px] text-ink-faint">{row.blockReason || row.status}</span> : null}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>

          <section ref={(node) => { panes.current[1] = node; }} className={PANE} aria-label="Reason and policy" aria-hidden={step !== 1}>
            <div className={`${SHELL} py-6`}>
              <div className="mb-5">
                <h2 className="text-xl font-semibold tracking-tight text-ink">{STEP_INTRO[1].title}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-snug text-ink-muted">{STEP_INTRO[1].description}</p>
              </div>
              {paidFlow ? (
                <div className="grid items-stretch gap-5 lg:grid-cols-2">
                  <section className="flex h-full flex-col rounded-xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_2px_rgba(7,59,131,0.04)]">
                    <h3 className="text-sm font-semibold text-ink">Policy</h3>
                    <div className="mt-4 grid grid-cols-2 divide-x divide-black/[0.06]">
                      <p className="pr-4">
                        <span className="block text-[12px] text-ink-faint">Customer refunds</span>
                        <span className="mt-1 block text-xl font-semibold tabular-nums tracking-tight text-ink">{formatMoney(reasonTotals.refunds, reasonTotals.currency)}</span>
                      </p>
                      <p className="pl-4">
                        <span className="block text-[12px] text-ink-faint">Supplier fees</span>
                        <span className="mt-1 block text-xl font-semibold tabular-nums tracking-tight text-ink">{formatMoney(reasonTotals.fees, reasonTotals.currency)}</span>
                        <span className="mt-1 block text-[12px] text-ink-muted">{formatMoney(feePreview.feeAmount, feePreview.currency)} per paid booking</span>
                      </p>
                    </div>
                    <p className="mt-4 text-[13px] leading-snug text-ink-muted">{PARTNER_CANCEL_REQUEST_FEE_TIMING_NOTE}</p>
                    <button
                      type="button"
                      className="mt-3 text-[13px] font-medium text-[#073B83] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#073B83]"
                      aria-expanded={policyOpen}
                      onClick={() => setPolicyOpen((open) => !open)}
                    >
                      {policyOpen ? 'Hide policy details' : 'Policy details'}
                    </button>
                    {policyOpen ? (
                      <div className="mt-3 space-y-2 border-t border-black/[0.06] pt-3 text-[13px] leading-snug text-ink-muted">
                        <p>{PARTNER_CANCEL_REQUEST_REFUND_POLICY}</p>
                        <p>{PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE}</p>
                        <p>Policy {policy.policy_id}.</p>
                      </div>
                    ) : null}
                  </section>
                  <section className="h-full rounded-xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_2px_rgba(7,59,131,0.04)]">
                    <h3 className="text-sm font-semibold text-ink">Reason details</h3>
                    <div className="mt-4">
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
                    <div className="mt-4">
                      <div className="flex items-baseline justify-between gap-3">
                        <label className="text-[13px] font-medium text-ink" htmlFor="supplier-cancel-explanation">Explanation</label>
                        <p className={`text-[12px] tabular-nums ${explanationCount >= minChars ? 'text-ink-muted' : 'text-ink-faint'}`} aria-live="polite">
                          {explanationCount} / {minChars} characters
                        </p>
                      </div>
                      <textarea
                        id="supplier-cancel-explanation"
                        value={explanation}
                        onChange={(event) => setExplanation(event.target.value)}
                        rows={4}
                        className="tv-input mt-1.5 min-h-[7.5rem]"
                        placeholder="What happened, and why these travelers cannot take the booking."
                      />
                    </div>
                    <div className="mt-4">
                      <label className="text-[13px] text-ink-muted" htmlFor="supplier-cancel-evidence">Evidence notes, optional</label>
                      <textarea
                        id="supplier-cancel-evidence"
                        value={evidence}
                        onChange={(event) => setEvidence(event.target.value)}
                        rows={2}
                        className="tv-input mt-1.5"
                        placeholder="Weather notice, staff note, or other record."
                      />
                    </div>
                  </section>
                </div>
              ) : (
                <section className="rounded-xl border border-black/[0.06] bg-white p-5 text-sm leading-relaxed text-ink shadow-[0_1px_2px_rgba(7,59,131,0.04)]">
                  This unpaid hold has no completed payment. Releasing it does not create a refund or a supplier fee.
                  The traveler sees the cancellation on My bookings. {PARTNER_CANCELLATION_REQUEST_DELIVERY_NOTE}
                </section>
              )}
            </div>
          </section>

          <section ref={(node) => { panes.current[2] = node; }} className={PANE} aria-label="Review and confirm" aria-hidden={step !== 2}>
            <div className={`${SHELL} flex flex-col gap-5 py-6`}>
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-ink">{STEP_INTRO[2].title}</h2>
                <p className="mt-1 max-w-2xl text-sm leading-snug text-ink-muted">{STEP_INTRO[2].description}</p>
              </div>
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

              <div className="overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(7,59,131,0.04)]">
                <div className={`grid divide-y divide-black/[0.06] sm:divide-y-0 sm:divide-x ${resultRows.length ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4'}`}>
                  <SummaryStat label={resultRows.length ? 'Customers cancelled' : 'Customers'} value={String(previewTotals.customers)} />
                  <SummaryStat label="Bookings" value={String(resultRows.length ? resultCounts.total : reviewRows.length)} />
                  {resultRows.length ? (
                    <>
                      <SummaryStat label="Cancelled" value={String(resultCounts.cancelled)} />
                      <SummaryStat label="Not cancelled" value={String(resultCounts.notCancelled)} />
                    </>
                  ) : null}
                  <SummaryStat label={resultRows.length ? 'Refunds for cancelled bookings' : 'Customer refunds'} value={formatMoney(previewTotals.refunds, previewTotals.currency)} />
                  <SummaryStat label="Supplier fees" value={formatMoney(previewTotals.fees, previewTotals.currency)} />
                </div>
                <div className="grid gap-1 border-t border-black/[0.06] px-5 py-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-baseline sm:gap-4">
                  <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-ink-faint">Inventory</p>
                  <p className="text-sm leading-snug text-ink">
                    {previewTotals.guests} {previewTotals.guests === 1 ? 'guest' : 'guests'} released when a cancellation succeeds.
                    Other bookings on the same departure stay unless they are in this selection.
                  </p>
                </div>
              </div>

              <section className="overflow-hidden rounded-xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgba(7,59,131,0.04)]">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-5 py-3.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#073B83]"
                  aria-expanded={detailsOpen}
                  onClick={() => setDetailsOpen((open) => !open)}
                >
                  <span>
                    <span className="block text-sm font-semibold text-ink">Affected bookings</span>
                    <span className="mt-0.5 block text-[13px] text-ink-muted">{reviewRows.length} in this selection</span>
                  </span>
                  <span className="text-[13px] text-[#073B83]">{detailsOpen ? 'Hide' : 'Show'}</span>
                </button>
                {detailsOpen ? (
                  <ul className="border-t border-black/[0.06]">
                    {reviewRows.map((row) => {
                      const result = resultById.get(row.id);
                      const money = result && !result.ok
                        ? { refundAmount: 0, feeAmount: 0, currency: row.currency }
                        : cancellationMoneyPreview(row, reasonCode);
                      return (
                        <li key={row.id} className="grid gap-3 border-b border-black/[0.05] px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-start">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink">{row.guestName}</p>
                            <p className="mt-0.5 text-[13px] text-ink-muted">
                              {formatCancellationDate(row.date)}{row.startHm ? ` · ${row.startHm}` : ''}
                            </p>
                            <p className="text-[13px] text-ink-muted">
                              {row.listingTitle}{row.optionLabel ? ` · ${row.optionLabel}` : ''}
                            </p>
                            <p className="mt-0.5 text-[12px] text-ink-faint">
                              {row.reference} · {row.guests} {row.guests === 1 ? 'guest' : 'guests'}
                            </p>
                          </div>
                          <div className="text-[13px] leading-snug text-ink-muted">
                            <p>Refund <span className="font-medium tabular-nums text-ink">{formatMoney(money.refundAmount, money.currency)}</span></p>
                            <p>Fee <span className="font-medium tabular-nums text-ink">{formatMoney(money.feeAmount, money.currency)}</span></p>
                          </div>
                          <p className="break-words text-[13px] leading-snug text-ink sm:max-w-[16rem] sm:text-right">
                            {result ? (
                              <>
                                {result.ok ? 'Cancelled' : result.error || 'Not cancelled'}
                                <span className="mt-0.5 block text-[12px] text-ink-faint">{notificationLabel(result.notification)}</span>
                                <span className="mt-0.5 block text-[12px] text-ink-faint">{result.refundNote}</span>
                              </>
                            ) : (
                              <span className="text-ink-faint">Notification has not been sent</span>
                            )}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </section>

              {phase === 'form' || phase === 'failure' ? (
                <section className="rounded-xl border border-black/[0.06] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(7,59,131,0.04)]">
                  <h3 className="text-sm font-semibold text-ink">Confirmation</h3>
                  <label className="mt-3 flex items-start gap-3 text-sm leading-snug text-ink">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-black/30 text-[#073B83] focus:ring-[#073B83]"
                      checked={acknowledged}
                      onChange={(event) => setAcknowledged(event.target.checked)}
                    />
                    <span>I confirm this selection. Only these bookings will be submitted, and a later booking will not be added.</span>
                  </label>
                </section>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      <footer className="z-10 shrink-0 border-t border-black/[0.06] bg-white">
        <div className={`${SHELL} flex flex-wrap items-center justify-between gap-2 py-3`}>
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
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
            {step === 0 ? (
              <>
                <button
                  type="button"
                  className={SECONDARY_BTN}
                  disabled={!departure || !canSubmit}
                  onClick={() => departure && freezeAndContinue(departure.ids)}
                >
                  Cancel this departure
                </button>
                <button
                  type="button"
                  className={PRIMARY_BTN}
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
                className={PRIMARY_BTN}
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
                className={PRIMARY_BTN}
                disabled={!canSubmit || !acknowledged || (paidFlow && !reasonReady) || confirmOpen}
                onClick={() => setConfirmOpen(true)}
              >
                {phase === 'failure' ? 'Try again' : 'Confirm cancellation'}
              </button>
            ) : null}
            {phase === 'success' || phase === 'partial' ? (
              <button type="button" className={PRIMARY_BTN} onClick={onClose}>
                Done
              </button>
            ) : null}
          </div>
        </div>
      </footer>
      {confirmOpen ? (
        <CancellationConfirmModal
          phase={phase}
          bookings={reviewRows.length}
          guests={previewTotals.guests}
          refundLabel={formatMoney(previewTotals.refunds, previewTotals.currency)}
          feeLabel={formatMoney(previewTotals.fees, previewTotals.currency)}
          succeeded={resultCounts.cancelled}
          failed={resultCounts.notCancelled}
          failedReferences={reviewRows
            .filter((row) => resultById.get(row.id)?.ok === false)
            .map((row) => row.reference || row.id)}
          error={formError}
          onBack={() => {
            if (phase === 'processing') return;
            setConfirmOpen(false);
          }}
          onConfirm={() => void submit()}
          onDone={onClose}
          onViewResults={() => setConfirmOpen(false)}
        />
      ) : null}
    </div>
  );
}

function CancellationConfirmModal({
  phase,
  bookings,
  guests,
  refundLabel,
  feeLabel,
  succeeded,
  failed,
  failedReferences,
  error,
  onBack,
  onConfirm,
  onDone,
  onViewResults,
}: {
  phase: 'form' | 'processing' | 'success' | 'partial' | 'failure';
  bookings: number;
  guests: number;
  refundLabel: string;
  feeLabel: string;
  succeeded: number;
  failed: number;
  failedReferences: string[];
  error: string | null;
  onBack: () => void;
  onConfirm: () => void;
  onDone: () => void;
  onViewResults: () => void;
}) {
  const title =
    phase === 'processing'
      ? 'Cancelling bookings…'
      : phase === 'success'
        ? 'Cancellation completed'
        : phase === 'partial'
          ? 'Some bookings were not cancelled'
          : phase === 'failure'
            ? 'Cancellation was not completed'
            : 'Confirm cancellation';
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-confirm-title"
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.16)]"
      >
        <div className="flex items-start gap-3">
          {phase === 'processing' ? (
            <span
              className="mt-0.5 inline-block h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-[#073B83]/20 border-t-[#073B83] motion-reduce:animate-none"
              aria-hidden
            />
          ) : null}
          {phase === 'success' ? (
            <span className="tv-cancel-check mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-semibold text-white" aria-hidden>
              ✓
            </span>
          ) : null}
          {phase === 'partial' || phase === 'failure' ? (
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-semibold text-amber-800" aria-hidden>
              !
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 id="cancel-confirm-title" className="text-base font-semibold tracking-tight text-ink">{title}</h2>
            {phase === 'form' ? (
              <p className="mt-2 text-sm leading-snug text-ink-muted">
                {`${bookings} ${bookings === 1 ? 'booking' : 'bookings'} · ${guests} ${guests === 1 ? 'guest' : 'guests'}. Customer refund obligation ${refundLabel}. Supplier fees ${feeLabel}. This cannot be undone.`}
              </p>
            ) : null}
            {phase === 'processing' ? (
              <p className="mt-2 text-sm text-ink-muted" role="status">Cancelling bookings…</p>
            ) : null}
            {phase === 'success' || phase === 'partial' ? (
              <p className="mt-2 text-sm text-ink-muted" role="status">
                {succeeded} succeeded. {failed} failed.
              </p>
            ) : null}
            {phase === 'failure' && error ? (
              <p className="mt-2 text-sm text-ink" role="alert">{error}</p>
            ) : null}
            {phase === 'partial' && failedReferences.length ? (
              <p className="mt-2 text-sm text-ink">Not cancelled: {failedReferences.join(', ')}</p>
            ) : null}
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {phase === 'form' || phase === 'failure' ? (
            <button type="button" className={SECONDARY_BTN} onClick={onBack}>
              Back
            </button>
          ) : null}
          {phase === 'form' ? (
            <button type="button" className={PRIMARY_BTN} onClick={onConfirm}>
              Confirm cancellation
            </button>
          ) : null}
          {phase === 'failure' ? (
            <button type="button" className={PRIMARY_BTN} onClick={onConfirm}>
              Try again
            </button>
          ) : null}
          {phase === 'success' || phase === 'partial' ? (
            <>
              <button type="button" className={SECONDARY_BTN} onClick={onViewResults}>
                View results
              </button>
              <button type="button" className={PRIMARY_BTN} onClick={onDone}>
                Done
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <p className={compact ? 'px-4 py-3' : 'px-5 py-4'}>
      <span className="block text-[12px] text-ink-faint">{label}</span>
      <span className={`mt-1 block font-semibold tabular-nums tracking-tight text-ink ${compact ? 'text-base' : 'text-xl'}`}>{value}</span>
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
