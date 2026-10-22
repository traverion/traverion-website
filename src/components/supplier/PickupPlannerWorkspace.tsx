import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ArrowLeft, ChevronDown, MapPin, Printer, Download } from 'lucide-react';
import PickupLocationSearch from '../checkout/PickupLocationSearch';
import PickupCoverageMap from './PickupCoverageMap';
import PartnerTimeSelect from './PartnerTimeSelect';
import { placesSearchConfigured, reverseGeocode } from '../../lib/places-client';
import { haversineKm, type PickupArea, type TravelerPickupPoint } from '../../lib/pickup-area';
import {
  bookingFulfillment,
  bookingPickupOpsStatus,
  confirmedPickupPoint,
  configuredMeetingTimeHm,
  departureOpsStatus,
  departureStartHm,
  effectiveMeetingTimeHm,
  formatPickupPlannerDateHeading,
  groupDeparturesByDateKey,
  operationalPickupTimeHm,
  paginateDayGroups,
  pickupDepartureKey,
  pickupOpsNeedsAction,
  pickupOpsStatusLabel,
  pickupStopKey,
  PICKUP_PLANNER_DAYS_PER_PAGE,
  stopSortMinutes,
  type PickupOpsStatus,
} from '../../lib/pickup-planner';
import {
  guestPhoneFromBookingNotes,
  parseBookingPickupInstructionsOverride,
  parsePickupDraft,
} from '../../lib/booking-notes';
import {
  displayListingTitleFromPurchase,
  displayOptionLabelFromPurchase,
  isPurchaseSnapshot,
} from '../../lib/purchase-snapshot';
import { formatBookingParticipantsLabel } from '../../lib/participant-mix';
import { travelerPublicBookingReference } from '../../lib/public-booking-reference';
import type { BookingRow } from '../../data/supabase-bookings';
import type { SaveSupplierPickupInput } from '../../data/supabase-bookings';

type OptionMeta = {
  id: string;
  label: string;
  fulfillment: 'pickup' | 'meeting_point' | null;
  area: PickupArea | null;
  instructions: string;
};

export type PickupSaveResult = {
  ok: boolean;
  error?: string;
  notified?: boolean;
  notifyError?: string | null;
};

type Props = {
  bookings: BookingRow[];
  titles: Record<string, string>;
  thumbs: Record<string, string>;
  optionsByListing: Record<string, OptionMeta[]>;
  meetingPoints?: Record<string, string>;
  departureId: string | null;
  manageId: string | null;
  canEdit: boolean;
  page?: number;
  onPageChange?: (page: number) => void;
  onOpenDeparture: (id: string) => void;
  onBack: () => void;
  onManage: (bookingId: string | null) => void;
  onMessage: (bookingId: string) => void;
  onSave: (bookingId: string, input: SaveSupplierPickupInput) => Promise<PickupSaveResult>;
  onSaveMany: (bookingIds: string[], timeHm: string, notify: boolean) => Promise<PickupSaveResult>;
  onExport?: () => void;
  exportDisabled?: boolean;
  onPrint?: () => void;
  listingActions?: ReactNode;
};

function guestCount(rows: BookingRow[]): number {
  return rows.reduce((sum, row) => sum + Number(row.guests ?? 0), 0);
}

function referenceLabel(b: BookingRow): string {
  return (
    travelerPublicBookingReference(b.public_reference) ||
    (typeof b.booking_number === 'number' ? `#${b.booking_number}` : 'Booking')
  );
}

function optionFor(b: BookingRow, options: OptionMeta[]): OptionMeta | null {
  const snap = isPurchaseSnapshot(b.purchase_snapshot) ? b.purchase_snapshot : null;
  const id = (snap?.optionId || b.booking_option_id || '').trim();
  return options.find((option) => option.id === id) ?? null;
}

function splitAddress(address: string): { name: string; rest: string } {
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return { name: 'Location not set', rest: '' };
  return { name: parts[0], rest: parts.slice(1).join(', ') };
}

