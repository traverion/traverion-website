import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, Circle, Lock } from 'lucide-react';
import {
  invokeConnectSupplierOnboarding,
  type ConnectOnboardingResult,
} from '../../data/supabase-connect-onboarding';
import {
  fetchSupplierProfile,
  type SupplierProfileRow,
} from '../../data/supabase-supplier-profile';
import { createBankAccountToken } from '../../lib/stripe-js-client';
import { USER_ERROR, userFacingError } from '../../lib/userFacingError';
import { PARTNER_APP_BASE } from '../../lib/partnerPortalPaths';
import { navigateSupplierUrl } from '../../lib/supplierPortalNavigation';
import ConnectEmbeddedPanel from './ConnectEmbeddedPanel';

type StepId = 'business' | 'representative' | 'agreement' | 'identity' | 'bank' | 'review';

type Props = {
  userId: string;
  profile: SupplierProfileRow | null;
  canEdit: boolean;
  onProfile: (profile: SupplierProfileRow | null) => void;
  onClose: () => void;
  /** When true, jump to bank step (from Settings → Add bank account). */
  initialFocus?: 'full' | 'bank';
};

const STEPS: { id: StepId; label: string }[] = [
  { id: 'business', label: 'Business' },
  { id: 'representative', label: 'Representative' },
  { id: 'agreement', label: 'Agreement' },
  { id: 'identity', label: 'Identity' },
  { id: 'bank', label: 'Bank' },
  { id: 'review', label: 'Review' },
];

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block text-[13px]">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#71717a]">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-[#71717a]">{hint}</span> : null}
    </label>
  );
}

function parseDob(value: string): { day: number; month: number; year: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!year || !month || !day) return null;
  return { day, month, year };
}

