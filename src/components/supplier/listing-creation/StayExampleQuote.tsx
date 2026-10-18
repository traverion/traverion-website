import { useState } from 'react';
import { formatMoney } from '../../../lib/money';
import { quoteStayLodging, type StayAvailabilityMode, type StaySeasonWindow } from '../../../lib/stay-season-quote';
import { normalizeStayGuestPolicy, stayGuestAgeCopy, validateStayGuestParty, type StayGuestParty, type StayGuestPolicy } from '../../../lib/stay-guest-party';
import { priceStayAddOns, stayChargeLines, type StayExtraSelection } from '../../../lib/stay-price';
import { TraverionSingleDateField } from '../../calendar/TraverionSingleDateField';
import { localYmd } from '../../../lib/local-ymd';

type Props = {
  currency: string;
  nightly: number;
  cleaningFee: number;
  minNights: number;
  maxGuests: number | null;
  guestPolicy?: StayGuestPolicy;
  availabilityMode: StayAvailabilityMode;
  seasons: StaySeasonWindow[];
};

export default function StayExampleQuote({
  currency,
  nightly,
  cleaningFee,
  minNights,
  maxGuests,
  guestPolicy,
  availabilityMode,
  seasons,
}: Props) {
  const today = localYmd(new Date());
  const policy = normalizeStayGuestPolicy(guestPolicy);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [party, setParty] = useState<StayGuestParty>({ adults: 2, children: 0, infants: 0 });
  const [selected, setSelected] = useState<StayExtraSelection[]>([]);
  const ages = stayGuestAgeCopy(policy);
  const nightCount =
    checkIn && checkOut
      ? Math.round((Date.parse(`${checkOut}T12:00:00Z`) - Date.parse(`${checkIn}T12:00:00Z`)) / 86400000)
      : 0;
  const lodging =
    nightCount >= 1
      ? quoteStayLodging({
          checkIn,
          nights: nightCount,
          baseNightly: nightly,
          baseMinNights: minNights >= 1 ? minNights : 1,
          availabilityMode,
          seasons,
        })
      : null;
  const guests = maxGuests != null ? validateStayGuestParty(party, policy, maxGuests) : null;
  const addOns =
    lodging && lodging.ok && guests && guests.ok
      ? priceStayAddOns({
          lodging: lodging.lodging,
          nights: lodging.nightlyPrices.length,
          countedGuests: guests.counted,
          includedGuests: lodging.includedGuests,
          extraGuestNightly: lodging.extraGuestNightly,
          weeklyDiscountPercent: lodging.weeklyDiscountPercent,
          monthlyDiscountPercent: lodging.monthlyDiscountPercent,
          extras: lodging.extras,
          selected,
        })
      : null;
  const lines =
    lodging && lodging.ok && addOns && addOns.ok
      ? stayChargeLines({
          nights: lodging.nightlyPrices.length,
          nightlyPrice: lodging.nightlyPrices[0] ?? nightly,
          nightlyPrices: lodging.nightlyPrices,
          cleaningFee: lodging.cleaningFee ?? cleaningFee,
          extraGuestCount: addOns.extraGuestCount,
          extraGuestFee: addOns.extraGuestFee,
          discount: addOns.discount,
          discountLabel: addOns.discountLabel,
          extraLines: addOns.extraLines,
        })
      : [];
  const total = lines.reduce((sum, line) => sum + line.amount, 0);

  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-[#E6EAF0]">
      <h3 className="text-base font-semibold text-ink">Example quote</h3>
      <p className="mt-1 text-sm text-ink-muted">
        {nightly > 0 ? `From ${formatMoney(nightly, currency)} / night until dates are chosen. ` : ''}
        This preview uses the same pricing rules as checkout. It does not create a booking.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <TraverionSingleDateField id="stay-preview-in" label="First occupied night" value={checkIn} minIso={today} onChange={setCheckIn} />
        <TraverionSingleDateField id="stay-preview-out" label="Checkout" value={checkOut} minIso={checkIn || today} onChange={setCheckOut} />
      </div>
      <p className="mt-3 text-[12.5px] text-ink-muted">{ages.summary}</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(['adults', 'children', 'infants'] as const).map((key) => (
          <label key={key} className="text-sm font-semibold text-ink">
            {key[0].toUpperCase() + key.slice(1)}
            <input
              className="tv-input mt-1 w-full font-normal"
              inputMode="numeric"
              value={party[key]}
              onChange={(e) => setParty({ ...party, [key]: Math.max(0, Math.min(20, Number(e.target.value) || 0)) })}
            />
          </label>
        ))}
      </div>
      {lodging && !lodging.ok ? <p className="mt-3 text-sm text-red-700">{lodging.error}</p> : null}
      {guests && !guests.ok ? <p className="mt-3 text-sm text-red-700">{guests.error}</p> : null}
      {addOns && !addOns.ok ? <p className="mt-3 text-sm text-red-700">{addOns.error}</p> : null}
      {addOns && addOns.ok
        ? addOns.offeredExtras.filter((extra) => !extra.mandatory).map((extra) => {
            const on = selected.some((row) => row.id === extra.id);
            return (
              <button
                key={extra.id}
                type="button"
                className="mt-2 min-h-11 text-sm font-semibold text-finland"
                onClick={() => setSelected((current) => (on ? current.filter((row) => row.id !== extra.id) : [...current, { id: extra.id, quantity: 1 }]))}
              >
                {on ? `Remove ${extra.name}` : `Add ${extra.name}`}
              </button>
            );
          })
        : null}
      {lines.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-ink">
          {lines.map((line) => (
            <li key={line.label} className="flex justify-between gap-3">
              <span>{line.label}</span>
              <span className="tabular-nums">{formatMoney(line.amount, currency)}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 border-t border-black/[0.06] pt-2 font-semibold">
            <span>Example total</span>
            <span className="tabular-nums">{formatMoney(total, currency)}</span>
          </li>
        </ul>
      ) : nightly > 0 ? (
        <p className="mt-3 text-sm font-semibold text-ink">From {formatMoney(nightly, currency)} / night</p>
      ) : (
        <p className="mt-3 text-sm text-ink-muted">Add a nightly rate before this preview can show a price.</p>
      )}
    </section>
  );
}
