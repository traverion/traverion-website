/**
 * P8.3 pilot isolation + LIVE Connect UX cert fixtures.
 * Static / source-level — no LIVE transfers, no READY period creation.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { humanizeConnectRequirements } from './connect-requirement-labels';

const root = resolve(__dirname, '../..');
const mig = readFileSync(
  resolve(root, 'supabase/migrations/309_p83_pilot_isolation_prepare.sql'),
  'utf8'
);
const adminEdge = readFileSync(
  resolve(root, 'supabase/functions/admin-supplier-verification/index.ts'),
  'utf8'
);
const adminUi = readFileSync(
  resolve(root, 'src/components/admin/AdminCommercialPanel.tsx'),
  'utf8'
);
const partnerSettings = readFileSync(
  resolve(root, 'src/components/supplier/IncomeFinancialSettings.tsx'),
  'utf8'
);

describe('P8.3 pilot isolation hardening', () => {
  it('migration defines preview + prepare with dry_run default and flag OFF', () => {
    expect(mig).toContain('preview_supplier_payout_pilot');
    expect(mig).toContain('prepare_supplier_payout_pilot');
    expect(mig).toContain("p_dry_run boolean default true");
    expect(mig).toContain("'payout_pilot_prepare_enabled'");
    expect(mig).toContain('pg_advisory_xact_lock');
    expect(mig).toContain('where e.id = v_sel.earning_item_id');
    expect(mig).toContain('pilot_isolation_violation');
    expect(mig).toContain('booking_ref_confirmation_mismatch');
    expect(mig).toContain('amount_confirmation_mismatch');
    expect(mig).toContain('pilot_ready_period_already_exists');
    expect(mig).toContain('connect_incomplete');
    expect(mig).not.toMatch(/value_int,\s*1/);
  });

  it('prepare allocates only the selected earning item', () => {
    expect(mig).toMatch(
      /update public\.supplier_earning_items e[\s\S]*where e\.id = v_sel\.earning_item_id/
    );
    expect(mig).toContain('would_reject_other_eligible');
    expect(mig).toContain('eligible_other_count');
  });

  it('admin edge exposes preview + dry-run prepare; blocks live execute in P8.3', () => {
    expect(adminEdge).toContain("'pilot_payout_preview'");
    expect(adminEdge).toContain("'pilot_payout_prepare'");
    expect(adminEdge).toContain('pilot_prepare_execution_blocked_in_p83');
    expect(adminEdge).toContain('p_dry_run: true');
    expect(adminEdge).toContain('preview is not authorization');
  });

  it('admin UI shows preview fields and dry-run authorization only', () => {
    expect(adminUi).toContain('pilot_payout_preview');
    expect(adminUi).toContain('Authorize dry-run (no READY)');
    expect(adminUi).toContain('pilotConfirmBookingRef');
    expect(adminUi).toContain('pilotConfirmAmountMinor');
    expect(adminUi).toContain('pilotDryRun: true');
    expect(adminUi).not.toContain('pilotDryRun: false');
  });

  it('partner settings uses Connect refresh + unified payout wizard', () => {
    expect(partnerSettings).toContain("invokeConnectSupplierOnboarding('refresh')");
    expect(partnerSettings).toContain('Continue setup');
    expect(partnerSettings).toContain('PayoutSetupWizard');
    expect(partnerSettings).toContain("connect !== 'return'");
  });

  it('humanizeConnectRequirements never surfaces representative PII fields', () => {
    const labels = humanizeConnectRequirements([
      'representative.first_name',
      'representative.last_name',
      'representative.dob.day',
      'external_account',
      'individual.verification.document',
    ]);
    expect(labels).toContain('Account representative details');
    expect(labels).toContain("Representative's date of birth");
    expect(labels).toContain('Bank account required');
    expect(labels).toContain('Identity verification');
    expect(labels.join(' ')).not.toMatch(/first_name|last_name|dob\.(day|month|year)/i);
  });

  it('documents Royal Nordic pilot selection fixture', () => {
    expect({
      selected: 'TV-FNFQEA87',
      selected_minor: 8500,
      excluded: 'TV-PDTAS6JD',
      excluded_minor: 10115,
      pilot_label: 'p81_rn_first_live',
    }).toMatchObject({
      selected: 'TV-FNFQEA87',
      selected_minor: 8500,
      excluded: 'TV-PDTAS6JD',
    });
  });
});