function StatusPill({ status }: { status: PickupOpsStatus }) {
  const warn = pickupOpsNeedsAction(status);
  return (
    <span className={`tv-pickup-status ${warn ? 'tv-pickup-status--warn' : 'tv-pickup-status--ok'}`}>
      {warn ? <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden strokeWidth={2.25} /> : null}
      {pickupOpsStatusLabel(status)}
    </span>
  );
}

function mapsUrl(address: string, lat: number | null, lng: number | null): string {
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function suggestedPickupTimes(departureHm: string): string[] {
  const parsed = departureHm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!parsed) return [];
  const total = Number(parsed[1]) * 60 + Number(parsed[2]);
  const offsets = [60, 45, 30, 15];
  return offsets
    .map((mins) => {
      const t = total - mins;
      if (t < 0) return null;
      return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    })
    .filter((v): v is string => Boolean(v));
}

export default function PickupPlannerWorkspace(props: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, BookingRow[]>();
    for (const booking of props.bookings) {
      const key = pickupDepartureKey(booking);
      const list = map.get(key) ?? [];
      list.push(booking);
      map.set(key, list);
    }
    return [...map.entries()]
      .map(([id, rows]) => ({
        id,
        date: rows[0]?.booking_date ?? '',
        rows: [...rows].sort(
          (a, b) =>
            departureStartHm(a).localeCompare(departureStartHm(b)) || a.created_at.localeCompare(b.created_at)
        ),
      }))
      .sort(
        (a, b) =>
          (a.date || '').localeCompare(b.date || '') ||
          departureStartHm(a.rows[0]).localeCompare(departureStartHm(b.rows[0]))
      );
  }, [props.bookings]);

  const open = groups.find((g) => g.id === props.departureId) ?? null;

  if (open) {
    return (
      <DeparturePlanner
        departureId={open.id}
        rows={open.rows}
        titles={props.titles}
        thumbs={props.thumbs}
        options={props.optionsByListing[open.rows[0]?.listing_id] ?? []}
        meetingPoint={props.meetingPoints?.[open.rows[0]?.listing_id] ?? ''}
        manageId={props.manageId}
        canEdit={props.canEdit}
        onBack={props.onBack}
        onManage={props.onManage}
        onMessage={props.onMessage}
        onSave={props.onSave}
        onSaveMany={props.onSaveMany}
        onExport={props.onExport}
        exportDisabled={props.exportDisabled}
        onPrint={props.onPrint}
        listingActions={props.listingActions}
      />
    );
  }

  if (props.bookings.length === 0) return null;

  const dayGroups = groupDeparturesByDateKey(groups);
  const page = props.page ?? 1;
  const paged = paginateDayGroups(dayGroups, page, PICKUP_PLANNER_DAYS_PER_PAGE);

  return (
    <div className="space-y-5">
      {paged.slice.map((day) => (
        <section key={day.date} className="space-y-2.5">
          <h2 className="tv-pickup-day-heading">{day.heading}</h2>
          <div className="space-y-2">
            {day.departures.map((dep) => {
              const sample = dep.rows[0];
              const title = displayListingTitleFromPurchase(
                sample.purchase_snapshot,
                props.titles[sample.listing_id],
                'Experience'
              );
              const option = displayOptionLabelFromPurchase(sample.purchase_snapshot, null);
              const fulfillment = bookingFulfillment(sample);
              const start = departureStartHm(sample);
              const isMeeting = fulfillment === 'meeting_point';
              const meetingHm = isMeeting ? effectiveMeetingTimeHm(sample) : null;
              const status = departureOpsStatus(dep.rows);
              const thumb = props.thumbs[sample.listing_id];
              const cardTime = isMeeting ? meetingHm : start || null;
              const stopCount = new Set(
                dep.rows
                  .map((row) => {
                    const point = confirmedPickupPoint(row);
                    const draft = parsePickupDraft(row.special_requests);
                    return pickupStopKey({
                      placeId: draft?.placeId || point.placeId,
                      lat: draft?.lat ?? point.lat,
                      lng: draft?.lng ?? point.lng,
                      address: draft?.address || point.address,
                    });
                  })
                  .filter((key) => key !== 'missing')
              ).size;
              return (
                <article key={dep.id} className="tv-pickup-dep-card">
                  {thumb ? (
                    <img src={thumb} alt="" className="tv-pickup-dep-card__thumb" loading="lazy" decoding="async" />
                  ) : (
                    <div className="tv-pickup-dep-card__thumb tv-pickup-dep-card__thumb--empty" aria-hidden />
                  )}
                  <div className="tv-pickup-dep-card__body min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="tv-pickup-dep-card__title">{title}</h3>
                        {option ? <p className="tv-pickup-dep-card__option">{option}</p> : null}
                      </div>
                      {cardTime ? (
                        <p
                          className="tv-pickup-dep-card__time tabular-nums"
                          aria-label={isMeeting ? `Meeting ${cardTime}` : `Departure ${cardTime}`}
                        >
                          {cardTime}
                        </p>
                      ) : null}
                    </div>
                    <p className="tv-pickup-dep-card__meta">
                      {dep.rows.length} booking{dep.rows.length === 1 ? '' : 's'} · {guestCount(dep.rows)} guest
                      {guestCount(dep.rows) === 1 ? '' : 's'}
                      {isMeeting
                        ? meetingHm
                          ? ` · Meeting ${meetingHm}`
                          : ' · Meeting point'
                        : stopCount > 0
                          ? ` · ${stopCount} pickup location${stopCount === 1 ? '' : 's'}`
                          : ' · Pickup'}
                    </p>
                    {status && pickupOpsNeedsAction(status) ? (
                      <div className="mt-1.5">
                        <StatusPill status={status} />
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="tv-btn-primary tv-pickup-dep-card__cta"
                    onClick={() => props.onOpenDeparture(dep.id)}
                  >
                    {isMeeting ? 'Edit meeting time' : 'Manage pickups'}
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {paged.pageCount > 1 && props.onPageChange ? (
        <nav className="tv-pickup-pagination" aria-label="Pickup days">
          {Array.from({ length: paged.pageCount }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === paged.pageCount || Math.abs(n - paged.page) <= 2)
            .reduce<(number | '…')[]>((acc, n, idx, arr) => {
              if (idx > 0 && typeof arr[idx - 1] === 'number' && n - (arr[idx - 1] as number) > 1) acc.push('…');
              acc.push(n);
              return acc;
            }, [])
            .map((item, idx) =>
              item === '…' ? (
                <span key={`e-${idx}`} className="tv-pickup-pagination__ellipsis">
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={`tv-pickup-pagination__btn ${item === paged.page ? 'is-active' : ''}`}
                  aria-current={item === paged.page ? 'page' : undefined}
                  onClick={() => props.onPageChange?.(item)}
                >
                  {item}
                </button>
              )
            )}
          <button
            type="button"
            className="tv-pickup-pagination__btn"
            disabled={paged.page >= paged.pageCount}
            onClick={() => props.onPageChange?.(Math.min(paged.pageCount, paged.page + 1))}
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}

function DeparturePlanner({
  rows,
  titles,
  thumbs,
  options,
  meetingPoint,
  manageId,
  canEdit,
  onBack,
  onManage,
  onMessage,
  onSave,
  onSaveMany,
  onExport,
  exportDisabled,
  onPrint,
  listingActions,
}: {
  departureId: string;
  rows: BookingRow[];
  titles: Record<string, string>;
  thumbs: Record<string, string>;
  options: OptionMeta[];
  meetingPoint: string;
  manageId: string | null;
  canEdit: boolean;
  onBack: () => void;
  onManage: (bookingId: string | null) => void;
  onMessage: (bookingId: string) => void;
  onSave: Props['onSave'];
  onSaveMany: Props['onSaveMany'];
  onExport?: () => void;
  exportDisabled?: boolean;
  onPrint?: () => void;
  listingActions?: ReactNode;
}) {
  const sample = rows[0];
  const title = displayListingTitleFromPurchase(sample.purchase_snapshot, titles[sample.listing_id], 'Experience');
  const optionLabel = displayOptionLabelFromPurchase(sample.purchase_snapshot, null);
  const optionMeta = optionFor(sample, options);
  const fulfillment = bookingFulfillment(sample);
  const isMeeting = fulfillment === 'meeting_point';
  const start = departureStartHm(sample);
  const dateHeading = sample.booking_date
    ? formatPickupPlannerDateHeading(sample.booking_date)
    : 'Date not set';
  const [openStop, setOpenStop] = useState<string | null>('__first__');
  const scheduleMeetingHm = configuredMeetingTimeHm(sample) || start || null;
  const [meetingTime, setMeetingTime] = useState(
    () => operationalPickupTimeHm(sample) || scheduleMeetingHm || ''
  );
  const [meetingBusy, setMeetingBusy] = useState(false);
  const [meetingNote, setMeetingNote] = useState<string | null>(null);
  const meetingPlace =
    (isPurchaseSnapshot(sample.purchase_snapshot)
      ? (sample.purchase_snapshot.meetingPoint || '').trim()
      : '') ||
    meetingPoint.trim() ||
    (optionMeta?.label || '').trim() ||
    'Meeting point';
  const meetingDisplayHm = effectiveMeetingTimeHm(sample);
  const meetingOverrideHm = operationalPickupTimeHm(sample);

  const stops = useMemo(() => {
    const map = new Map<string, BookingRow[]>();
    for (const row of rows) {
      const point = confirmedPickupPoint(row);
      const draft = parsePickupDraft(row.special_requests);
      const key = pickupStopKey({
        placeId: draft?.placeId || point.placeId,
        lat: draft?.lat ?? point.lat,
        lng: draft?.lng ?? point.lng,
        address: draft?.address || point.address,
      });
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()].sort(
      (a, b) => stopSortMinutes(operationalPickupTimeHm(a[1][0])) - stopSortMinutes(operationalPickupTimeHm(b[1][0]))
    );
  }, [rows]);

  useEffect(() => {
    if (openStop === '__first__' && stops[0]) setOpenStop(stops[0][0]);
  }, [openStop, stops]);

  const managed = rows.find((row) => row.id === manageId) ?? null;
  const meetingStatus = departureOpsStatus(rows);

  const saveMeeting = async (notify: boolean) => {
    if (!canEdit || !/^\d{2}:\d{2}$/.test(meetingTime)) return;
    setMeetingBusy(true);
    setMeetingNote(null);
    const res = await onSaveMany(
      rows.map((r) => r.id),
      meetingTime,
      notify
    );
    setMeetingBusy(false);
    if (!res.ok) {
      setMeetingNote(res.error || 'Could not save meeting time.');
      return;
    }
    if (notify && res.notifyError) {
      setMeetingNote(`Saved. ${res.notifyError}`);
      return;
    }
    setMeetingNote(notify ? `Saved and notified ${rows.length} guest${rows.length === 1 ? '' : 's'}.` : 'Draft saved.');
  };

  return (
    <div className="tv-pickup-itinerary">
      <div className="tv-pickup-itinerary__head">
        <button type="button" className="tv-btn-ghost -ml-2 h-9 shrink-0 px-2" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
          Back
        </button>
        {thumbs[sample.listing_id] ? (
          <img src={thumbs[sample.listing_id]} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="h-12 w-12 shrink-0 rounded-lg bg-[#f4f4f5]" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-sans text-[16px] font-bold tracking-tight text-[#18181b]">{title}</h2>
          <p className="truncate text-[13px] text-[#52525b]">
            {[optionLabel, dateHeading, start ? `Departs ${start}` : null].filter(Boolean).join(' · ')}
          </p>
          <p className="text-[12px] text-[#71717a]">
            {rows.length} booking{rows.length === 1 ? '' : 's'} · {guestCount(rows)} guest
            {guestCount(rows) === 1 ? '' : 's'}
            {isMeeting ? ' · Meeting point' : ' · Pickup'}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {onPrint ? (
            <button type="button" className="tv-btn-secondary h-9 px-2.5 text-[13px]" onClick={onPrint}>
              <Printer className="mr-1 h-3.5 w-3.5" aria-hidden />
              Print
            </button>
          ) : null}
          {onExport ? (
            <button
              type="button"
              className="tv-btn-secondary h-9 px-2.5 text-[13px]"
              disabled={exportDisabled}
              onClick={onExport}
            >
              <Download className="mr-1 h-3.5 w-3.5" aria-hidden />
              Export
            </button>
          ) : null}
        </div>
      </div>

      {isMeeting ? (
        <section className="tv-pickup-meeting-panel">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">Meeting point</p>
            <p className="mt-0.5 font-sans text-[15px] font-bold text-[#18181b]">{meetingPlace}</p>
            {meetingDisplayHm ? (
              <p className="mt-1 text-[13px] text-[#52525b]">
                Meeting time{' '}
                <span className="font-semibold tabular-nums text-[#18181b]">{meetingDisplayHm}</span>
                {!meetingOverrideHm && scheduleMeetingHm ? (
                  <span className="text-[#a1a1aa]"> · from schedule</span>
                ) : null}
                {meetingOverrideHm &&
                scheduleMeetingHm &&
                meetingOverrideHm !== scheduleMeetingHm ? (
                  <span className="text-[#a1a1aa]"> · schedule {scheduleMeetingHm}</span>
                ) : null}
              </p>
            ) : null}
            {scheduleMeetingHm ? (
              <p className="mt-0.5 text-[12px] text-[#71717a]">
                Departure {scheduleMeetingHm}
                <span className="text-[#a1a1aa]"> · product schedule unchanged when editing meeting time</span>
              </p>
            ) : null}
            {meetingStatus && pickupOpsNeedsAction(meetingStatus) ? (
              <div className="mt-2">
                <StatusPill status={meetingStatus} />
              </div>
            ) : null}
          </div>
          <div className="tv-pickup-meeting-panel__controls">
            <PartnerTimeSelect
              label="Meeting time"
              value={meetingTime}
              disabled={!canEdit || meetingBusy}
              suggestions={scheduleMeetingHm ? suggestedPickupTimes(scheduleMeetingHm) : []}
              onChange={setMeetingTime}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="tv-btn-secondary h-10"
                disabled={!canEdit || meetingBusy || !/^\d{2}:\d{2}$/.test(meetingTime)}
                onClick={() => void saveMeeting(false)}
              >
                Save draft
              </button>
              <button
                type="button"
                className="tv-btn-primary h-10"
                disabled={!canEdit || meetingBusy || !/^\d{2}:\d{2}$/.test(meetingTime)}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Save meeting time ${meetingTime} and notify ${rows.length} guest${rows.length === 1 ? '' : 's'}? Departure time ${scheduleMeetingHm || '—'} stays unchanged.`
                    )
                  ) {
                    return;
                  }
                  void saveMeeting(true);
                }}
              >
                {meetingBusy ? 'Saving…' : 'Save & notify guests'}
              </button>
            </div>
            {listingActions ? <div className="mt-1">{listingActions}</div> : null}
            {meetingNote ? (
              <p className="text-[13px] text-[#52525b]" role="status">
                {meetingNote}
              </p>
            ) : null}
          </div>
        </section>
      ) : (
        <section className="mt-4">
          <h3 className="font-sans text-sm font-bold text-[#18181b]">Pickup itinerary</h3>
          <div className="mt-2 space-y-2">
            {stops.map(([key, stopRows]) => {
              const first = stopRows[0];
              const point = confirmedPickupPoint(first);
              const draft = parsePickupDraft(first.special_requests);
              const place = splitAddress(draft?.address || point.address || '');
              const open = openStop === key;
              return (
                <div key={key} className={`tv-pickup-stop ${open ? 'is-open' : ''}`}>
                  <button
                    type="button"
                    className="tv-pickup-stop__head"
                    aria-expanded={open}
                    onClick={() => setOpenStop(open ? null : key)}
                  >
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-sans text-[14px] font-bold text-[#18181b]">{place.name}</span>
                      {place.rest ? (
                        <span className="block truncate text-[12px] text-[#71717a]">{place.rest}</span>
                      ) : null}
                      <span className="mt-0.5 block text-[12px] text-[#52525b]">
                        {guestCount(stopRows)} guest{guestCount(stopRows) === 1 ? '' : 's'} · {stopRows.length}{' '}
                        booking{stopRows.length === 1 ? '' : 's'}
                      </span>
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-[#71717a] transition-transform ${open ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </button>
                  {open ? (
                    <ul className="tv-pickup-stop__rows">
                      {stopRows.map((row) => {
                        const time = operationalPickupTimeHm(row);
                        const status = bookingPickupOpsStatus(row);
                        const phone = guestPhoneFromBookingNotes(row.special_requests);
                        const needsTime = status === 'pickup_time_needed';
                        return (
                          <li key={row.id} className="tv-pickup-guest-row">
                            <div className="tv-pickup-guest-row__info min-w-0">
                              <p className="truncate font-sans text-[14px] font-bold text-[#18181b]">
                                {row.guest_name?.trim() || 'Traveler'}
                              </p>
                              <p className="truncate text-[12px] text-[#71717a]">
                                {referenceLabel(row)} · {formatBookingParticipantsLabel(row)}
                                {phone ? ` · ${phone}` : ''}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                {needsTime ? (
                                  <span className="tv-pickup-status tv-pickup-status--warn">
                                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden strokeWidth={2.25} />
                                    Pickup time needed
                                  </span>
                                ) : time ? (
                                  <span className="text-[13px] font-semibold tabular-nums text-[#18181b]">
                                    Pickup time: {time}
                                  </span>
                                ) : null}
                                {status === 'ready_to_notify' ? <StatusPill status={status} /> : null}
                              </div>
                            </div>
                            <div className="tv-pickup-guest-row__actions">
                              <button
                                type="button"
                                className="text-[13px] font-semibold text-[#073b83]"
                                onClick={() => onMessage(row.id)}
                              >
                                Message
                              </button>
                              <button
                                type="button"
                                className="tv-btn-secondary h-9 px-2.5 text-[13px]"
                                onClick={() => onManage(row.id)}
                              >
                                {needsTime ? 'Edit pickup' : 'Manage'}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {managed ? (
        <PickupManageWorkspace
          booking={managed}
          option={optionFor(managed, options)}
          title={title}
          canEdit={canEdit}
          listingActions={listingActions}
          onClose={() => onManage(null)}
          onSave={onSave}
        />
      ) : null}
    </div>
  );
}

function PickupManageWorkspace({
  booking,
  option,
  title,
  canEdit,
  listingActions,
  onClose,
  onSave,
}: {
  booking: BookingRow;
  option: OptionMeta | null;
  title: string;
  canEdit: boolean;
  listingActions?: ReactNode;
  onClose: () => void;
  onSave: Props['onSave'];
}) {
  const fulfillment = bookingFulfillment(booking);
  const meetingOnly = fulfillment === 'meeting_point';
  const confirmed = confirmedPickupPoint(booking);
  const draft = parsePickupDraft(booking.special_requests);
  const start = departureStartHm(booking);
  const initial = {
    time:
      draft?.timeHm ||
      (booking.pickup_time ? booking.pickup_time.slice(0, 5) : '') ||
      (meetingOnly ? start : '') ||
      '',
    address: draft?.address || confirmed.address,
    placeId: draft?.placeId || confirmed.placeId || '',
    lat: draft?.lat ?? confirmed.lat,
    lng: draft?.lng ?? confirmed.lng,
    instructions:
      draft?.instructions ||
      parseBookingPickupInstructionsOverride(booking.special_requests) ||
      (isPurchaseSnapshot(booking.purchase_snapshot) ? booking.purchase_snapshot.pickupInstructions || '' : '') ||
      option?.instructions ||
      '',
  };
  const [time, setTime] = useState(initial.time);
  const [address, setAddress] = useState(initial.address);
  const [placeId, setPlaceId] = useState(initial.placeId);
  const [lat, setLat] = useState<number | null>(initial.lat);
  const [lng, setLng] = useState<number | null>(initial.lng);
  const [instructions, setInstructions] = useState(initial.instructions);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editingPlace, setEditingPlace] = useState(false);
  const dirty =
    time !== initial.time ||
    address !== initial.address ||
    instructions !== initial.instructions ||
    lat !== initial.lat ||
    lng !== initial.lng;
  const area = option?.area ?? null;
  const outside =
    !meetingOnly && area && lat != null && lng != null
      ? haversineKm(area, { lat, lng }) > area.radiusKm + 0.05
      : false;
  const selectedPlace: TravelerPickupPoint | null =
    placeId && address && lat != null && lng != null
      ? { placeId, formattedAddress: address, name: address.split(',')[0] || address, lat, lng }
      : null;
  const phone = guestPhoneFromBookingNotes(booking.special_requests);
  const place = splitAddress(address);

  const requestClose = () => {
    if (dirty && !window.confirm('Close without saving pickup changes?')) return;
    onClose();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (dirty && !window.confirm('Close without saving pickup changes?')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, onClose]);

  const payload = (notify: boolean): SaveSupplierPickupInput => ({
    notify,
    pickupTimeHm: time || null,
    address,
    placeId: placeId || null,
    lat,
    lng,
    instructions,
    meetingPointOnly: meetingOnly,
  });

  const save = async (notify: boolean) => {
    if (!canEdit || outside || saving) return;
    setSaving(true);
    setNote(null);
    const res = await onSave(booking.id, payload(notify));
    setSaving(false);
    if (!res.ok) {
      setNote(res.error || 'Could not save pickup details.');
      return;
    }
    if (notify && res.notifyError) {
      setNote(`Saved. ${res.notifyError}`);
      return;
    }
    onClose();
  };

  return (
    <div
      className="tv-pickup-manage-overlay"
      role="presentation"
      onMouseDown={requestClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pickup-manage-title"
        className="tv-pickup-manage-sheet motion-safe:animate-fade-in"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="tv-pickup-manage-sheet__head">
          <div className="min-w-0">
            <h2 id="pickup-manage-title" className="font-sans text-base font-bold text-[#18181b]">
              {meetingOnly ? 'Edit meeting time' : 'Manage pickup'}
            </h2>
            <p className="truncate text-[12px] text-[#71717a]">{title}</p>
          </div>
          <button type="button" className="tv-btn-ghost h-9 px-2" onClick={requestClose}>
            Close
          </button>
        </header>

        <div className="tv-pickup-manage-sheet__body">
          <div className="tv-pickup-manage-sheet__col">
            <section>
              <p className="font-sans text-[16px] font-bold leading-snug text-[#18181b]">
                {booking.guest_name?.trim() || 'Traveler'}
              </p>
              <p className="text-[13px] text-[#52525b]">
                {referenceLabel(booking)} · {formatBookingParticipantsLabel(booking)}
              </p>
              {phone ? (
                <a className="mt-0.5 inline-block text-[13px] font-semibold text-[#073b83]" href={`tel:${phone.replace(/\s/g, '')}`}>
                  {phone}
                </a>
              ) : null}
            </section>

            <section>
              <PartnerTimeSelect
                label={meetingOnly ? 'Meeting time' : 'Pickup time'}
                value={time}
                disabled={!canEdit}
                suggestions={start ? suggestedPickupTimes(start) : []}
                onChange={setTime}
              />
              {start ? (
                <p className="mt-1 text-[12px] text-[#71717a]">
                  Tour departure {start}
                  {meetingOnly ? ' · changing meeting time does not change the product schedule' : ''}
                </p>
              ) : null}
            </section>

            {!meetingOnly ? (
              <section>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">
                      Pickup location
                    </p>
                    <p className="truncate text-sm font-bold text-[#18181b]">{place.name}</p>
                    {place.rest ? <p className="truncate text-[12px] text-[#71717a]">{place.rest}</p> : null}
                    {!address ? <p className="text-[13px] text-[#52525b]">No pickup location yet.</p> : null}
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      className="shrink-0 text-[13px] font-semibold text-[#073b83]"
                      onClick={() => setEditingPlace((open) => !open)}
                    >
                      {editingPlace ? 'Done' : 'Change location'}
                    </button>
                  ) : null}
                </div>
                {editingPlace ? (
                  <div className="mt-2">
                    <PickupLocationSearch
                      id={`pickup-search-${booking.id}`}
                      label="Pickup location"
                      area={area}
                      bias={area ? { lat: area.lat, lng: area.lng, radiusKm: area.radiusKm } : null}
                      selected={selectedPlace}
                      onSelect={(next) => {
                        if (!next) return;
                        setAddress(next.formattedAddress);
                        setPlaceId(next.placeId);
                        setLat(next.lat);
                        setLng(next.lng);
                      }}
                    />
                    {!placesSearchConfigured() ? (
                      <p className="mt-1 text-[12px] text-[#52525b]">
                        Address search is unavailable until Google Maps is configured.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {outside ? (
                  <p className="mt-1 text-[12px] font-semibold text-[#9f1239]">This pin is outside the pickup area.</p>
                ) : null}
              </section>
            ) : (
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">Meeting point</p>
                <p className="text-sm font-bold text-[#18181b]">
                  {(option?.label || '').trim() || 'See listing meeting point'}
                </p>
                {listingActions ? <div className="mt-2">{listingActions}</div> : null}
              </section>
            )}

            <section>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#52525b]" htmlFor={`pickup-notes-${booking.id}`}>
                Guest instructions
              </label>
              <textarea
                id={`pickup-notes-${booking.id}`}
                className="tv-input min-h-0 w-full py-2 text-sm"
                rows={3}
                maxLength={500}
                value={instructions}
                disabled={!canEdit}
                onChange={(event) => setInstructions(event.target.value)}
              />
            </section>
            {note ? (
              <p className="text-sm text-[#9f1239]" role="status">
                {note}
              </p>
            ) : null}
          </div>

          <div className="tv-pickup-manage-sheet__map">
            {!meetingOnly && lat != null && lng != null ? (
              <>
                <PickupCoverageMap
                  lat={area?.lat ?? lat}
                  lng={area?.lng ?? lng}
                  radiusKm={area?.radiusKm ?? null}
                  marker={{ lat, lng }}
                  pinZoom={16}
                  showRadius={editingPlace && area != null}
                  draggable={canEdit && editingPlace}
                  className="h-48 w-full overflow-hidden rounded-xl border border-[#e5e7eb] bg-white sm:h-56"
                  fallback="The map could not be loaded. You can still save a searched address."
                  onMarkerDrag={(point) => {
                    setLat(point.lat);
                    setLng(point.lng);
                    void reverseGeocode(point.lat, point.lng).then((next) => {
                      if (next) setAddress(next);
                    });
                  }}
                />
                <div className="mt-2 flex flex-wrap gap-3 text-[13px]">
                  {address ? (
                    <a
                      className="inline-flex items-center gap-1 font-semibold text-[#073b83]"
                      href={mapsUrl(address, lat, lng)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      Open in Maps
                    </a>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-[#e5e7eb] bg-[#fafafa] px-4 text-center text-[13px] text-[#71717a] sm:h-56">
                {meetingOnly
                  ? 'Meeting-point bookings use the product meeting location.'
                  : 'Add a pickup location to preview the map.'}
              </div>
            )}
          </div>
        </div>

        <footer className="tv-pickup-manage-sheet__foot">
          <button type="button" className="tv-btn-secondary h-10" onClick={requestClose}>
            Cancel
          </button>
          <button
            type="button"
            className="tv-btn-secondary h-10"
            disabled={!canEdit || saving || outside}
            onClick={() => void save(false)}
          >
            Save draft
          </button>
          <button
            type="button"
            className="tv-btn-primary h-10"
            disabled={!canEdit || saving || outside}
            onClick={() => void save(true)}
          >
            {saving ? 'Saving…' : 'Save & notify guest'}
          </button>
        </footer>
      </div>
    </div>
  );
}
