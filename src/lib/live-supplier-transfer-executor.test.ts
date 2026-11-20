import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LIVE_SUPPLIER_TRANSFER_EXECUTION_APPROVED,
  classifySupplierTransferFailure,
  supplierTransferCreateParams,
  supplierTransferExecutionDecision,
  supplierTransferIdempotencyKey,
} from '../../supabase/functions/_shared/live-supplier-transfer-executor';

describe('production-safe supplier transfer executor', () => {
  it('keeps live execution unapproved', () => {
    expect(LIVE_SUPPLIER_TRANSFER_EXECUTION_APPROVED).toBe(false);
  });

  it('allows an isolated test batch only when the test flag and database switch are on', () => {
    expect(
      supplierTransferExecutionDecision({
        platformMode: 'test',
        transfersFlag: 'test',
        dbTransfersEnabled: 1,
        dbPayoutExecutionEnabled: 0,
      })
    ).toEqual({ allowed: true, environment: 'test', liveMoney: false });
  });

  it('refuses live mode while approval is false, even if every gate is on', () => {
    const decision = supplierTransferExecutionDecision({
      platformMode: 'live',
      transfersFlag: 'live',
      dbTransfersEnabled: 1,
      dbPayoutExecutionEnabled: 1,
      executionApproved: false,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.liveMoney).toBe(false);
    if (!decision.allowed) expect(decision.error).toMatch(/LIVE supplier payouts are not enabled/);
  });

  it('still refuses live mode when the approval flag is forced on without the database gates', () => {
    const decision = supplierTransferExecutionDecision({
      platformMode: 'live',
      transfersFlag: 'live',
      dbTransfersEnabled: 0,
      dbPayoutExecutionEnabled: 0,
      executionApproved: true,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.liveMoney).toBe(false);
  });

  it('builds a stable idempotency key and classifies a balance failure', () => {
    expect(supplierTransferIdempotencyKey('period-1', 1)).toBe('transfer:period-1:1');
    expect(supplierTransferIdempotencyKey('period-1', 2)).toBe('transfer:period-1:2');
    expect(classifySupplierTransferFailure('balance_insufficient')).toBe('insufficient_funds');
    expect(classifySupplierTransferFailure('card_declined')).toBe('transfer_failed');
  });

  it('allows live execution only when the code approval, live flag, and both gates are on', () => {
    expect(
      supplierTransferExecutionDecision({
        platformMode: 'live',
        transfersFlag: 'live',
        dbTransfersEnabled: 1,
        dbPayoutExecutionEnabled: 1,
        executionApproved: true,
      })
    ).toEqual({ allowed: true, environment: 'live', liveMoney: true });
    expect(LIVE_SUPPLIER_TRANSFER_EXECUTION_APPROVED).toBe(false);
    expect(
      supplierTransferExecutionDecision({
        platformMode: 'live',
        transfersFlag: 'live',
        dbTransfersEnabled: 1,
        dbPayoutExecutionEnabled: 1,
      }).allowed
    ).toBe(false);
  });

  it('stamps test metadata and does not add a commission surcharge', () => {
    const params = supplierTransferCreateParams({
      amountMinor: 1500,
      currency: 'EUR',
      destination: 'acct_test',
      payoutPeriodId: 'period-1',
      transferAttemptId: 'attempt-1',
      supplierId: 'supplier-1',
      environment: 'test',
    });
    expect(params.metadata.traverion_environment).toBe('test');
    expect(params.amount).toBe(1500);
    expect(JSON.stringify(params)).not.toMatch(/surcharge|application_fee/);
    const live = supplierTransferCreateParams({ ...{
      amountMinor: 1500,
      currency: 'EUR',
      destination: 'acct_test',
      payoutPeriodId: 'period-1',
      transferAttemptId: 'attempt-1',
      supplierId: 'supplier-1',
    }, environment: 'live' });
    expect(live.metadata.traverion_environment).toBe('live');
    expect(live.amount).toBe(1500);
    expect(JSON.stringify(live)).not.toMatch(/surcharge|application_fee/);
  });

  it('leaves the deployed executor hard-refusing live mode', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../../supabase/functions/execute-supplier-transfers/index.ts'),
      'utf8'
    );
    expect(source).toContain("stripeMoney.mode !== 'test'");
    expect(source).toContain('LIVE_SUPPLIER_TRANSFER_EXECUTION_APPROVED');
    expect(source).toContain('Stripe Connect transfers remain TEST-only');
    expect(source).toContain('supplierTransferExecutionDecision');
    expect(source).toContain('supplierTransferCreateParams');
    expect(source.indexOf('LIVE_SUPPLIER_TRANSFER_EXECUTION_APPROVED')).toBeLessThan(source.indexOf('new Stripe'));
  });
});
