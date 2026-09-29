import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1703: verification_submitted allows supplier team JWT', () => {
  it('edge self-notify path checks supplier_team_members after owner mismatch', () => {
    const src = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-supplier-event/index.ts'),
      'utf8'
    );
    expect(src).toContain('Phase 1703');
    const block = src.slice(
      src.indexOf('if (isSupplierSelfNotifyEvent(payload.eventType))'),
      src.indexOf('let allowCallerFieldDiffs = false')
    );
    expect(block).toContain('supplier_team_members');
    expect(block).toContain(".eq('supplier_id', String(payload.supplierId).trim())");
    expect(block).toContain(".eq('user_id', callerId)");
  });
});
