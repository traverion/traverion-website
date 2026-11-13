import { describe, expect, it } from 'vitest';
import { supplierCancellationFeeEur } from './cancellation-policy';
import {
  buildCancellationCandidate,
  cancellationRunPhase,
  classifyCancellationSelection,
  entireDepartureSelection,
  explicitCancellationSelection,
  filterCancellationCandidates,
  frozenCancellationSelection,
  parseCancellationBatchResults,
  supplierCancellationExplanationMin,
  supplierCancellationExplanationReady,
  cancellationMoneyPreview,
  type CancellationCandidate,
} from './supplier-cancellation-workflow';

function row(partial: Partial<CancellationCandidate> & Pick<CancellationCandidate, 'id'>): CancellationCandidate {
  return buildCancellationCandidate({
    id: partial.id,
    reference: partial.reference ?? partial.id,
    guestName: partial.guestName ?? 'Aino',
    guestEmail: partial.guestEmail ?? `${partial.id}@example.com`,
    guests: partial.guests ?? 2,
    status: partial.status ?? 'confirmed',
    paymentStatus: partial.paymentStatus ?? 'paid',
    amountPaid: partial.amountPaid ?? 99,
    currency: partial.currency ?? 'EUR',
    listingId: partial.listingId ?? 'listing-1',
    listingTitle: partial.listingTitle ?? 'Northern Lights',
    optionId: partial.optionId ?? 'opt-1',
    optionLabel: partial.optionLabel ?? 'Standard',
    family: partial.family ?? 'tour',
    date: partial.date ?? '2026-12-15',
    startHm: partial.startHm ?? '20:00',
  });
}

describe('supplier cancellation workflow', () => {
  const pool = [
    row({ id: 'a', guestEmail: 'a@example.com' }),
    row({ id: 'b', guestEmail: 'a@example.com', startHm: '18:30', optionId: 'opt-2' }),
    row({ id: 'c', paymentStatus: 'pending', status: 'pending', amountPaid: 0 }),
    row({ id: 'd', status: 'cancelled', paymentStatus: 'paid' }),
  ];

  it('keeps the existing explanation minimum and fee', () => {
    expect(supplierCancellationExplanationMin('OTHER')).toBe(12);
    expect(supplierCancellationExplanationMin('FORCE_MAJEURE')).toBe(24);
    expect(supplierCancellationExplanationReady('OTHER', 'short text ok')).toBe(true);
    expect(supplierCancellationExplanationReady('FORCE_MAJEURE', 'too short for force')).toBe(false);
    expect(cancellationMoneyPreview(pool[0], 'OTHER').feeAmount).toBe(supplierCancellationFeeEur('OTHER'));
    expect(cancellationMoneyPreview(pool[0], 'UNSAFE_WEATHER').feeAmount).toBe(0);
    expect(cancellationMoneyPreview(pool[0], 'OTHER').refundAmount).toBe(99);
    expect(cancellationMoneyPreview(pool[2], 'OTHER').refundAmount).toBe(0);
  });

  it('freezes the confirmed ids and ignores a booking that appears later', () => {
    const confirmed = explicitCancellationSelection(pool, ['a', 'd', 'missing']);
    expect(confirmed).toEqual(['a']);
    const later = [...pool, row({ id: 'new' })];
    expect(frozenCancellationSelection(confirmed, later)).toEqual(['a']);
    expect(frozenCancellationSelection(['a', 'new'], later)).toEqual(['a', 'new']);
    expect(frozenCancellationSelection(['a'], pool)).toEqual(['a']);
  });

  it('selects an entire departure only when every visible paid booking shares it', () => {
    const same = filterCancellationCandidates(pool, {
      query: '',
      family: 'tour',
      listingId: 'listing-1',
      optionId: 'opt-1',
      dateFrom: '2026-12-15',
      dateTo: '2026-12-15',
      startHm: '20:00',
      status: 'paid',
    });
    expect(entireDepartureSelection(same)?.ids).toEqual(['a']);
    expect(entireDepartureSelection(pool.filter((item) => item.eligiblePaid))).toBeNull();
  });

  it('separates paid batches from unpaid holds and reports partial results', () => {
    expect(classifyCancellationSelection([pool[0], pool[1]])).toBe('paid');
    expect(classifyCancellationSelection([pool[2]])).toBe('unpaid');
    expect(classifyCancellationSelection([pool[2], { ...pool[2], id: 'c2' }])).toBe('unpaid_many');
    expect(classifyCancellationSelection([pool[0], pool[2]])).toBe('mixed');
    expect(cancellationRunPhase([{ ok: true }, { ok: false }])).toBe('partial');
    expect(cancellationRunPhase([{ ok: false }])).toBe('failure');
    expect(cancellationRunPhase([{ ok: true }])).toBe('success');
    expect(parseCancellationBatchResults([
      { booking_id: 'a', ok: true, replayed: false, auto_refund_queued: true },
      { ok: false },
    ])).toEqual([
      expect.objectContaining({ bookingId: 'a', ok: true, autoRefundQueued: true }),
    ]);
  });
});