export default function SupplierNativeVerificationJourney({
  userId,
  profile,
  canEdit,
  onProfile,
  onClose,
  initialFocus = 'full',
}: Props) {
  const isIndividual = profile?.business_type === 'individual';
  const country = (profile?.address_country || profile?.connect_country || 'FI').toUpperCase();
  const currency = (profile?.connect_default_currency || 'EUR').toUpperCase();

  const [step, setStep] = useState<StepId>(initialFocus === 'bank' ? 'bank' : 'business');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [legacyExpress, setLegacyExpress] = useState(false);
  const [showLegacyEmbedded, setShowLegacyEmbedded] = useState(false);
  const [lastMirror, setLastMirror] = useState<ConnectOnboardingResult | null>(null);

  const [legalName, setLegalName] = useState(profile?.company_legal_name || profile?.display_name || '');
  const [businessType, setBusinessType] = useState<'company' | 'individual'>(
    profile?.business_type === 'individual' ? 'individual' : 'company'
  );
  const [regNumber, setRegNumber] = useState(profile?.company_registration_number || '');
  const [taxId, setTaxId] = useState(profile?.tax_id || '');
  const [phone, setPhone] = useState(profile?.contact_phone || '');
  const [line1, setLine1] = useState(profile?.address_street || '');
  const [city, setCity] = useState(profile?.address_city || '');
  const [postal, setPostal] = useState(profile?.address_postal_code || '');
  const [addrCountry, setAddrCountry] = useState(country);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [repEmail, setRepEmail] = useState('');
  const [repPhone, setRepPhone] = useState(profile?.contact_phone || '');
  const [title, setTitle] = useState(isIndividual ? 'Owner' : 'Director');
  const [dob, setDob] = useState('');
  const [isOwner, setIsOwner] = useState(true);
  const [percentOwnership, setPercentOwnership] = useState('25');
  const [tosAccepted, setTosAccepted] = useState(false);

  const [holderName, setHolderName] = useState(profile?.company_legal_name || profile?.display_name || '');
  const [iban, setIban] = useState('');

  const due = useMemo(() => {
    const fromMirror = lastMirror?.onboarding?.connect_requirements_currently_due;
    if (Array.isArray(fromMirror)) return fromMirror as string[];
    return Array.isArray(profile?.connect_requirements_currently_due)
      ? profile!.connect_requirements_currently_due!
      : [];
  }, [lastMirror, profile?.connect_requirements_currently_due]);

  const needsIdentityDoc = due.some((r) => /verification\.document|identity/i.test(String(r)));
  const identityException = needsIdentityDoc;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setBusy(true);
      setError(null);
      const ensured = await invokeConnectSupplierOnboarding('ensure_account');
      if (cancelled) return;
      setBusy(false);
      if (!ensured.success) {
        setError(userFacingError(ensured.error, USER_ERROR.generic));
        return;
      }
      setLastMirror(ensured);
      if (ensured.account_type === 'express' || ensured.onboarding_mode === 'embedded') {
        setLegacyExpress(true);
      }
      onProfile(await fetchSupplierProfile(userId));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, onProfile]);

  const refresh = async () => {
    const result = await invokeConnectSupplierOnboarding('refresh');
    if (result.success) {
      setLastMirror(result);
      onProfile(await fetchSupplierProfile(userId));
    }
    return result;
  };

  const applyResult = async (result: ConnectOnboardingResult, okNote?: string) => {
    if (!result.success) {
      if (result.account_type === 'express') {
        setLegacyExpress(true);
      }
      setError(userFacingError(result.error, USER_ERROR.generic));
      return false;
    }
    setLastMirror(result);
    setError(null);
    if (okNote) setNote(okNote);
    if (result.person_id) setPersonId(result.person_id);
    onProfile(await fetchSupplierProfile(userId));
    return true;
  };

  const goNext = (from: StepId) => {
    const order = STEPS.map((s) => s.id);
    const idx = order.indexOf(from);
    const next = order[Math.min(idx + 1, order.length - 1)];
    setStep(next);
    setNote(null);
  };

  const submitBusiness = async () => {
    if (!canEdit) return;
    setBusy(true);
    setError(null);
    const result = await invokeConnectSupplierOnboarding('submit_business', {
      business: {
        legal_name: legalName.trim(),
        business_type: businessType,
        registration_number: regNumber.trim() || undefined,
        tax_id: taxId.trim() || undefined,
        phone: phone.trim() || undefined,
        address: {
          line1: line1.trim(),
          city: city.trim(),
          postal_code: postal.trim(),
          country: addrCountry.trim().toUpperCase(),
        },
      },
    });
    setBusy(false);
    if (await applyResult(result, 'Business details saved.')) goNext('business');
  };

  const submitRepresentative = async () => {
    if (!canEdit) return;
    const parsedDob = parseDob(dob);
    if (!parsedDob) {
      setError('Enter a valid date of birth.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await invokeConnectSupplierOnboarding('submit_representative', {
      representative: {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: repEmail.trim() || undefined,
        phone: repPhone.trim() || undefined,
        title: title.trim() || undefined,
        dob: parsedDob,
        address: {
          line1: line1.trim(),
          city: city.trim(),
          postal_code: postal.trim(),
          country: addrCountry.trim().toUpperCase(),
        },
        relationship: {
          owner: isOwner,
          executive: true,
          director: businessType === 'company',
          percent_ownership: isOwner ? Number(percentOwnership) || null : null,
        },
      },
    });
    setBusy(false);
    if (await applyResult(result, 'Representative saved.')) goNext('representative');
  };

  const submitTos = async () => {
    if (!canEdit || !tosAccepted) {
      setError('Accept the Connected Account Agreement to continue.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await invokeConnectSupplierOnboarding('accept_tos', { tos_accepted: true });
    setBusy(false);
    if (await applyResult(result, 'Agreement recorded.')) goNext('agreement');
  };

  const submitBank = async () => {
    if (!canEdit) return;
    if (!iban.trim() || !holderName.trim()) {
      setError('Enter the account holder name and IBAN.');
      return;
    }
    setBusy(true);
    setError(null);
    const tokenized = await createBankAccountToken({
      country: addrCountry || country,
      currency,
      accountNumber: iban,
      accountHolderName: holderName,
      accountHolderType: businessType,
    });
    if ('error' in tokenized) {
      setBusy(false);
      setError(tokenized.error);
      return;
    }
    const result = await invokeConnectSupplierOnboarding('attach_bank_token', {
      bank_token: tokenized.tokenId,
    });
    setBusy(false);
    setIban('');
    if (await applyResult(result, 'Bank account submitted securely.')) goNext('bank');
  };

  const finish = async () => {
    setBusy(true);
    await refresh();
    setBusy(false);
    onClose();
  };

  if (legacyExpress && showLegacyEmbedded) {
    return (
      <div className="mx-auto w-full max-w-[880px] space-y-4">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#073b83]"
          onClick={() => setShowLegacyEmbedded(false)}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
        <h1 className="text-lg font-bold text-[#18181b]">Secure verification</h1>
        <p className="text-[13px] text-[#52525b]">
          This existing payout account requires a provider-controlled verification step. Traverion stays the workspace;
          only regulated collection happens here.
        </p>
        <ConnectEmbeddedPanel
          component="account_onboarding"
          onExit={async () => {
            await refresh();
            onClose();
          }}
          onHostedFallback={(url) => {
            window.location.assign(url);
          }}
          onError={(msg) => setError(msg)}
        />
      </div>
    );
  }

  const statusLabel =
    (lastMirror?.onboarding?.connect_onboarding_status as string) ||
    profile?.connect_onboarding_status ||
    'not_started';

  return (
    <div className="mx-auto w-full max-w-[880px] space-y-4">
      <header className="space-y-3">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#073b83] transition-colors hover:text-[#052a5c]"
          onClick={onClose}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to payout settings
        </button>
        <div className="space-y-1">
          <h1 className="text-lg font-bold tracking-tight text-[#18181b] sm:text-xl">
            Complete verification
          </h1>
          <p className="max-w-xl text-[13px] leading-relaxed text-[#52525b]">
            Provide business and payout details inside Traverion. Submitting a step does not mean you are verified —
            status updates when review finishes.
          </p>
        </div>
      </header>

      <ol className="flex flex-wrap gap-2" aria-label="Verification steps">
        {STEPS.map((s) => {
          const active = s.id === step;
          const done = STEPS.findIndex((x) => x.id === s.id) < STEPS.findIndex((x) => x.id === step);
          return (
            <li key={s.id}>
              <button
                type="button"
                className={[
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors',
                  active
                    ? 'border-[#073b83]/35 bg-[#f0f4fa] text-[#18181b]'
                    : done
                      ? 'border-emerald-200 bg-emerald-50 text-[#18181b]'
                      : 'border-[#e5e7eb] bg-white text-[#52525b]',
                ].join(' ')}
                onClick={() => setStep(s.id)}
              >
                {done ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                ) : (
                  <Circle className={`h-3.5 w-3.5 ${active ? 'fill-[#073b83] text-[#073b83]' : 'text-[#a1a1aa]'}`} aria-hidden />
                )}
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>

      {legacyExpress ? (
        <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
          <p className="font-semibold">Existing payout account</p>
          <p className="mt-1 text-[12px] leading-relaxed">
            This organization already has a legacy payout account that uses a provider-controlled verification step.
            Continue securely without leaving Traverion, or finish bank updates there.
          </p>
          <button
            type="button"
            className="tv-btn-primary mt-3 h-9 px-3 text-[13px]"
            onClick={() => setShowLegacyEmbedded(true)}
          >
            Continue secure verification
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900" role="alert">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="text-[12px] text-[#18181b]" role="status">
          {note}
        </p>
      ) : null}

      <section className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:px-5">
        {step === 'business' ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#18181b]">Business details</h2>
              <p className="mt-1 text-[13px] text-[#52525b]">
                Prefills from{' '}
                <button
                  type="button"
                  className="font-semibold text-[#073b83]"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile`)}
                >
                  Company Settings
                </button>
                . Update here if payout verification needs a correction.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Legal name">
                <input className="tv-input h-10" value={legalName} disabled={!canEdit || busy} onChange={(e) => setLegalName(e.target.value)} />
              </Field>
              <Field label="Business structure">
                <select
                  className="tv-input h-10"
                  value={businessType}
                  disabled={!canEdit || busy}
                  onChange={(e) => setBusinessType(e.target.value as 'company' | 'individual')}
                >
                  <option value="company">Company</option>
                  <option value="individual">Individual</option>
                </select>
              </Field>
              {businessType === 'company' ? (
                <>
                  <Field label="Registration number">
                    <input className="tv-input h-10" value={regNumber} disabled={!canEdit || busy} onChange={(e) => setRegNumber(e.target.value)} />
                  </Field>
                  <Field label="Tax ID">
                    <input className="tv-input h-10" value={taxId} disabled={!canEdit || busy} onChange={(e) => setTaxId(e.target.value)} />
                  </Field>
                </>
              ) : null}
              <Field label="Business phone">
                <input className="tv-input h-10" value={phone} disabled={!canEdit || busy} onChange={(e) => setPhone(e.target.value)} />
              </Field>
              <Field label="Country">
                <input className="tv-input h-10" value={addrCountry} disabled={!canEdit || busy} onChange={(e) => setAddrCountry(e.target.value.toUpperCase())} maxLength={2} />
              </Field>
              <Field label="Street address">
                <input className="tv-input h-10" value={line1} disabled={!canEdit || busy} onChange={(e) => setLine1(e.target.value)} />
              </Field>
              <Field label="City">
                <input className="tv-input h-10" value={city} disabled={!canEdit || busy} onChange={(e) => setCity(e.target.value)} />
              </Field>
              <Field label="Postal code">
                <input className="tv-input h-10" value={postal} disabled={!canEdit || busy} onChange={(e) => setPostal(e.target.value)} />
              </Field>
            </div>
            <button type="button" className="tv-btn-primary h-10 px-4 text-[13px]" disabled={!canEdit || busy || legacyExpress} onClick={() => void submitBusiness()}>
              {busy ? 'Saving…' : 'Save and continue'}
            </button>
          </div>
        ) : null}

        {step === 'representative' ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#18181b]">Authorized representative</h2>
              <p className="mt-1 text-[13px] text-[#52525b]">
                The person authorized to act for this business. Sensitive identity checks follow separately when required.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name">
                <input className="tv-input h-10" value={firstName} disabled={!canEdit || busy} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field label="Last name">
                <input className="tv-input h-10" value={lastName} disabled={!canEdit || busy} onChange={(e) => setLastName(e.target.value)} />
              </Field>
              <Field label="Email">
                <input className="tv-input h-10" type="email" value={repEmail} disabled={!canEdit || busy} onChange={(e) => setRepEmail(e.target.value)} />
              </Field>
              <Field label="Phone">
                <input className="tv-input h-10" value={repPhone} disabled={!canEdit || busy} onChange={(e) => setRepPhone(e.target.value)} />
              </Field>
              <Field label="Date of birth">
                <input className="tv-input h-10" type="date" value={dob} disabled={!canEdit || busy} onChange={(e) => setDob(e.target.value)} />
              </Field>
              <Field label="Title">
                <input className="tv-input h-10" value={title} disabled={!canEdit || busy} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Owner">
                <select className="tv-input h-10" value={isOwner ? 'yes' : 'no'} disabled={!canEdit || busy} onChange={(e) => setIsOwner(e.target.value === 'yes')}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
              {isOwner ? (
                <Field label="Ownership %">
                  <input className="tv-input h-10" inputMode="decimal" value={percentOwnership} disabled={!canEdit || busy} onChange={(e) => setPercentOwnership(e.target.value)} />
                </Field>
              ) : null}
            </div>
            <button type="button" className="tv-btn-primary h-10 px-4 text-[13px]" disabled={!canEdit || busy || legacyExpress} onClick={() => void submitRepresentative()}>
              {busy ? 'Saving…' : 'Save and continue'}
            </button>
          </div>
        ) : null}

        {step === 'agreement' ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#18181b]">Connected Account Agreement</h2>
              <p className="mt-1 text-[13px] text-[#52525b]">
                Required disclosure before payouts can be enabled. Traverion records your acceptance with your IP and time.
              </p>
            </div>
            <label className="flex items-start gap-2 text-[13px] text-[#18181b]">
              <input
                type="checkbox"
                className="mt-1"
                checked={tosAccepted}
                disabled={!canEdit || busy}
                onChange={(e) => setTosAccepted(e.target.checked)}
              />
              <span>
                I confirm I am authorized to accept the{' '}
                <a
                  className="font-semibold text-[#073b83] underline-offset-2 hover:underline"
                  href="https://stripe.com/connect-account/legal"
                  target="_blank"
                  rel="noreferrer"
                >
                  Connected Account Agreement
                </a>{' '}
                on behalf of this business.
              </span>
            </label>
            <button type="button" className="tv-btn-primary h-10 px-4 text-[13px]" disabled={!canEdit || busy || legacyExpress} onClick={() => void submitTos()}>
              {busy ? 'Saving…' : 'Accept and continue'}
            </button>
          </div>
        ) : null}

        {step === 'identity' ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#18181b]">Identity verification</h2>
              <p className="mt-1 text-[13px] text-[#52525b]">
                {identityException
                  ? 'Additional identity documents are required. Use the secure collection step — Traverion does not store raw identity images.'
                  : 'No additional identity documents are due right now. Continue to bank setup. If review later requests documents, you will return here.'}
              </p>
            </div>
            {identityException ? (
              <button
                type="button"
                className="tv-btn-primary h-10 px-4 text-[13px]"
                disabled={!canEdit || busy}
                onClick={() => setShowLegacyEmbedded(true)}
              >
                Open secure identity collection
              </button>
            ) : (
              <button type="button" className="tv-btn-primary h-10 px-4 text-[13px]" disabled={busy} onClick={() => goNext('identity')}>
                Continue
              </button>
            )}
            {personId ? (
              <p className="text-[12px] text-[#71717a]">Representative on file for this verification.</p>
            ) : null}
          </div>
        ) : null}

        {step === 'bank' ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#18181b]">Bank account</h2>
              <p className="mt-1 text-[13px] text-[#52525b]">
                Details are tokenized in your browser and attached securely. Traverion never stores the full account number.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Account holder name">
                <input className="tv-input h-10" value={holderName} disabled={!canEdit || busy} onChange={(e) => setHolderName(e.target.value)} />
              </Field>
              <Field label="Currency">
                <input className="tv-input h-10" value={currency} disabled readOnly />
              </Field>
              <Field label="IBAN / account number" hint="Entered only for secure tokenization — not saved in Traverion.">
                <input
                  className="tv-input h-10 sm:col-span-2"
                  value={iban}
                  disabled={!canEdit || busy || legacyExpress}
                  onChange={(e) => setIban(e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
            <button type="button" className="tv-btn-primary h-10 px-4 text-[13px]" disabled={!canEdit || busy || legacyExpress} onClick={() => void submitBank()}>
              {busy ? 'Securing…' : 'Add bank account'}
            </button>
          </div>
        ) : null}

        {step === 'review' ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-[#18181b]">Review status</h2>
              <p className="mt-1 text-[13px] text-[#52525b]">
                Current status: <span className="font-semibold text-[#18181b]">{String(statusLabel).replace(/_/g, ' ')}</span>
              </p>
            </div>
            {due.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[12px] font-semibold text-amber-950">Still required</p>
                <ul className="mt-1 list-disc pl-4 text-[12px] text-amber-950">
                  {due.slice(0, 10).map((req) => (
                    <li key={req}>{String(req).replace(/\./g, ' · ')}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[13px] text-[#52525b]">
                No outstanding requirements listed. Capabilities may still be under review before payouts are enabled.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" className="tv-btn-secondary h-10 px-3 text-[13px]" disabled={busy} onClick={() => void refresh()}>
                Refresh status
              </button>
              <button type="button" className="tv-btn-primary h-10 px-4 text-[13px]" disabled={busy} onClick={() => void finish()}>
                Done
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <p className="flex items-start gap-2 px-1 text-[12px] leading-relaxed text-[#71717a]">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Identity documents and bank credentials are processed by our payment partner. Traverion never stores raw bank
          numbers or identity images in ordinary application tables. Required legal disclosures appear where mandated.
        </span>
      </p>
    </div>
  );
}
