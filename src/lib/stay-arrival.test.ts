import { describe, expect, it } from 'vitest';
import { stayPublicArrivalNoteBlocker } from './stay-arrival';

describe('stayPublicArrivalNoteBlocker', () => {
  it('allows ordinary public notes', () => {
    expect(stayPublicArrivalNoteBlocker('Park in the marked bay by the porch.')).toBeNull();
  });

  it('blocks door codes in the public note', () => {
    expect(stayPublicArrivalNoteBlocker('Door code 4821 is on the lockbox')).toMatch(/door codes/i);
    expect(stayPublicArrivalNoteBlocker('PIN: 9911')).toMatch(/entry codes/i);
  });
});
