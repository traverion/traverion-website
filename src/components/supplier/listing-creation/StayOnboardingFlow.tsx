import { useEffect, useRef, useState } from 'react';
import { STAY_ONBOARDING_STAGES } from '../../../lib/stay-onboarding';
import { stayAmenityDisplayList } from '../../../lib/stay-amenities';
import { stayPropertyTypesForMode } from '../../../lib/stay-accommodation';
import { STAY_ARRIVAL_METHODS, stayArrivalMethodHint } from '../../../lib/stay-arrival';
import { STAY_BED_KINDS, stayBedCount, stayMixFromAreas, staySleepCapacity, type StayBedKind, type StaySleepingArea } from '../../../lib/stay-beds';
import { activeStayOptions, emptyStayOption, newStayOptionId, type StayAccommodationOption } from '../../../lib/stay-options';
import { STAY_GUEST_CANCELLATION_POLICY } from '../../../types/listingExtras';
import { googleMapsBrowserKey } from '../../../lib/places-client';
import type { VerifiedDestination } from '../../../lib/destination-place';
import TraverionLocationSelector from '../TraverionLocationSelector';
import StayAmenityPicker from './StayAmenityPicker';
import StayBedroomPhotos from './StayBedroomPhotos';
import StayExampleQuote from './StayExampleQuote';
import ListingImageFields from '../ListingImageFields';
import { TraverionSingleDateField } from '../../calendar/TraverionSingleDateField';
import { localYmd } from '../../../lib/local-ymd';

type PhotoSlot = string;
type Values = {
  city: string;
  country: string;
  destinationLat: number | null;
  destinationLng: number | null;
  stayLocationDisplayName: string;
  stayAddressStreet: string;
  stayAddressPostal: string;
  stayCheckInAddress: string;
  stayPropertyType: string;
  stayAccommodationMode: 'single' | 'multi';
  title: string;
  subtitle: string;
  description: string;
  highlights: string[];
  stayAmenities: string;
  stayOptions: StayAccommodationOption[];
  stayCheckIn: string;
  stayCheckOut: string;
  stayCutoffMinutes: number | null;
  stayAvailabilityMode: 'open' | 'scheduled';
  stayMaxGuests: string;
  stayMinNights: string;
  stayNightly: string;
  stayCleaningFee: string;
  stayArrivalMethod: '' | 'self' | 'host' | 'lockbox' | 'smart_lock' | 'reception' | 'other';
  stayArrivalNote: string;
  photoSlots: PhotoSlot[];
  photoSlotLabels: string[];
  photoOriginalUrls: string[];
  photoCropSettings: Array<{ crop?: { x?: number; y?: number }; zoom?: number; areaPixels?: { x?: number; y?: number; width?: number; height?: number } | null }>;
  stayPets: string;
  staySmoking: string;
  stayParties: string;
  stayChildren: string;
  stayQuietStart: string;
  stayQuietEnd: string;
  stayHouseRules: string;
  stayBedrooms: string;
  stayBathrooms: string;
};

type Props = {
  stage: number;
  direction: 'forward' | 'back';
  attempted: boolean;
  blocker: string | null;
  currency: string;
  userId?: string;
  uploadsEnabled: boolean;
  locationConfirmed: boolean;
  onConfirmLocation: (confirmed: boolean) => void;
  selectedPlace: VerifiedDestination | null;
  savedPlaceLabel: string;
  legacyPlaceHint?: string;
  onSelectPlace: (place: VerifiedDestination) => void;
  onClearPlace: () => void;
  values: Values;
  onChange: (patch: Partial<Values>) => void;
  onEditStage: (stage: number) => void;
  minTitle: number;
  maxTitle: number;
  minDescription: number;
  maxDescription: number;
  maxSubtitle: number;
};

function primaryOption(values: Values): StayAccommodationOption {
  return activeStayOptions(values.stayOptions)[0] ?? emptyStayOption(newStayOptionId(), values.stayPropertyType || 'Apartment');
}

function areasOf(option: StayAccommodationOption): StaySleepingArea[] {
  if (option.sleepingAreas.length > 0) return option.sleepingAreas;
  return [];
}

