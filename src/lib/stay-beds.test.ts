import { describe, expect, it } from 'vitest';
import {
  applySleepingAreas,
  stayBedCount,
  stayBedSummary,
  stayCapacityWarning,
  stayPdpBedroomCount,
  stayPdpSleepingAreas,
  staySleepCapacity,
} from './stay-beds';

describe('stay bed arrangements', () => {
  it('counts beds and sleeping places separately', () => {
    const mix = { queen: 1, single: 2 };
    expect(stayBedCount(mix)).toBe(3);
    expect(staySleepCapacity(mix)).toBe(4);
    expect(stayBedSummary(mix)).toBe('2 single beds, 1 queen bed');
  });

  it('warns when 8 guests share one single bed and allows two people on one double', () => {
    expect(stayCapacityWarning(8, { single: 1 })).toMatch(/sleep only 1/);
    expect(stayCapacityWarning(8, undefined)).toMatch(/does not set sleeping capacity/);
    expect(stayCapacityWarning(2, { double: 1 })).toBeNull();
  });

  it('keeps a saved bed mix when an empty sleeping area is added', () => {
    const mix = { double: 1, single: 1 };
    const next = applySleepingAreas(
      { sleepingAreas: [], bedMix: mix, beds: 2 },
      [{ id: 'room-2', name: 'Bedroom 2', beds: [] }]
    );
    expect(next.bedMix).toEqual(mix);
    expect(next.beds).toBe(2);
    expect(next.sleepingAreas.map((area) => area.id)).toEqual(['room-2']);
  });

  it('aligns PDP bedroom count with configured sleeping areas', () => {
    const areas = [
      { id: 'b1', name: 'Bedroom 1', beds: [{ kind: 'double' as const, count: 1 }] },
      { id: 'b2', name: 'Bedroom 2', beds: [] },
      { id: 'lr', name: 'Living room', beds: [{ kind: 'sofa' as const, count: 1 }] },
    ];
    expect(stayPdpSleepingAreas({ sleepingAreas: areas, bedMix: null }).map((a) => a.id)).toEqual([
      'b1',
      'b2',
      'lr',
    ]);
    expect(stayPdpBedroomCount({ bedrooms: 5, sleepingAreas: areas, bedMix: null })).toBe(2);
    expect(stayPdpBedroomCount({ bedrooms: 3, sleepingAreas: [], bedMix: null })).toBe(3);
  });
});

