import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import PickupLocationSearch from '../checkout/PickupLocationSearch';
import PickupCoverageMap from './PickupCoverageMap';
import { placesSearchConfigured, reverseGeocode } from '../../lib/places-client';
import { haversineKm, type PickupArea, type TravelerPickupPoint } from '../../lib/pickup-area';
import {
  bookingFulfillment,
  confirmedPickupPoint,
  departureStartHm,
  operationalPickupTimeHm,
  pickupAttention,
  pickupDepartureKey,
  pickupStopKey,
  stopSortMinutes,
  type PickupAttention,
} from '../../lib/pickup-planner';
import {
  guestPhoneFromBookingNotes,
  parseBookingPickupInstructionsOverride,
  parsePickupDraft,
} from '../../lib/booking-notes';
import { displayListingTitleFromPurchase, displayOptionLabelFromPurchase, isPurchaseSnapshot } from '../../lib/purchase-snapshot';
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
  departureId: string | null;
  manageId: string | null;
  canEdit: boolean;
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

function attentionLabel(flags: PickupAttention[]): string | null {
  if (flags.includes('outside')) return 'Outside pickup area';
  if (flags.includes('location')) return 'Pickup location missing';
  if (flags.includes('time')) return 'Pickup time not set';
  if (flags.includes('draft')) return 'Draft not sent';
  return null;
}

function guestCount(rows: BookingRow[]): number {
  return rows.reduce((sum, row) => sum + Number(row.guests ?? 0), 0);
}

function referenceLabel(b: BookingRow): string {
  return travelerPublicBookingReference(b.public_reference) || (typeof b.booking_number === 'number' ? `#${b.booking_number}` : 'Booking');
}

function optionFor(b: BookingRow, options: OptionMeta[]): OptionMeta | null {
  const snap = isPurchaseSnapshot(b.purchase_snapshot) ? b.purchase_snapshot : null;
  const id = (snap?.optionId || b.booking_option_id || '').trim();
  return options.find((option) => option.id === id) ?? null;
}

function splitAddress(address: string): { name: string; rest: string } {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return { name: 'Location not set', rest: '' };
  return { name: parts[0], rest: parts.slice(1).join(', ') };
}

