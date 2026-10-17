import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isStaleChunkMessage, staleChunkRecovery } from './stale-chunk-reload';

describe('stale chunk reload', () => {
  it('reloads once when a hashed module 404s after a deploy', () => {
    const message = 'Failed to fetch dynamically imported module: https://www.traverion.com/assets/TourDetails-Dp8F60d7.js';
    expect(isStaleChunkMessage(message)).toBe(true);
    expect(staleChunkRecovery(false, message)).toBe('reload');
    expect(staleChunkRecovery(true, message)).toBe('fallback');
    expect(staleChunkRecovery(false, 'Listing not found')).toBe('ignore');
  });

  it('installs the preload handler before the app renders', () => {
    const main = readFileSync(resolve(__dirname, '../main.tsx'), 'utf8');
    expect(main).toContain('installStaleChunkReload()');
    const helper = readFileSync(resolve(__dirname, 'stale-chunk-reload.ts'), 'utf8');
    expect(helper).toContain("addEventListener('vite:preloadError'");
    expect(helper).toContain('event.preventDefault()');
  });
});
