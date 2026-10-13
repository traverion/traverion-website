import { useMemo, useState } from 'react';
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';
import PartnerSelect from '../PartnerSelect';
import {
  formatBookingContactForDisplay,
  suggestDefaultPhoneCountry,
  validateBookingContactPhone,
} from '../../../lib/listing-booking-contact-phone';

const PRIORITY_COUNTRIES: CountryCode[] = [
  'FI',
  'SE',
  'NO',
  'DK',
  'EE',
  'DE',
  'GB',
  'US',
  'FR',
  'ES',
  'IT',
  'NL',
];

function countryOptions(): { value: CountryCode; label: string }[] {
  const all = getCountries();
  const displayNames =
    typeof Intl !== 'undefined' && 'DisplayNames' in Intl
      ? new Intl.DisplayNames(['en'], { type: 'region' })
      : null;
  const labelFor = (code: CountryCode) => {
    const name = displayNames?.of(code) ?? code;
    return `${name} (+${getCountryCallingCode(code)})`;
  };
  const priority = PRIORITY_COUNTRIES.filter((c) => all.includes(c)).map((c) => ({
    value: c,
    label: labelFor(c),
  }));
  const rest = all
    .filter((c) => !PRIORITY_COUNTRIES.includes(c))
    .map((c) => ({ value: c, label: labelFor(c) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...priority, ...rest];
}

type Props = {
  id?: string;
  valueE164: string;
  onChangeE164: (e164: string) => void;
  businessCountry?: string | null;
  businessPhoneHint?: string | null;
  error?: string | null;
  requiredForPublish?: boolean;
};

export default function BookingContactPhoneField({
  id = 'supplier-listing-booking-contact',
  valueE164,
  onChangeE164,
  businessCountry,
  businessPhoneHint,
  error,
  requiredForPublish = true,
}: Props) {
  const options = useMemo(() => countryOptions(), []);
  const suggested = suggestDefaultPhoneCountry(businessCountry);
  const parsedExisting = valueE164.trim()
    ? parsePhoneNumberFromString(valueE164.trim())
    : undefined;
  const [country, setCountry] = useState<CountryCode>(
    (parsedExisting?.country as CountryCode | undefined) ?? suggested
  );
  const [national, setNational] = useState(() => {
    if (parsedExisting) return parsedExisting.formatNational();
    return '';
  });

  const syncFromParts = (nextCountry: CountryCode, nextNational: string) => {
    setCountry(nextCountry);
    setNational(nextNational);
    const combined = nextNational.trim()
      ? `+${getCountryCallingCode(nextCountry)}${nextNational.replace(/[^\d]/g, '')}`
      : '';
    if (!combined) {
      onChangeE164('');
      return;
    }
    const result = validateBookingContactPhone(combined, nextCountry);
    onChangeE164(result.ok ? result.e164 : combined);
  };

  const reuseBusiness = () => {
    const hint = (businessPhoneHint ?? '').trim();
    if (!hint) return;
    const result = validateBookingContactPhone(hint, country);
    if (result.ok) {
      const p = parsePhoneNumberFromString(result.e164);
      if (p?.country) setCountry(p.country as CountryCode);
      setNational(p ? p.formatNational() : result.e164);
      onChangeE164(result.e164);
    } else {
      syncFromParts(country, hint);
    }
  };

  return (
    <div id="supplier-listing-field-booking-contact" className="space-y-2">
      <div>
        <label htmlFor={id} className="block text-[13px] font-semibold text-ink">
          Booking contact number{requiredForPublish ? ' *' : ''}
        </label>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
          Shared only with confirmed customers — not shown on the public listing.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(13rem,15.5rem)_minmax(0,1fr)] sm:items-stretch">
        <PartnerSelect
          id={`${id}-country`}
          className="min-w-0"
          value={country}
          onChange={(v) => syncFromParts((v || country) as CountryCode, national)}
          options={options.map((o) => ({ value: o.value, label: o.label }))}
          aria-label="Country code"
        />
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={national}
          onChange={(e) => syncFromParts(country, e.target.value)}
          className="tv-input min-h-11 w-full px-3.5 text-[15px]"
          placeholder="Phone number"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
        />
      </div>
      {valueE164.trim() ? (
        <p id={`${id}-hint`} className="text-[12px] text-ink-muted">
          Saved as {formatBookingContactForDisplay(valueE164)}
        </p>
      ) : (
        <p id={`${id}-hint`} className="sr-only">
          Enter a phone number with country code. Shared only with confirmed customers.
        </p>
      )}
      {businessPhoneHint?.trim() ? (
        <button
          type="button"
          onClick={reuseBusiness}
          className="text-[12px] font-medium text-finland underline-offset-2 hover:underline"
        >
          Use business number ({formatBookingContactForDisplay(businessPhoneHint.trim())})
        </button>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-[12px] text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