function formatWhen(b: BookingRow): string {
  const date = b.booking_date
    ? new Date(`${b.booking_date}T12:00:00`).toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      })
    : 'Date not set';
  const start = departureStartHm(b);
  return start ? `${date} · ${start}` : date;
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
    return [...map.entries()].sort((a, b) => {
      const ad = a[1][0]?.booking_date ?? '';
      const bd = b[1][0]?.booking_date ?? '';
      return ad.localeCompare(bd) || departureStartHm(a[1][0]).localeCompare(departureStartHm(b[1][0]));
    });
  }, [props.bookings]);

  const open = groups.find(([id]) => id === props.departureId) ?? null;

  if (open) {
    return (
      <DeparturePlanner
        departureId={open[0]}
        rows={open[1]}
        titles={props.titles}
        thumbs={props.thumbs}
        options={props.optionsByListing[open[1][0]?.listing_id] ?? []}
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

  return (
    <div className="space-y-2">
      {groups.map(([id, rows]) => {
        const sample = rows[0];
        const title = displayListingTitleFromPurchase(sample.purchase_snapshot, props.titles[sample.listing_id], 'Experience');
        const option = displayOptionLabelFromPurchase(sample.purchase_snapshot, null);
        const flags = rows.flatMap((row) => pickupAttention(row, optionFor(row, props.optionsByListing[row.listing_id] ?? [])?.area ?? null));
        const warn = flags.includes('outside')
          ? 'Outside pickup area'
          : flags.includes('location')
            ? 'Pickup location missing'
            : flags.includes('time')
              ? 'Pickup time not set'
              : null;
        const stops = new Set(
          rows
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
        );
        const thumb = props.thumbs[sample.listing_id];
        return (
          <article key={id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2.5">
            {thumb ? (
              <img src={thumb} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
            ) : (
              <div className="h-12 w-12 shrink-0 rounded-md bg-[#f4f4f5]" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-sans text-[15px] font-bold text-[#18181b]">{title}</h2>
              <p className="truncate text-[13px] text-[#52525b]">
                {[option, formatWhen(sample)].filter(Boolean).join(' · ')}
              </p>
              <p className="mt-0.5 text-[12px] text-[#71717a]">
                {rows.length} booking{rows.length === 1 ? '' : 's'} · {guestCount(rows)} guest{guestCount(rows) === 1 ? '' : 's'}
                {stops.size > 0 ? ` · ${stops.size} pickup location${stops.size === 1 ? '' : 's'}` : ''}
                {warn ? ` · ${warn}` : ''}
              </p>
            </div>
            <button type="button" className="tv-btn-primary w-full shrink-0 sm:w-auto" onClick={() => props.onOpenDeparture(id)}>
              Manage pickups
            </button>
          </article>
        );
      })}
    </div>
  );
}

function DeparturePlanner({
  rows,
  titles,
  thumbs,
  options,
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
  const option = displayOptionLabelFromPurchase(sample.purchase_snapshot, null);
  const [openStop, setOpenStop] = useState<string | null>(null);
  const [stopTime, setStopTime] = useState('');
  const [confirmStop, setConfirmStop] = useState(false);
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
    return [...map.entries()].sort((a, b) => stopSortMinutes(operationalPickupTimeHm(a[1][0])) - stopSortMinutes(operationalPickupTimeHm(b[1][0])));
  }, [rows]);
  const attention = rows.filter((row) => pickupAttention(row, optionFor(row, options)?.area ?? null).length > 0);
  const managed = rows.find((row) => row.id === manageId) ?? null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="tv-btn-ghost -ml-2 h-9 shrink-0 px-2" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" aria-hidden />
          Back to Pickups
        </button>
        {thumbs[sample.listing_id] ? (
          <img src={thumbs[sample.listing_id]} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-md bg-[#f4f4f5]" aria-hidden />
        )}
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="truncate font-sans text-[15px] font-bold text-[#18181b]">{title}</h2>
          <p className="truncate text-[12px] text-[#52525b]">
            {[option, formatWhen(sample), `${rows.length} bookings`, `${guestCount(rows)} guests`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {onPrint ? (
            <button type="button" className="tv-btn-secondary h-9 px-2.5 text-[13px]" onClick={onPrint}>
              Print
            </button>
          ) : null}
          {onExport ? (
            <button type="button" className="tv-btn-secondary h-9 px-2.5 text-[13px]" disabled={exportDisabled} onClick={onExport}>
              Export
            </button>
          ) : null}
        </div>
      </div>

      <section className="mt-3">
        <h3 className="font-sans text-sm font-bold text-[#18181b]">Pickup itinerary</h3>
        <div className="mt-2 divide-y divide-[#e5e7eb] overflow-hidden rounded-lg border border-[#e5e7eb] bg-white">
          {stops.map(([key, stopRows]) => {
            const first = stopRows[0];
            const point = confirmedPickupPoint(first);
            const draft = parsePickupDraft(first.special_requests);
            const place = splitAddress(draft?.address || point.address || '');
            const time = operationalPickupTimeHm(first);
            const open = openStop === key;
            return (
              <div key={key}>
                <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left" onClick={() => setOpenStop(open ? null : key)}>
                  <span className="min-w-0">
                    <span className="block truncate font-sans text-[13px] font-bold text-[#18181b]">{place.name}</span>
                    {place.rest ? <span className="block truncate text-[12px] text-[#71717a]">{place.rest}</span> : null}
                    <span className="block text-[12px] text-[#52525b]">
                      {time ? <span className="font-semibold text-[#18181b]">{time} pickup</span> : 'Time not set'}
                      {` · ${guestCount(stopRows)} guest${guestCount(stopRows) === 1 ? '' : 's'} · ${stopRows.length} booking${stopRows.length === 1 ? '' : 's'}`}
                    </span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[#71717a] ${open ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                {open ? (
                  <div className="border-t border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                    {canEdit && key !== 'missing' ? (
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <label className="text-[12px] font-semibold text-[#52525b]" htmlFor={`stop-time-${key}`}>
                          Pickup time for this stop
                        </label>
                        <input id={`stop-time-${key}`} type="time" className="tv-pickup-time" value={stopTime} onChange={(e) => { setStopTime(e.target.value); setConfirmStop(false); }} />
                        <button type="button" className="tv-btn-secondary" disabled={!stopTime} onClick={() => setConfirmStop(true)}>
                          Apply to {stopRows.length}
                        </button>
                        {confirmStop && stopTime ? (
                          <span className="flex flex-wrap gap-2 text-[12px]">
                            <span className="text-[#52525b]">Set {stopTime} on {stopRows.length} bookings?</span>
                            <button type="button" className="font-semibold text-[#073b83]" onClick={() => void onSaveMany(stopRows.map((row) => row.id), stopTime, false).then(() => setConfirmStop(false))}>
                              Save draft
                            </button>
                            <button type="button" className="font-semibold text-[#073b83]" onClick={() => void onSaveMany(stopRows.map((row) => row.id), stopTime, true).then(() => setConfirmStop(false))}>
                              Save & notify
                            </button>
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <ul className="space-y-1">
                      {stopRows.map((row) => (
                        <li key={row.id} className="flex items-center justify-between gap-2 text-[13px]">
                          <span className="min-w-0 truncate text-[#18181b]">
                            <span className="font-semibold">{row.guest_name?.trim() || 'Traveler'}</span>
                            <span className="text-[#71717a]"> · {formatBookingParticipantsLabel(row)} · {referenceLabel(row)}</span>
                          </span>
                          <span className="flex shrink-0 gap-2">
                            <button type="button" className="font-semibold text-[#073b83]" onClick={() => onMessage(row.id)}>Message</button>
                            <button type="button" className="font-semibold text-[#073b83]" onClick={() => onManage(row.id)}>Manage details</button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>

      {attention.length > 0 ? (
        <section className="mt-4">
          <h3 className="font-sans text-sm font-bold text-[#18181b]">Bookings requiring attention</h3>
          <ul className="mt-2 divide-y divide-[#e5e7eb] overflow-hidden rounded-lg border border-[#e5e7eb] bg-white">
            {attention.map((row) => {
              const label = attentionLabel(pickupAttention(row, optionFor(row, options)?.area ?? null));
              return (
                <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#18181b]">{row.guest_name?.trim() || 'Traveler'}</span>
                    <span className="text-[12px] text-[#52525b]">{label} · {referenceLabel(row)}</span>
                  </span>
                  <button type="button" className="tv-btn-secondary h-9 shrink-0 px-2.5 text-[13px]" onClick={() => onManage(row.id)}>
                    Manage details
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {managed ? (
        <PickupManageModal
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

function PickupManageModal({
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
    time: draft?.timeHm || (booking.pickup_time ? booking.pickup_time.slice(0, 5) : ''),
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
  const [source, setSource] = useState(draft ? 'Adjusted in draft' : confirmed.source === 'supplier' ? 'Supplier adjusted' : confirmed.source === 'customer' ? 'Customer selected' : 'Not set');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editingPlace, setEditingPlace] = useState(false);
  const [showCoords, setShowCoords] = useState(false);
  const dirty =
    time !== initial.time ||
    address !== initial.address ||
    instructions !== initial.instructions ||
    lat !== initial.lat ||
    lng !== initial.lng;
  const area = option?.area ?? null;
  const outside =
    !meetingOnly && area && lat != null && lng != null ? haversineKm(area, { lat, lng }) > area.radiusKm + 0.05 : false;
  const selectedPlace: TravelerPickupPoint | null =
    placeId && address && lat != null && lng != null
      ? { placeId, formattedAddress: address, name: address.split(',')[0] || address, lat, lng }
      : null;

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
    if (!canEdit || outside) return;
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

  const phone = guestPhoneFromBookingNotes(booking.special_requests);
  const place = splitAddress(address);
  const productLine = [title, displayOptionLabelFromPurchase(booking.purchase_snapshot, null)].filter(Boolean).join(' · ');

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center" role="presentation" onMouseDown={requestClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pickup-manage-title"
        className="flex h-[100dvh] w-full max-w-full flex-col bg-white pb-[env(safe-area-inset-bottom)] sm:h-auto sm:max-h-[min(88dvh,720px)] sm:w-[min(640px,calc(100vw-2rem))] sm:rounded-xl sm:border sm:border-[#e5e7eb]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-[#e5e7eb] px-4 py-3">
          <h2 id="pickup-manage-title" className="font-sans text-base font-bold text-[#18181b]">Manage pickup</h2>
          <button type="button" className="tv-btn-ghost" onClick={requestClose}>Close</button>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <section>
            <p className="font-sans text-[15px] font-bold leading-5 text-[#18181b]">{booking.guest_name?.trim() || 'Traveler'}</p>
            <p className="text-[13px] leading-5 text-[#52525b]">
              {referenceLabel(booking)} · {formatBookingParticipantsLabel(booking)} · {formatWhen(booking)}
            </p>
            {productLine ? <p className="truncate text-[12px] leading-5 text-[#71717a]">{productLine}</p> : null}
            {phone ? (
              <a className="text-[13px] font-semibold leading-5 text-[#073b83]" href={`tel:${phone.replace(/\s/g, '')}`}>
                {phone}
              </a>
            ) : null}
          </section>

          <section>
            <h3 className="font-sans text-sm font-bold text-[#18181b]">Pickup details</h3>
            {meetingOnly ? (
              <>
                <p className="mt-1 text-[13px] text-[#52525b]">This booking uses a meeting point. A hotel pickup address is not required.</p>
                {listingActions ? <div className="mt-2">{listingActions}</div> : null}
              </>
            ) : (
              <>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#18181b]">{place.name}</p>
                    {place.rest ? <p className="truncate text-[12px] text-[#71717a]">{place.rest}</p> : null}
                    {!address ? <p className="text-[13px] text-[#52525b]">No pickup location yet.</p> : null}
                    <p className="text-[11px] text-[#71717a]">{source}</p>
                  </div>
                  {canEdit ? (
                    <button type="button" className="shrink-0 text-[13px] font-semibold text-[#073b83]" onClick={() => setEditingPlace((open) => !open)}>
                      {editingPlace ? 'Done' : 'Change'}
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
                        setSource('Supplier adjusted');
                      }}
                    />
                    {!placesSearchConfigured() ? (
                      <p className="mt-1 text-[12px] text-[#52525b]">Address search is unavailable until Google Maps is configured.</p>
                    ) : null}
                  </div>
                ) : null}
                {outside ? <p className="mt-1 text-[12px] font-semibold text-[#9f1239]">This pin is outside the pickup area.</p> : null}
                {lat != null && lng != null ? (
                  <div className="mt-2">
                    <PickupCoverageMap
                      lat={area?.lat ?? lat}
                      lng={area?.lng ?? lng}
                      radiusKm={area?.radiusKm ?? null}
                      marker={{ lat, lng }}
                      pinZoom={16}
                      showRadius={editingPlace && area != null}
                      draggable={canEdit && editingPlace}
                      className="h-40 w-full overflow-hidden rounded-lg border border-[#e5e7eb] bg-white"
                      fallback="The map could not be loaded. You can still save a searched address."
                      onMarkerDrag={(point) => {
                        setLat(point.lat);
                        setLng(point.lng);
                        setSource('Supplier adjusted');
                        void reverseGeocode(point.lat, point.lng).then((next) => {
                          if (next) setAddress(next);
                        });
                      }}
                    />
                    <button type="button" className="mt-1 text-[12px] font-semibold text-[#52525b]" onClick={() => setShowCoords((open) => !open)}>
                      {showCoords ? 'Hide coordinates' : 'Coordinates'}
                    </button>
                    {showCoords ? (
                      <p className="text-[12px] text-[#71717a]">{lat.toFixed(5)}, {lng.toFixed(5)}</p>
                    ) : null}
                  </div>
                ) : null}
                {listingActions ? <div className="mt-2">{listingActions}</div> : null}
              </>
            )}
          </section>

          <section>
            <h3 className="font-sans text-sm font-bold text-[#18181b]">Pickup time</h3>
            <input
              type="time"
              className="tv-pickup-time mt-1.5"
              value={time}
              disabled={!canEdit}
              onChange={(event) => setTime(event.target.value)}
              aria-label="Pickup time"
            />
            {start ? <p className="mt-1 text-[12px] text-[#71717a]">Tour starts {start}</p> : null}
          </section>

          <section>
            <h3 className="font-sans text-sm font-bold text-[#18181b]">Guest instructions</h3>
            <textarea
              className="tv-input mt-1.5 min-h-0 w-full py-2 text-sm"
              rows={2}
              maxLength={500}
              value={instructions}
              disabled={!canEdit}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </section>
          {note ? <p className="text-sm text-[#9f1239]" role="status">{note}</p> : null}
        </div>
        <footer className="grid grid-cols-2 gap-2 border-t border-[#e5e7eb] px-4 py-2.5 sm:flex sm:justify-end">
          <button type="button" className="tv-btn-secondary h-10" onClick={requestClose}>Cancel</button>
          <button type="button" className="tv-btn-secondary h-10" disabled={!canEdit || saving || outside} onClick={() => void save(false)}>
            Save draft
          </button>
          <button type="button" className="tv-btn-primary col-span-2 h-10 sm:col-span-1" disabled={!canEdit || saving || outside} onClick={() => void save(true)}>
            {saving ? 'Saving…' : 'Save & notify'}
          </button>
        </footer>
      </div>
    </div>
  );
}
