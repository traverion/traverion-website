import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1810: partner Inbox thread list polish', () => {
  it('defines inbox list primitives', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('Phase 1810');
    expect(css).toContain('.tv-inbox-list');
    expect(css).toContain('.tv-inbox-thread');
  });

  it('separates preview from timestamp and marks unread/open', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierInbox.tsx'), 'utf8');
    expect(src).toContain('tv-inbox-list');
    expect(src).toContain('tv-inbox-thread__btn');
    expect(src).toContain("data-unread={unread ? 'true' : 'false'}");
    expect(src).toContain('<time');
    expect(src).toContain('dateTime={last.created_at}');
  });
});
