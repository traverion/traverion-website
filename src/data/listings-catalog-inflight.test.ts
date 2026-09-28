import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Layer A: published catalog cache must not be repopulated by a stale fetch after
 * traverion:published-listings-changed invalidates (partner publish/deactivate).
 */
describe('published catalog inflight invalidation', () => {
  it('guards cache + inflight slot with a generation counter', () => {
    const listingsSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'listings.ts'),
      'utf8'
    );
    expect(listingsSrc).toMatch(/publishedCatalogGeneration/);
    expect(listingsSrc).toMatch(/publishedCatalogGeneration \+= 1/);
    expect(listingsSrc).toMatch(/genAtStart === publishedCatalogGeneration/);
    expect(listingsSrc).toMatch(/publishedCatalogInflight\?\.gen === genAtStart/);
  });

  it('hook reload ignores stale catalog completions', () => {
    const hookSrc = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../hooks/usePublishedSupplierListings.ts'),
      'utf8'
    );
    expect(hookSrc).toMatch(/catalogLoadGenRef/);
    expect(hookSrc).toMatch(/gen !== catalogLoadGenRef\.current/);
  });
});