export default function StayOnboardingFlow(props: Props) {
  const stage = STAY_ONBOARDING_STAGES[props.stage] ?? STAY_ONBOARDING_STAGES[0];
  const option = primaryOption(props.values);
  const areas = areasOf(option);

  function writeOption(next: StayAccommodationOption) {
    const rest = props.values.stayOptions.filter((row) => row.id !== next.id);
    props.onChange({ stayOptions: [next, ...rest] });
  }

  function writeAreas(nextAreas: StaySleepingArea[]) {
    const bedrooms = nextAreas.filter((area) => !/living/i.test(area.name)).length;
    writeOption({
      ...option,
      sleepingAreas: nextAreas,
      bedMix: stayMixFromAreas(nextAreas),
      beds: stayBedCount(stayMixFromAreas(nextAreas)),
      bedrooms,
    });
  }

  return (
    <div className={`mx-auto w-full max-w-xl ${props.direction === 'back' ? 'stay-stage-back' : 'stay-stage-forward'}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {props.stage + 1} of {STAY_ONBOARDING_STAGES.length}
      </p>
      <h3 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">{stage.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{stage.body}</p>
      <div className="mt-6">
        {props.stage === 0 ? <LocationStage {...props} /> : null}
        {props.stage === 1 ? <ConfirmStage {...props} /> : null}
        {props.stage === 2 ? <PropertyStage {...props} /> : null}
        {props.stage === 3 ? (
          <StayAmenityPicker
            selected={stayAmenityDisplayList(props.values.stayAmenities.split(',').map((item) => item.trim()))}
            onChange={(next) => props.onChange({ stayAmenities: next.join(', ') })}
          />
        ) : null}
        {props.stage === 4 ? <RoomsStage areas={areas} onChange={writeAreas} /> : null}
        {props.stage === 5 ? <DescriptionStage {...props} /> : null}
        {props.stage === 6 ? <BookingStage {...props} option={option} writeOption={writeOption} /> : null}
        {props.stage === 7 ? <AvailabilityStage {...props} option={option} writeOption={writeOption} /> : null}
        {props.stage === 8 ? <GuestsStage {...props} option={option} writeOption={writeOption} /> : null}
        {props.stage === 9 ? <PricingStage {...props} option={option} writeOption={writeOption} /> : null}
        {props.stage === 10 ? <ArrivalStage {...props} /> : null}
        {props.stage === 11 ? <PhotosStage {...props} /> : null}
        {props.stage === 12 ? <CancellationStage /> : null}
        {props.stage === 13 ? <PoliciesStage {...props} /> : null}
        {props.stage === 14 ? <PreviewStage {...props} option={option} /> : null}
      </div>
      {props.attempted && props.blocker ? (
        <p className="mt-4 text-sm font-medium text-red-700" role="alert">{props.blocker}</p>
      ) : null}
      <div className="mt-8 h-1 overflow-hidden rounded-full bg-[#E6EAF0]" role="progressbar" aria-valuemin={1} aria-valuemax={STAY_ONBOARDING_STAGES.length} aria-valuenow={props.stage + 1}>
        <div className="h-full bg-[#0B397E] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${((props.stage + 1) / STAY_ONBOARDING_STAGES.length) * 100}%` }} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-semibold text-ink">
      {label}
      <div className="mt-1 font-normal">{children}</div>
    </label>
  );
}

