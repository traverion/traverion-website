import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Phase 568: several Stripe/checkout payment-truth predicate modules exist
 * in two copies -- a Vitest-tested `src/lib/*.ts` file (the frontend build)
 * and a byte-for-byte "Mirror of src/lib/<name>.ts" copy under
 * `supabase/functions/_shared/*.ts` (the Deno edge-function runtime, which
 * cannot import from `src/` and has no test runner of its own in this
 * repo -- confirmed zero `*.test.ts` files exist anywhere under
 * supabase/functions/). The Deno copy is what actually runs against real
 * Stripe webhooks in production; the src/lib copy is only what Vitest
 * checks. Nothing before this phase verified the two ever stayed in sync
 * once written -- keeping them matched was a purely manual convention.
 *
 * That gap was not theoretical: at the time this test was written, two of
 * the nine existing mirror pairs had already drifted from each other in
 * currently-committed code (stay-checkout-guest.ts's Deno copy was missing
 * two exported aliases the src/lib copy had gained -- see the migration
 * companion fix in the same phase). A future bug fix applied to only one
 * side -- Vitest passes, the PR merges clean, and the edge function that
 * actually decides "was this payment legitimate" or "should we auto-refund
 * this charge" keeps running the stale logic in production with nothing
 * to say so.
 *
 * This test self-discovers every "Mirror of src/lib/<name>" file under
 * supabase/functions/_shared (rather than hardcoding today's list of nine),
 * so a future mirror pair is covered automatically, and asserts each pair's
 * code -- comments and formatting stripped -- is identical. It intentionally
 * does not try to execute the Deno file (Vitest runs under Node and the
 * Deno copies use bare https:// specifiers Node cannot resolve); a textual
 * normalized-equality check is sufficient to catch behavioral drift, since
 * these files are small, dependency-free, pure predicate functions.
 */

const here = dirname(fileURLToPath(import.meta.url));
const sharedDir = join(here, '../../supabase/functions/_shared');

const MIRROR_HEADER = /Mirror of src\/lib\/([\w.-]+\.ts) for Deno edge runtime/;

function discoverMirrorPairs(): Array<{ denoPath: string; denoFile: string; srcName: string }> {
  const entries = readdirSync(sharedDir).filter((f) => f.endsWith('.ts'));
  const pairs: Array<{ denoPath: string; denoFile: string; srcName: string }> = [];
  for (const denoFile of entries) {
    const denoPath = join(sharedDir, denoFile);
    const content = readFileSync(denoPath, 'utf8');
    const match = content.match(MIRROR_HEADER);
    if (match) {
      pairs.push({ denoPath, denoFile, srcName: match[1] });
    }
  }
  return pairs;
}

/** Strip comments and collapse whitespace so only real code is compared. */
function normalize(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block comments (incl. JSDoc)
    .replace(/\/\/[^\n]*/g, ' ') // line comments
    // Phase 1527: Deno uses ./shared imports; Vitest src twins reach the same
    // modules via ../../supabase/functions/_shared/ — treat as equivalent.
    .replace(
      /from\s+['"]\.\.\/\.\.\/supabase\/functions\/_shared\/([\w.-]+\.ts)['"]/g,
      "from './$1'"
    )
    .replace(/\s+/g, ' ')
    .trim();
}

describe('Deno edge-function mirrors stay in sync with their Vitest-tested src/lib twins', () => {
  const pairs = discoverMirrorPairs();

  it('found at least one mirror pair to check (this test cannot silently check nothing)', () => {
    expect(pairs.length).toBeGreaterThan(0);
  });

  for (const { denoPath, denoFile, srcName } of pairs) {
    it(`${denoFile} matches src/lib/${srcName} (comments/formatting aside)`, () => {
      const srcPath = join(here, srcName);
      let srcContent: string;
      try {
        srcContent = readFileSync(srcPath, 'utf8');
      } catch {
        throw new Error(
          `supabase/functions/_shared/${denoFile} claims to mirror src/lib/${srcName}, but that file does not exist. Either the src/lib file was renamed/removed and the Deno mirror header is stale, or the mirror was never actually paired correctly.`
        );
      }
      const denoContent = readFileSync(denoPath, 'utf8');
      expect(
        normalize(denoContent),
        `supabase/functions/_shared/${denoFile} has drifted from src/lib/${srcName}. ` +
          `The Deno copy runs against real Stripe webhooks in production and has no test coverage of its own -- ` +
          `update it to match src/lib/${srcName} (or update both together) before merging.`
      ).toBe(normalize(srcContent));
    });
  }
});
