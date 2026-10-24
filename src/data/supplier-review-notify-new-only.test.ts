import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('New-review supplier notify (create only)', () => {
  it('submitReview skips notify when a prior review row exists', () => {
    const src = readFileSync(resolve(__dirname, 'supabase-reviews.ts'), 'utf8');
    const fn = src.slice(src.indexOf('export async function submitReview'));
    expect(fn).toContain('isNewReview');
    expect(fn).toContain("eventType: 'new_review'");
    expect(fn).toMatch(/if \(isNewReview && savedReview\?\.id\)/);
    expect(fn).toContain('supplier:new_review:${savedReview.id}');
  });

  it('edge function writes supplier_activity_notifications for new_review', () => {
    const edge = readFileSync(
      resolve(__dirname, '../../supabase/functions/notify-supplier-event/index.ts'),
      'utf8'
    );
    expect(edge).toContain('supplier_activity_notifications');
    expect(edge).toContain('/partner/reviews?highlight=');
    expect(edge).toContain('New ${stars}-star review received');
  });
});