function LocationStage({ values, onChange, selectedPlace, savedPlaceLabel, legacyPlaceHint, onSelectPlace, onClearPlace }: Props) {
  const [unit, setUnit] = useState('');
  function compose(street: string, postal: string, nextUnit: string) {
    const line = [street.trim(), nextUnit.trim() ? `Unit ${nextUnit.trim()}` : '', postal.trim(), values.city.trim()].filter(Boolean).join(', ');
    onChange({ stayAddressStreet: street, stayAddressPostal: postal, stayCheckInAddress: line.slice(0, 400) });
  }
  return (
    <div className="space-y-4">
      <TraverionLocationSelector
        id="stay-onboarding-place"
        selected={selectedPlace}
        savedLabel={savedPlaceLabel}
        legacyHint={legacyPlaceHint}
        onSelect={onSelectPlace}
        onClear={onClearPlace}
      />
      <Field label="Street and building number">
        <input className="tv-input w-full" value={values.stayAddressStreet} maxLength={160} onChange={(e) => compose(e.target.value.slice(0, 160), values.stayAddressPostal, unit)} />
      </Field>
      <Field label="Apartment or unit, if any">
        <input className="tv-input w-full" value={unit} maxLength={40} placeholder="For example 4B" onChange={(e) => { const next = e.target.value.slice(0, 40); setUnit(next); compose(values.stayAddressStreet, values.stayAddressPostal, next); }} />
      </Field>
      <Field label="Postal code">
        <input className="tv-input w-full" value={values.stayAddressPostal} maxLength={16} onChange={(e) => compose(values.stayAddressStreet, e.target.value.slice(0, 16), unit)} />
      </Field>
      <p className="text-xs leading-relaxed text-ink-muted">The street address is saved for booked guests. It is not shown on the public listing.</p>
    </div>
  );
}

function ConfirmStage({ values, locationConfirmed, onConfirmLocation, onChange }: Props) {
  return (
    <div className="space-y-4">
      <StayPin
        lat={values.destinationLat}
        lng={values.destinationLng}
        onMove={(lat, lng) => onChange({ destinationLat: lat, destinationLng: lng })}
      />
      <p className="text-sm text-ink">Public listing: {[values.city, values.country].filter(Boolean).join(', ') || 'City not set'}</p>
      <p className="text-sm text-ink-muted">Private arrival address: {values.stayCheckInAddress.trim() || values.stayAddressStreet.trim() || 'Not added yet'}</p>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
        <input type="checkbox" checked={locationConfirmed} onChange={(e) => onConfirmLocation(e.target.checked)} />
        The pin is the property
      </label>
    </div>
  );
}

