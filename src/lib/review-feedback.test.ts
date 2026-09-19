import { describe, expect, it } from 'vitest';
import { reviewHasWrittenFeedback, reviewNeedsSupplierReply } from './review-feedback';

describe('review feedback', () => {
  it('treats star-only reviews as without written feedback', () => {
    expect(reviewHasWrittenFeedback({ title: null, comment: '' })).toBe(false);
    expect(reviewHasWrittenFeedback({ title: '  ', comment: '\n' })).toBe(false);
    expect(reviewHasWrittenFeedback({ title: 'Great', comment: '' })).toBe(true);
    expect(reviewHasWrittenFeedback({ title: null, comment: 'Loved it' })).toBe(true);
  });

  it('needs reply only for written reviews without a reply row', () => {
    const written = { id: 'r1', title: 'Nice', comment: '' };
    expect(reviewNeedsSupplierReply(written, {})).toBe(true);
    expect(reviewNeedsSupplierReply(written, { r1: { reply_text: 'Thanks' } })).toBe(false);
    expect(reviewNeedsSupplierReply({ id: 'r2', title: null, comment: '' }, {})).toBe(false);
  });
});
