import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1819: booking message thread polish', () => {
  it('defines message bubble and composer classes', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('Phase 1819');
    expect(css).toContain('.tv-msg-bubble--mine');
    expect(css).toContain('.tv-msg-composer');
  });

  it('uses primary Send and shared bubble classes', () => {
    const src = readFileSync(resolve(__dirname, 'BookingMessageThread.tsx'), 'utf8');
    expect(src).toContain('tv-msg-bubble');
    expect(src).toContain('tv-msg-composer');
    expect(src).toContain('Send message');
    expect(src).toContain('tv-btn-primary');
    expect(src).not.toContain("'Post message'");
  });
});