function StayPin({ lat, lng, onMove }: { lat: number | null; lng: number | null; onMove: (lat: number, lng: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const key = googleMapsBrowserKey();
    if (!key || lat == null || lng == null || !ref.current) return;
    let marker: { setMap: (map: null) => void; addListener: (name: string, fn: () => void) => void; getPosition: () => { lat: () => number; lng: () => number } | null } | null = null;
    let cancelled = false;
    const scriptId = 'traverion-stay-pin-map';
    const start = () => {
      const maps = window.google?.maps as { Map: new (el: HTMLElement, opts: object) => object; Marker: new (opts: object) => { setMap: (map: null) => void; addListener: (name: string, fn: () => void) => void; getPosition: () => { lat: () => number; lng: () => number } | null } } | undefined;
      if (!maps || !ref.current || cancelled) return;
      const map = new maps.Map(ref.current, { center: { lat, lng }, zoom: 16, disableDefaultUI: true, zoomControl: true, clickableIcons: false });
      marker = new maps.Marker({ map, position: { lat, lng }, draggable: true });
      marker.addListener('dragend', () => {
        const pos = marker?.getPosition();
        if (pos) moveRef.current(pos.lat(), pos.lng());
      });
    };
    if (window.google?.maps) start();
    else {
      let script = document.getElementById(scriptId) as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.async = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly`;
        script.onerror = () => setFailed(true);
        document.head.appendChild(script);
      }
      script.addEventListener('load', start);
    }
    return () => {
      cancelled = true;
      marker?.setMap(null);
    };
  }, [lat, lng]);
  if (lat == null || lng == null) return <p className="text-sm text-ink-muted">Select a city on the previous screen before confirming a pin.</p>;
  return (
    <div>
      <div ref={ref} className="h-56 w-full overflow-hidden rounded-xl ring-1 ring-[#E6EAF0]" />
      {failed || !googleMapsBrowserKey() ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" className="tv-btn-secondary !min-h-11" onClick={() => onMove(lat + 0.0004, lng)}>North</button>
          <button type="button" className="tv-btn-secondary !min-h-11" onClick={() => onMove(lat - 0.0004, lng)}>South</button>
          <button type="button" className="tv-btn-secondary !min-h-11" onClick={() => onMove(lat, lng - 0.0008)}>West</button>
          <button type="button" className="tv-btn-secondary !min-h-11" onClick={() => onMove(lat, lng + 0.0008)}>East</button>
        </div>
      ) : null}
    </div>
  );
}

function PropertyStage({ values, onChange, minTitle, maxTitle, maxSubtitle }: Props) {
  const types = stayPropertyTypesForMode('single');
  return (
    <div className="space-y-4">
      {values.stayAccommodationMode === 'multi' ? (
        <p className="rounded-xl bg-[#F4F8FC] px-3 py-3 text-sm text-ink ring-1 ring-[#D5E2F2]">
          Several room types stay saved, and they cannot be booked yet. This listing publishes as one accommodation.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        {types.map((type) => {
          const on = (values.stayPropertyType || 'Apartment') === type;
          return (
            <button key={type} type="button" aria-pressed={on} className={`min-h-11 rounded-xl px-3 text-left text-sm font-semibold ${on ? 'bg-[#F4F8FC] text-[#0B397E] ring-2 ring-[#0B397E]' : 'ring-1 ring-[#E6EAF0]'}`} onClick={() => onChange({ stayPropertyType: type })}>
              {type === 'Room' ? 'Private room' : type}
            </button>
          );
        })}
      </div>
      <Field label="Accommodation name">
        <input className="tv-input w-full" value={values.title} maxLength={maxTitle} onChange={(e) => onChange({ title: e.target.value.slice(0, maxTitle) })} />
      </Field>
      <p className="text-xs text-ink-muted">{values.title.trim().length} / {maxTitle}. At least {minTitle} characters.</p>
      <Field label="Short line">
        <input className="tv-input w-full" value={values.subtitle} maxLength={maxSubtitle} onChange={(e) => onChange({ subtitle: e.target.value.slice(0, maxSubtitle) })} />
      </Field>
    </div>
  );
}

function RoomsStage({ areas, onChange }: { areas: StaySleepingArea[]; onChange: (next: StaySleepingArea[]) => void }) {
  function add(living: boolean) {
    onChange([...areas, { id: newStayOptionId(), name: living ? 'Living area' : `Bedroom ${areas.filter((area) => !/living/i.test(area.name)).length + 1}`, beds: [] }]);
  }
  return (
    <div className="space-y-3">
      {areas.map((area) => (
        <section key={area.id} className="stay-stage-forward rounded-xl p-3 ring-1 ring-[#E6EAF0]">
          <div className="flex items-center gap-2">
            <input className="tv-input min-w-0 flex-1" aria-label="Room name" value={area.name} maxLength={40} onChange={(e) => onChange(areas.map((row) => row.id === area.id ? { ...row, name: e.target.value.slice(0, 40) } : row))} />
            <button type="button" className="min-h-11 px-2 text-sm text-ink-muted" onClick={() => onChange(areas.filter((row) => row.id !== area.id))}>Remove</button>
          </div>
          <ul className="mt-2 space-y-2">
            {area.beds.map((bed, index) => (
              <li key={`${area.id}-${index}`} className="grid grid-cols-[1fr_5rem_auto] items-center gap-2">
                <select className="tv-input w-full" value={bed.kind} onChange={(e) => onChange(areas.map((row) => row.id === area.id ? { ...row, beds: row.beds.map((item, i) => i === index ? { ...item, kind: e.target.value as StayBedKind } : item) } : row))}>
                  {STAY_BED_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
                </select>
                <input className="tv-input w-full" inputMode="numeric" aria-label="Bed count" value={bed.count} onChange={(e) => onChange(areas.map((row) => row.id === area.id ? { ...row, beds: row.beds.map((item, i) => i === index ? { ...item, count: Math.max(1, Math.min(20, Number(e.target.value) || 1)) } : item) } : row))} />
                <button type="button" className="min-h-11 text-sm text-ink-muted" onClick={() => onChange(areas.map((row) => row.id === area.id ? { ...row, beds: row.beds.filter((_, i) => i !== index) } : row))}>Remove</button>
              </li>
            ))}
          </ul>
          <button type="button" className="mt-2 min-h-11 text-sm font-semibold text-finland" onClick={() => onChange(areas.map((row) => row.id === area.id ? { ...row, beds: [...row.beds, { kind: 'double', count: 1 }] } : row))}>Add a bed</button>
        </section>
      ))}
      <div className="flex gap-2">
        <button type="button" className="tv-btn-secondary !min-h-11 flex-1" onClick={() => add(false)}>Add bedroom</button>
        <button type="button" className="tv-btn-secondary !min-h-11 flex-1" onClick={() => add(true)}>Add living area</button>
      </div>
      <p className="text-sm text-ink-muted">Beds sleep {staySleepCapacity(stayMixFromAreas(areas))} guests. Living areas are not counted as bedrooms.</p>
    </div>
  );
}

function DescriptionStage({ values, onChange, minDescription, maxDescription }: Props) {
  return (
    <div className="space-y-4">
      <Field label="Description">
        <textarea className="tv-input min-h-40 w-full" value={values.description} maxLength={maxDescription} onChange={(e) => onChange({ description: e.target.value.slice(0, maxDescription) })} />
      </Field>
      <p className="text-xs text-ink-muted">{values.description.trim().length} / {maxDescription}. At least {minDescription} characters.</p>
      {[0, 1, 2].map((index) => (
        <Field key={index} label={index === 0 ? 'Highlights, optional' : 'Another highlight'}>
          <input className="tv-input w-full" value={values.highlights[index] ?? ''} maxLength={80} onChange={(e) => {
            const highlights = [...values.highlights];
            highlights[index] = e.target.value.slice(0, 80);
            onChange({ highlights });
          }} />
        </Field>
      ))}
    </div>
  );
}

function BookingStage({ values, onChange, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  function setClock(key: 'stayCheckIn' | 'stayCheckOut', value: string) {
    const schedules = option.schedules.map((schedule, index) => index === 0 ? { ...schedule, [key === 'stayCheckIn' ? 'checkIn' : 'checkOut']: value } : schedule);
    const rest = values.stayOptions.filter((row) => row.id !== option.id);
    onChange({ [key]: value, stayOptions: [{ ...option, schedules }, ...rest] });
  }
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[#F4F8FC] p-3 ring-1 ring-[#D5E2F2]">
        <p className="text-sm font-semibold text-ink">Instant booking</p>
        <p className="mt-1 text-sm text-ink-muted">Guests choose dates, pay, and receive confirmation. Request-to-book is not available, because approval, expiry, and a separate payment hold are not part of checkout yet.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Check-in from">
          <input className="tv-input w-full" type="time" value={values.stayCheckIn} onChange={(e) => setClock('stayCheckIn', e.target.value)} />
        </Field>
        <Field label="Checkout by">
          <input className="tv-input w-full" type="time" value={values.stayCheckOut} onChange={(e) => setClock('stayCheckOut', e.target.value)} />
        </Field>
      </div>
      <Field label="Stop new bookings this many hours before check-in">
        <input className="tv-input w-full" inputMode="numeric" value={values.stayCutoffMinutes == null ? '' : String(Math.round(values.stayCutoffMinutes / 60))} onChange={(e) => {
          const hours = Math.max(0, Math.min(24 * 56, Number(e.target.value) || 0));
          writeOption({ ...option, cutoffMinutes: hours * 60 });
        }} />
      </Field>
    </div>
  );
}

function AvailabilityStage({ values, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const today = localYmd(new Date());
  const season = option.schedules[0];
  const several = option.schedules.length > 1;
  return (
    <div className="space-y-4">
      <button type="button" className={`min-h-11 w-full rounded-xl px-3 text-left text-sm font-semibold ${values.stayAvailabilityMode !== 'scheduled' ? 'bg-[#F4F8FC] text-[#0B397E] ring-2 ring-[#0B397E]' : 'ring-1 ring-[#E6EAF0]'}`} onClick={() => writeOption({ ...option, availabilityMode: 'open' })}>
        Open ongoing
        <span className="mt-1 block font-normal text-ink-muted">Guests can book future nights unless a saved schedule says otherwise.</span>
      </button>
      <button type="button" className={`min-h-11 w-full rounded-xl px-3 text-left text-sm font-semibold ${values.stayAvailabilityMode === 'scheduled' ? 'bg-[#F4F8FC] text-[#0B397E] ring-2 ring-[#0B397E]' : 'ring-1 ring-[#E6EAF0]'}`} onClick={() => {
        if (several) return;
        const start = season?.start || today;
        const end = season?.end || today;
        writeOption({
          ...option,
          availabilityMode: 'scheduled',
          schedules: [{
            id: season?.id || newStayOptionId(),
            name: season?.name || 'Open period',
            start,
            end,
            enabled: true,
            nightlyPrice: option.nightlyPrice,
            minNights: option.minNights,
            checkIn: values.stayCheckIn,
            checkOut: values.stayCheckOut,
            cleaningFee: option.cleaningFee,
            extras: season?.extras,
          }],
        });
      }}>
        A first and last night
        <span className="mt-1 block font-normal text-ink-muted">Nights outside this period cannot be booked.</span>
      </button>
      {several ? <p className="text-sm text-ink-muted">This stay already has more than one schedule. Those seasons stay as they are. Change them after publishing.</p> : null}
      {values.stayAvailabilityMode === 'scheduled' && !several ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <TraverionSingleDateField id="stay-open-start" label="First occupied night" value={season?.start ?? ''} minIso={today} onChange={(start) => season && writeOption({ ...option, schedules: [{ ...season, start }] })} />
          <TraverionSingleDateField id="stay-open-end" label="Last occupied night" value={season?.end ?? ''} minIso={season?.start || today} onChange={(end) => season && writeOption({ ...option, schedules: [{ ...season, end }] })} />
        </div>
      ) : null}
      <p className="text-sm text-ink-muted">Closing single nights is done by shortening this period. Checkout never charges the departure morning.</p>
    </div>
  );
}

function GuestsStage({ values, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  const sleeps = staySleepCapacity(option.bedMix);
  return (
    <div className="space-y-4">
      <Field label="Maximum guests">
        <input className="tv-input w-full" inputMode="numeric" value={values.stayMaxGuests} onChange={(e) => writeOption({ ...option, maxGuests: Math.max(1, Math.min(50, Number(e.target.value) || 1)) })} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Minimum nights">
          <input className="tv-input w-full" inputMode="numeric" value={values.stayMinNights} onChange={(e) => writeOption({ ...option, minNights: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} />
        </Field>
        <Field label="Maximum nights, optional">
          <input className="tv-input w-full" inputMode="numeric" value={option.schedules[0]?.maxNights ?? ''} onChange={(e) => {
            const raw = e.target.value.trim();
            const maxNights = raw ? Math.max(1, Math.min(365, Number(raw) || 1)) : null;
            const season = option.schedules[0] ?? {
              id: newStayOptionId(),
              name: 'Standard',
              start: '2020-01-01',
              end: '2099-12-31',
              enabled: true,
              nightlyPrice: option.nightlyPrice,
              minNights: option.minNights,
              checkIn: values.stayCheckIn,
              checkOut: values.stayCheckOut,
              cleaningFee: option.cleaningFee,
            };
            writeOption({ ...option, availabilityMode: option.availabilityMode, schedules: [{ ...season, maxNights }] });
          }} />
        </Field>
      </div>
      {sleeps >= 1 ? <p className="text-sm text-ink-muted">The beds sleep {sleeps}. A higher guest limit cannot be published.</p> : null}
    </div>
  );
}

function PricingStage({ values, currency, option, writeOption }: Props & { option: StayAccommodationOption; writeOption: (next: StayAccommodationOption) => void }) {
  return (
    <div className="space-y-4">
      <Field label={`Nightly price · ${currency}`}>
        <input className="tv-input w-full" inputMode="decimal" value={values.stayNightly} onChange={(e) => {
          const nightly = Number(e.target.value);
          writeOption({ ...option, nightlyPrice: Number.isFinite(nightly) && nightly > 0 ? Math.round(nightly * 100) / 100 : null });
        }} />
      </Field>
      <Field label={`Cleaning fee · ${currency}, optional`}>
        <input className="tv-input w-full" inputMode="decimal" value={values.stayCleaningFee} onChange={(e) => {
          const cleaning = Number(e.target.value);
          writeOption({ ...option, cleaningFee: Number.isFinite(cleaning) && cleaning >= 0 ? Math.round(cleaning * 100) / 100 : null });
        }} />
      </Field>
      <div className="rounded-xl p-3 ring-1 ring-[#E6EAF0]">
        <p className="text-sm font-semibold text-ink">Introductory offer · off</p>
        <p className="mt-1 text-sm text-ink-muted">No discount is applied. Weekly and monthly discounts, extra-guest fees, and optional extras stay on the pricing schedule after you publish, and checkout calculates them there.</p>
      </div>
    </div>
  );
}

function ArrivalStage({ values, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {STAY_ARRIVAL_METHODS.map(([id, label]) => {
          const on = values.stayArrivalMethod === id;
          return (
            <button key={id} type="button" aria-pressed={on} className={`min-h-11 rounded-xl px-3 text-left text-sm font-semibold ${on ? 'bg-[#F4F8FC] text-[#0B397E] ring-2 ring-[#0B397E]' : 'ring-1 ring-[#E6EAF0]'}`} onClick={() => onChange({ stayArrivalMethod: id })}>
              {label}
            </button>
          );
        })}
      </div>
      {values.stayArrivalMethod ? <p className="text-sm text-ink-muted">{stayArrivalMethodHint(values.stayArrivalMethod)}</p> : null}
      <Field label="Public arrival note">
        <textarea className="tv-input min-h-20 w-full" maxLength={160} value={values.stayArrivalNote} onChange={(e) => onChange({ stayArrivalNote: e.target.value.slice(0, 160) })} />
      </Field>
      <Field label="Private arrival address">
        <textarea className="tv-input min-h-24 w-full" maxLength={400} value={values.stayCheckInAddress} onChange={(e) => onChange({ stayCheckInAddress: e.target.value.slice(0, 400), stayAddressStreet: e.target.value.slice(0, 160) })} />
      </Field>
      <p className="text-xs text-ink-muted">Booked guests see the private address after payment. Do not put a door code in the public note.</p>
    </div>
  );
}

function PhotosStage(props: Props) {
  const [roomPhotos, setRoomPhotos] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button type="button" className={`min-h-11 rounded-full px-3 text-sm ${!roomPhotos ? 'bg-[#F4F8FC] font-semibold text-[#0B397E] ring-1 ring-[#0B397E]' : 'text-ink-muted'}`} onClick={() => setRoomPhotos(false)}>Gallery</button>
        <button type="button" className={`min-h-11 rounded-full px-3 text-sm ${roomPhotos ? 'bg-[#F4F8FC] font-semibold text-[#0B397E] ring-1 ring-[#0B397E]' : 'text-ink-muted'}`} onClick={() => setRoomPhotos(true)}>Rooms</button>
      </div>
      {roomPhotos ? (
        <StayBedroomPhotos options={props.values.stayOptions} galleryUrls={props.values.photoSlots.filter((url) => url.startsWith('http'))} userId={props.userId} uploadsEnabled={props.uploadsEnabled} onChange={(stayOptions) => props.onChange({ stayOptions })} />
      ) : (
        <ListingImageFields
          photoSlots={props.values.photoSlots}
          photoSlotLabels={props.values.photoSlotLabels}
          photoOriginalUrls={props.values.photoOriginalUrls}
          photoCropSettings={props.values.photoCropSettings}
          userId={props.userId}
          uploadsEnabled={props.uploadsEnabled}
          onPhotosChange={({ slots, labels, originals, crops }) => props.onChange({ photoSlots: slots, photoSlotLabels: labels, photoOriginalUrls: originals, photoCropSettings: crops })}
        />
      )}
    </div>
  );
}

function CancellationStage() {
  return (
    <section className="rounded-xl p-4 ring-1 ring-[#E6EAF0]">
      <p className="text-sm font-semibold text-ink">Traverion standard</p>
      <p className="mt-2 text-sm leading-relaxed text-ink">{STAY_GUEST_CANCELLATION_POLICY}</p>
      <p className="mt-3 text-sm text-ink-muted">This is the policy stored on the listing and copied onto a booking when the guest pays. A different refund promise is not active.</p>
    </section>
  );
}

function PoliciesStage({ values, onChange }: Props) {
  const rules = values.stayHouseRules.toLowerCase();
  const petsConflict = values.stayPets === 'not_allowed' && /pets welcome|pet friendly/.test(rules);
  return (
    <div className="space-y-4">
      <Choice label="Pets" value={values.stayPets} options={[['allowed', 'Allowed'], ['not_allowed', 'Not allowed'], ['approval', 'Ask first']]} onChange={(stayPets) => onChange({ stayPets })} />
      <Choice label="Smoking" value={values.staySmoking} options={[['not_allowed', 'Not allowed'], ['allowed', 'Allowed']]} onChange={(staySmoking) => onChange({ staySmoking })} />
      <Choice label="Parties" value={values.stayParties} options={[['not_allowed', 'Not allowed'], ['allowed', 'Allowed']]} onChange={(stayParties) => onChange({ stayParties })} />
      <Choice label="Children" value={values.stayChildren} options={[['', 'No extra rule'], ['welcome', 'Welcome'], ['not_suitable', 'Not suitable']]} onChange={(stayChildren) => onChange({ stayChildren })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Quiet hours from"><input className="tv-input w-full" type="time" value={values.stayQuietStart} onChange={(e) => onChange({ stayQuietStart: e.target.value })} /></Field>
        <Field label="Until"><input className="tv-input w-full" type="time" value={values.stayQuietEnd} onChange={(e) => onChange({ stayQuietEnd: e.target.value })} /></Field>
      </div>
      <Field label="House rules">
        <textarea className="tv-input min-h-28 w-full" maxLength={2000} value={values.stayHouseRules} onChange={(e) => onChange({ stayHouseRules: e.target.value.slice(0, 2000) })} />
      </Field>
      {petsConflict ? <p className="text-sm font-medium text-red-700">The written rules welcome pets, but pets are set to not allowed. Change one of them.</p> : null}
    </div>
  );
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-ink">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(([id, text]) => (
          <button key={id || text} type="button" aria-pressed={value === id} className={`min-h-11 rounded-full px-3 text-sm font-semibold ${value === id ? 'bg-[#F4F8FC] text-[#0B397E] ring-2 ring-[#0B397E]' : 'ring-1 ring-[#E6EAF0]'}`} onClick={() => onChange(id)}>{text}</button>
        ))}
      </div>
    </fieldset>
  );
}

function PreviewStage({ values, currency, onEditStage, option }: Props & { option: StayAccommodationOption }) {
  const rows: { label: string; text: string; stage: number }[] = [
    { label: 'Location', text: [values.city, values.country].filter(Boolean).join(', ') || 'Not set', stage: 0 },
    { label: 'Property', text: `${values.stayPropertyType || 'Apartment'} · ${values.title || 'Untitled'}`, stage: 2 },
    { label: 'Sleeping', text: `${values.stayBedrooms || option.bedrooms || 0} bedrooms · sleeps ${staySleepCapacity(option.bedMix) || '—'}`, stage: 4 },
    { label: 'Price', text: values.stayNightly ? `${values.stayNightly} ${currency} / night` : 'Not set', stage: 9 },
    { label: 'Arrival', text: values.stayArrivalMethod || 'Not set', stage: 10 },
  ];
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-3 rounded-xl px-3 py-3 ring-1 ring-[#E6EAF0]">
          <div>
            <p className="text-xs text-ink-muted">{row.label}</p>
            <p className="text-sm font-medium text-ink">{row.text}</p>
          </div>
          <button type="button" className="min-h-11 text-sm font-semibold text-finland" onClick={() => onEditStage(row.stage)}>Edit</button>
        </div>
      ))}
      <StayExampleQuote
        currency={currency}
        nightly={Number.parseFloat(values.stayNightly) || 0}
        cleaningFee={Number.parseFloat(values.stayCleaningFee) || 0}
        minNights={Number.parseInt(values.stayMinNights, 10) || 1}
        maxGuests={Number.parseInt(values.stayMaxGuests, 10) || null}
        guestPolicy={option.guestPolicy}
        availabilityMode={values.stayAvailabilityMode}
        seasons={option.schedules}
      />
      <p className="text-xs text-ink-muted">The example uses the same pricing rules as checkout. It is not a booking.</p>
    </div>
  );
}

