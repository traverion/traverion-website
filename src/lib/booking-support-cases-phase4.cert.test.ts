import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

describe('Phase 4: booking support cases & customer protection', () => {
  const mig = readFileSync(
    resolve(root, 'supabase/migrations/269_booking_support_cases_phase4.sql'),
    'utf8'
  );
  const trips = readFileSync(resolve(root, 'src/pages/MyBookings.tsx'), 'utf8');
  const panel = readFileSync(
    resolve(root, 'src/components/BookingSupportCasePanel.tsx'),
    'utf8'
  );
  const admin = readFileSync(
    resolve(root, 'src/components/admin/AdminSupportCasesPanel.tsx'),
    'utf8'
  );
  const edge = readFileSync(
    resolve(root, 'supabase/functions/process-support-case-escalations/index.ts'),
    'utf8'
  );
  const adminEdge = readFileSync(
    resolve(root, 'supabase/functions/admin-supplier-verification/index.ts'),
    'utf8'
  );
  const ensure = mig;

  it('migration defines cases, 48h escalation, and PI refund dedupe', () => {
    expect(mig).toContain('booking_support_cases');
    expect(mig).toContain('open_booking_support_case');
    expect(mig).toContain('respond_booking_support_case');
    expect(mig).toContain('admin_resolve_booking_support_case');
    expect(mig).toContain('process_overdue_booking_support_cases');
    expect(mig).toContain('operator_no_show');
    expect(mig).toContain("interval '48 hours'");
    expect(mig).toContain('customer_support_case');
    expect(mig).toContain('shared_payment_intent');
    expect(mig).toContain('hold_is_internal_only');
    expect(ensure).toContain("r.idempotency_key like 'cancel-refund:%'");
  });

  it('does not auto-refund on 48h escalation', () => {
    expect(mig).toContain('No supplier response within 48 hours');
    expect(mig).not.toMatch(
      /process_overdue_booking_support_cases[\s\S]*ensure_booking_cancel_refund_instruction/
    );
  });

  it('customer Trips entry points and admin queue exist', () => {
    expect(panel).toContain('Report a booking problem');
    expect(panel).toContain('Contact operator');
    expect(panel).toContain('Contact Traverion Support');
    expect(trips).toContain('BookingSupportCasePanel');
    expect(admin).toContain('Approve full refund');
    expect(admin).toContain('Internal payout holds');
    expect(adminEdge).toContain('support_cases_list');
    expect(adminEdge).toContain('support_case_resolve');
  });

  it('escalation edge + workflow', () => {
    expect(edge).toContain('process_overdue_booking_support_cases');
    const wf = readFileSync(
      resolve(root, '.github/workflows/process-support-case-escalations.yml'),
      'utf8'
    );
    expect(wf).toContain("cron: '18 * * * *'");
  });
});
