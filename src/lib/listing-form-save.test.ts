import { describe, expect, it } from 'vitest';
import { applyListingSaveStatus } from './listing-form-save';

describe('applyListingSaveStatus', () => {
  it('keeps mid-save field edits and only updates status', () => {
    const duringSave = { status: 'draft' as const, title: 'Updated while saving' };
    expect(applyListingSaveStatus(duringSave, 'published')).toEqual({
      status: 'published',
      title: 'Updated while saving',
    });
  });

  it('returns the same object when status already matches', () => {
    const current = { status: 'published' as const, title: 'Live' };
    expect(applyListingSaveStatus(current, 'published')).toBe(current);
  });
});
