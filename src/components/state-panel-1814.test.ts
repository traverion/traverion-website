import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 1814: shared empty/error state polish', () => {
  it('defines tv-state-panel primitives', () => {
    const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
    expect(css).toContain('Phase 1814');
    expect(css).toContain('.tv-state-panel');
    expect(css).toContain('.tv-state-panel__icon--empty');
    expect(css).toContain('.tv-state-panel__icon--error');
  });

  it('EmptyState and ErrorState share the panel surface', () => {
    const empty = readFileSync(resolve(__dirname, 'EmptyState.tsx'), 'utf8');
    const error = readFileSync(resolve(__dirname, 'ErrorState.tsx'), 'utf8');
    expect(empty).toContain('tv-state-panel');
    expect(empty).toContain('tv-state-panel__icon--empty');
    expect(error).toContain('tv-state-panel');
    expect(error).toContain('tv-state-panel__icon--error');
    expect(error).toContain('Try again');
  });
});
