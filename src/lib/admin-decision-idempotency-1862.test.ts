import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Phase 1862: admin decision already_sent must not mutate first', () => {
  const src = readFileSync(
    resolve(__dirname, '../../supabase/functions/admin-supplier-verification/index.ts'),
    'utf8'
  );

  for (const action of ['approve_business', 'reject_business', 'approve_payout', 'reject_payout'] as const) {
    it(`${action}: alreadyEmailed returns before supplier_profiles update`, () => {
      const start = src.indexOf(`if (body.action === '${action}')`);
      expect(start).toBeGreaterThan(-1);
      const next = src.indexOf('if (body.action ===', start + 10);
      const block = next === -1 ? src.slice(start) : src.slice(start, next);
      const alreadyIdx = block.indexOf('const alreadyEmailed');
      const updateIdx = block.indexOf('.update({');
      expect(alreadyIdx).toBeGreaterThan(-1);
      expect(updateIdx).toBeGreaterThan(-1);
      expect(alreadyIdx).toBeLessThan(updateIdx);
      expect(block).toContain("reason: 'already_sent'");
    });
  }
});
