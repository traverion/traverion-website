import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isChunkLoadError } from './ChunkLoadErrorBoundary';

const root = dirname(fileURLToPath(import.meta.url));

describe('chunk load failures', () => {
  it('recognizes the production MIME and dynamic-import errors', () => {
    expect(
      isChunkLoadError(
        new TypeError(
          'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".'
        )
      )
    ).toBe(true);
    expect(
      isChunkLoadError(
        new TypeError('Failed to fetch dynamically imported module: https://partner.traverion.com/assets/SupplierInbox-CKgGAVEh.js')
      )
    ).toBe(true);
    expect(isChunkLoadError(new Error('Listing not found'))).toBe(false);
  });

  it('offers Retry as a document reload and does not reload by itself', () => {
    const src = readFileSync(join(root, 'ChunkLoadErrorBoundary.tsx'), 'utf8');
    expect(src).toContain('Retry');
    expect(src).toContain('window.location.reload()');
    expect(src).not.toContain('useEffect');
    expect(src).toContain('There is no automatic reload.');
  });
});

describe('SPA fallback does not swallow missing JavaScript', () => {
  it('keeps hashed asset caching and leaves /assets out of the HTML rewrite', () => {
    const vercel = JSON.parse(readFileSync(join(root, '../../vercel.json'), 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>;
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    const catchAll = vercel.rewrites.find((rule) => rule.destination === '/index.html' && rule.source.includes('(?!assets'));
    expect(catchAll?.source).toBe('/((?!assets/).*)');
    expect(vercel.rewrites.some((rule) => rule.source === '/(.*)' && rule.destination === '/index.html')).toBe(false);
    const assetCache = vercel.headers.find((rule) => rule.source === '/assets/(.*)');
    expect(assetCache?.headers.some((header) => header.value.includes('immutable'))).toBe(true);
  });
});
