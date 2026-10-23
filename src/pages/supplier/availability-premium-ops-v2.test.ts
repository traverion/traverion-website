import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import AvailabilityAgendaView from './AvailabilityAgendaView';
import AvailabilityWeekView from './AvailabilityWeekView';
import AvailabilityOccupancyMeter from './AvailabilityOccupancyMeter';
import type { WorkspaceDeparture } from './availabilityWorkspaceModel';

const sample: WorkspaceDeparture = {
  key: 'l1-o1-s1-2026-10-21-09:00',
  iso: '2026-10-21',
  listingId: 'l1',
  listingTitle: 'Harbour Walk',
  optionId: 'o1',
  optionName: 'Morning',
  scheduleId: 's1',
  scheduleName: 'Daily',
  startTimeHm: '09:00',
  capacity: 16,
  remaining: 12,
  booked: 4,
  cutoffHours: 24,
  cutoffLabel: '24h before',
  status: 'available',
  dayCapacityOverride: null,
};

describe('Departures & Availability premium ops redesign', () => {
  it('uses Partner hero, workspace shell, and sans title', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierAvailability.tsx'), 'utf8');
    expect(src).toContain('SupplierPageHero');
    expect(src).toContain('sansTitle');
    expect(src).toContain('Capacity, cutoffs, and booked seats by departure.');
    expect(src).toContain('partner-avail-workspace');
    expect(src).toContain('Reset filters');
    expect(src).toContain('shiftWeekRange');
    expect(src).toContain('AvailabilityAgendaView');
    expect(src).toContain('AvailabilityWeekView');
    const agenda = readFileSync(resolve(__dirname, 'AvailabilityAgendaView.tsx'), 'utf8');
    expect(agenda).toContain('AvailabilityOccupancyMeter');
  });

  it('removes repetitive Open fallback for tour month cells', () => {
    const src = readFileSync(resolve(__dirname, 'SupplierAvailability.tsx'), 'utf8');
    expect(src).toContain('No schedule');
    expect(src).toContain('viewingAll');
    // Stay nights may still say Open; tour fallback must not.
    const tourFallback = src.includes("Open\n                    </span>\n                  ) : cell.inMonth && !stayCalendar");
    expect(tourFallback).toBe(false);
  });

  it('defines occupancy meter and workspace styles', () => {
    const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
    expect(css).toContain('.partner-avail-workspace');
    expect(css).toContain('.tv-avail-meter');
    expect(css).toContain('prefers-reduced-motion');
  });

  it('renders agenda with capacity meter and date grouping', () => {
    const html = renderToStaticMarkup(
      createElement(AvailabilityAgendaView, {
        rows: [sample, { ...sample, key: 'k2', booked: 0, remaining: 16, startTimeHm: '14:00' }],
        selectedKeys: new Set(),
        onToggleKey: () => undefined,
        onToggleDate: () => undefined,
        onOpenDate: () => undefined,
        canEdit: true,
      })
    );
    expect(html).toContain('Harbour Walk');
    expect(html).toContain('09:00');
    expect(html).toContain('tv-avail-meter');
    expect(html).toContain('2 departures');
    expect(html).toContain('4 guest');
  });

  it('renders week tiles with occupancy and overflow control', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      ...sample,
      key: `k-${i}`,
      startTimeHm: `${9 + i}:00`.padStart(5, '0'),
    }));
    const html = renderToStaticMarkup(
      createElement(AvailabilityWeekView, {
        weekFromIso: '2026-10-19',
        todayIso: '2026-10-21',
        rows: many,
        onOpenDate: () => undefined,
      })
    );
    expect(html).toContain('tv-avail-week__tile');
    expect(html).toContain('+2 more');
    expect(html).toContain('tv-avail-meter');
  });

  it('marks occupancy meter muted when not bookable', () => {
    const html = renderToStaticMarkup(
      createElement(AvailabilityOccupancyMeter, {
        booked: 16,
        capacity: 16,
        bookable: false,
      })
    );
    expect(html).toContain('tv-avail-meter--muted');
    expect(html).toContain('not bookable');
  });
});
