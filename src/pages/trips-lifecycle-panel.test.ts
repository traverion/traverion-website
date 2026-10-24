import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Trips lifecycle-aware expanded panel', () => {
  const src = readFileSync(resolve(__dirname, 'MyBookings.tsx'), 'utf8');
  const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

  it('adapts tabs and prep content by trip view', () => {
    expect(src).toContain("data-trip-lifecycle={tripView}");
    expect(src).toContain("tripView === 'upcoming'");
    expect(src).toContain("tripView === 'past'");
    expect(src).toContain("tripView === 'cancelled'");
    expect(src).toContain('View cancellation details');
    expect(src).toContain('How was the experience?');
    expect(src).toContain('How was your stay?');
    expect(src).toContain('Report a problem');
    // Past/cancelled drop Details tab; upcoming keeps prep + cancel surfaces.
    expect(src).toMatch(/tripView === 'upcoming'[\s\S]{0,80}\['overview', 'Overview'\][\s\S]{0,80}\['details', 'Details'\]/);
    expect(src).toContain('getSelfCancelAvailable(b)');
    expect(src).toMatch(
      /tripView === 'upcoming'[\s\S]{0,400}liveTrip[\s\S]{0,200}getSelfCancelAvailable\(b\)/
    );
  });

  it('uses compact toolbar and inline card actions', () => {
    expect(css).toContain('.tv-trips-toolbar');
    expect(css).toContain('.tv-trip-card__actions');
    expect(css).toContain('.tv-trip-card__review-invite');
    expect(src).toContain('tv-trips-toolbar');
    expect(src).not.toContain('tv-trip-card__review-bar');
  });
});
