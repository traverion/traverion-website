import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');

describe('supplier cancellation batch', () => {
  const sql = readFileSync(
    resolve(root, 'supabase/migrations/20261113204341_supplier_cancellation_batch.sql'),
    'utf8'
  );
  const client = readFileSync(resolve(root, 'src/data/supabase-booking-ops.ts'), 'utf8');
  const page = readFileSync(resolve(root, 'src/pages/supplier/SupplierBookings.tsx'), 'utf8');
  const screen = readFileSync(
    resolve(root, 'src/components/supplier/SupplierCancellationWorkflow.tsx'),
    'utf8'
  );

  it('cancels only the submitted ids through the existing function', () => {
    expect(sql).toContain('public.request_supplier_cancellation(');
    expect(sql).toContain('exception');
    expect(sql).toContain('idempotency_key');
    expect(sql).toContain('replayed');
    expect(sql).not.toMatch(/booking_date/);
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('revoke all on table public.supplier_cancellation_batches from public, anon, authenticated');
    expect(sql).toContain('revoke all on function public.request_supplier_cancellation_batch(uuid[], text, text, text, text, jsonb) from anon');
    expect(sql).toContain('grant execute on function public.request_supplier_cancellation_batch(uuid[], text, text, text, text, jsonb) to authenticated');
  });

  it('the screen submits one snapshot and does not loop the old client batch', () => {
    expect(client).toContain("supabase.rpc('request_supplier_cancellation_batch'");
    expect(page).toContain('requestSupplierCancellationBatch');
    expect(page).not.toContain('batchCancelBookings');
    expect(page).toContain('SupplierCancellationWorkflow');
    expect(screen).toContain('Continue with selected');
    expect(screen).toContain('Cancel this departure');
    expect(screen).toContain('motion-reduce:transition-none');
    expect(screen).toContain('/ {minChars} characters');
    expect(screen).toContain('Confirm cancellation');
  });
});
