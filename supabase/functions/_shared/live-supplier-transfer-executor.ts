/**
 * Production-safe supplier transfer decision.
 * The running execute-supplier-transfers function still hard-refuses LIVE mode.
 * This module is the activation contract: live money stays impossible until
 * LIVE_SUPPLIER_TRANSFER_EXECUTION_APPROVED is changed in code after an explicit approval,
 * and both database gates plus the live env flag are on.
 * It does not call Stripe.
 */

export const LIVE_SUPPLIER_TRANSFER_EXECUTION_APPROVED = false;

export type SupplierTransferDecision =
  | {
      allowed: true;
      environment: 'test';
      liveMoney: false;
    }
  | {
      allowed: false;
      environment: 'test' | 'live';
      liveMoney: false;
      status: 503;
      error: string;
    };

export function supplierTransferExecutionDecision(input: {
  platformMode: string;
  transfersFlag: string | null | undefined;
  dbTransfersEnabled: number | null | undefined;
  dbPayoutExecutionEnabled: number | null | undefined;
  executionApproved?: boolean;
}): SupplierTransferDecision {
  const mode = input.platformMode.trim().toLowerCase();
  const flag = (input.transfersFlag ?? '').trim().toLowerCase();
  const approved = input.executionApproved ?? LIVE_SUPPLIER_TRANSFER_EXECUTION_APPROVED;

  if (mode === 'test') {
    if (flag !== 'test') {
      return {
        allowed: false,
        environment: 'test',
        liveMoney: false,
        status: 503,
        error: 'Stripe Connect transfers disabled. Set STRIPE_CONNECT_TRANSFERS_ENABLED=test to run TEST transfers only.',
      };
    }
    if (Number(input.dbTransfersEnabled) !== 1) {
      return {
        allowed: false,
        environment: 'test',
        liveMoney: false,
        status: 503,
        error: 'DB kill switch stripe_connect_transfers_enabled is not 1',
      };
    }
    return { allowed: true, environment: 'test', liveMoney: false };
  }

  if (!approved) {
    return {
      allowed: false,
      environment: 'live',
      liveMoney: false,
      status: 503,
      error: 'Stripe Connect transfers remain TEST-only. LIVE supplier payouts are not enabled.',
    };
  }
  if (flag !== 'live' || Number(input.dbTransfersEnabled) !== 1 || Number(input.dbPayoutExecutionEnabled) !== 1) {
    return {
      allowed: false,
      environment: 'live',
      liveMoney: false,
      status: 503,
      error: 'LIVE supplier transfers stay closed until both payout gates and the live transfer flag are on.',
    };
  }
  return {
    allowed: false,
    environment: 'live',
    liveMoney: false,
    status: 503,
    error: 'LIVE supplier payouts are not enabled.',
  };
}

export function supplierTransferIdempotencyKey(payoutPeriodId: string, attemptNumber: number): string {
  const period = payoutPeriodId.trim();
  const attempt = Number.isInteger(attemptNumber) && attemptNumber > 0 ? attemptNumber : 1;
  return `transfer:${period}:${attempt}`;
}

export function classifySupplierTransferFailure(code: string | null | undefined): 'insufficient_funds' | 'transfer_failed' {
  return code === 'balance_insufficient' ? 'insufficient_funds' : 'transfer_failed';
}

export function supplierTransferCreateParams(input: {
  amountMinor: number;
  currency: string;
  destination: string;
  payoutPeriodId: string;
  transferAttemptId: string;
  supplierId: string;
  environment: 'test';
}): {
  amount: number;
  currency: string;
  destination: string;
  transfer_group: string;
  metadata: Record<string, string>;
} {
  return {
    amount: input.amountMinor,
    currency: input.currency.toLowerCase(),
    destination: input.destination,
    transfer_group: `period_${input.payoutPeriodId}`,
    metadata: {
      traverion_payout_period_id: input.payoutPeriodId,
      traverion_transfer_attempt_id: input.transferAttemptId,
      traverion_supplier_id: input.supplierId,
      traverion_environment: input.environment,
    },
  };
}
