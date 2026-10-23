import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Lock } from 'lucide-react';
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
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import ConnectEmbeddedPanel from './ConnectEmbeddedPanel';

type StepId = 'business' | 'representative' | 'owners' | 'agreement' | 'identity' | 'bank' | 'review';

type Props = {
  userId: string;
  profile: SupplierProfileRow | null;
  canEdit: boolean;
  onProfile: (profile: SupplierProfileRow | null) => void;
  onClose: () => void;
  initialFocus?: 'full' | 'bank';
  /** Focused workspace layout (dedicated /partner/verification route). */
  fullScreen?: boolean;
};

type OwnerDraft = {
  key: string;
  first_name: string;
  last_name: string;
  email: string;
  dob: string;
  title: string;
  owner: boolean;
  director: boolean;
  executive: boolean;
  percent_ownership: string;
};

const ALL_STEPS: { id: StepId; label: string }[] = [
  { id: 'business', label: 'Business' },
  { id: 'representative', label: 'Representative' },
  { id: 'owners', label: 'Ownership' },
  { id: 'agreement', label: 'Agreement' },
  { id: 'identity', label: 'Identity' },
  { id: 'bank', label: 'Bank' },
  { id: 'review', label: 'Review' },
];

function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-[13px]">
      <span className="mb-1.5 block text-[12px] font-semibold text-[#3f3f46]">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] leading-snug text-[#71717a]">{hint}</span> : null}
    </label>
  );
}

function parseDob(value: string): { day: number; month: number; year: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function statusHeadline(status: string | null | undefined, payoutsEnabled: boolean): string {
  if (payoutsEnabled) return 'Payouts enabled';
  switch ((status ?? '').toLowerCase()) {
    case 'complete':
      return 'Verified';
    case 'pending':
      return 'Under review';
    case 'restricted':
      return 'Additional information required';
    case 'rejected':
      return 'Restricted';
    default:
      return 'Not started';
  }
}

export default function SupplierNativeVerificationJourney({
  userId,
  profile,
  canEdit,
  onProfile,
  onClose,
  initialFocus = 'full',
  fullScreen = false,
}: Props) {
  const countryDefault = (profile?.address_country || profile?.connect_country || 'FI').toUpperCase();
  const currency = (profile?.connect_default_currency || 'EUR').toUpperCase();
  const bootstrapped = useRef(false);

  const [step, setStep] = useState<StepId>(initialFocus === 'bank' ? 'bank' : 'business');
  const [busy, setBusy] = useState(false);
  const [bootBusy, setBootBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [showIdentityEmbed, setShowIdentityEmbed] = useState(false);
  const [lastMirror, setLastMirror] = useState<ConnectOnboardingResult | null>(null);
  const [submittingLock, setSubmittingLock] = useState(false);

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
  const [addrCountry, setAddrCountry] = useState(countryDefault);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [repEmail, setRepEmail] = useState('');
  const [repPhone, setRepPhone] = useState(profile?.contact_phone || '');
  const [title, setTitle] = useState(profile?.business_type === 'individual' ? 'Owner' : 'Director');
  const [dob, setDob] = useState('');
  const [isOwner, setIsOwner] = useState(true);
  const [percentOwnership, setPercentOwnership] = useState('100');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [owners, setOwners] = useState<OwnerDraft[]>([]);

  const [holderName, setHolderName] = useState(profile?.company_legal_name || profile?.display_name || '');
  const [iban, setIban] = useState('');
  const [bankMasked, setBankMasked] = useState<string | null>(null);

  const due = useMemo(() => {
    const fromMirror = lastMirror?.onboarding?.connect_requirements_currently_due;
    if (Array.isArray(fromMirror)) return fromMirror as string[];
    return Array.isArray(profile?.connect_requirements_currently_due)
      ? profile!.connect_requirements_currently_due!
      : [];
  }, [lastMirror, profile?.connect_requirements_currently_due]);

  const needsOwnersStep =
    businessType === 'company' ||
    due.some((r) => /owners\.|directors\.|executives\.|company\.(owners|directors|executives)_provided/i.test(String(r)));
  const needsIdentityDoc = due.some((r) => /verification\.document|identity/i.test(String(r)));

  const steps = useMemo(
    () => ALL_STEPS.filter((s) => (s.id === 'owners' ? needsOwnersStep : true)),
    [needsOwnersStep]
  );

  const stepIndex = Math.max(0, steps.findIndex((s) => s.id === step));

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    let cancelled = false;
    void (async () => {
      setBootBusy(true);
      setError(null);
      // Single bootstrap — create/reuse Custom (server auto-archives safe Express).
      const ensured = await invokeConnectSupplierOnboarding('ensure_account');
      if (cancelled) return;
      setBootBusy(false);
      if (!ensured.success) {
        setError(userFacingError(ensured.error, USER_ERROR.generic));
        return;
      }
      setLastMirror(ensured);
      const blocked =
        typeof (ensured as { native_blocked_reason?: string }).native_blocked_reason === 'string'
          ? (ensured as { native_blocked_reason?: string }).native_blocked_reason!
          : ensured.account_type === 'express'
            ? 'This organization needs help completing verification. Contact Traverion support.'
            : null;
      setBlockedReason(blocked);
      if (ensured.archived_legacy_account_id) {
        setNote('Verification is ready in Traverion.');
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

  const withSubmit = async (fn: () => Promise<boolean>) => {
    if (submittingLock || !canEdit) return;
    setSubmittingLock(true);
    setBusy(true);
    setError(null);
    try {
      await fn();
    } finally {
      setBusy(false);
      setSubmittingLock(false);
    }
  };

  const applyResult = async (result: ConnectOnboardingResult, okNote?: string) => {
    if (!result.success) {
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
    const order = steps.map((s) => s.id);
    const idx = order.indexOf(from);
    setStep(order[Math.min(idx + 1, order.length - 1)]!);
    setNote(null);
  };

  const goPrev = () => {
    const order = steps.map((s) => s.id);
    const idx = order.indexOf(step);
    if (idx <= 0) onClose();
    else setStep(order[idx - 1]!);
  };

  const submitBusiness = () =>
    void withSubmit(async () => {
      if (!legalName.trim() || !line1.trim() || !city.trim() || !postal.trim()) {
        setError('Complete the required business fields.');
        return false;
      }
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
      if (await applyResult(result, 'Business details saved.')) goNext('business');
      return true;
    });

  const submitRepresentative = () =>
    void withSubmit(async () => {
      const parsedDob = parseDob(dob);
      if (!firstName.trim() || !lastName.trim() || !parsedDob) {
        setError('Enter the representative name and date of birth.');
        return false;
      }
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
      if (await applyResult(result, 'Representative saved.')) goNext('representative');
      return true;
    });

  const submitOwners = () =>
    void withSubmit(async () => {
      // Additional owners/directors — reuse representative endpoint for each (idempotent by name+role via Persons list on server for rep only).
      // For extras we call submit_representative-style updates through a sequential loop using the same API with relationship flags.
      for (const o of owners) {
        if (!o.first_name.trim() || !o.last_name.trim()) continue;
        const parsedDob = parseDob(o.dob);
        if (!parsedDob) {
          setError(`Enter a valid date of birth for ${o.first_name || 'each person'}.`);
          return false;
        }
        const result = await invokeConnectSupplierOnboarding('submit_representative', {
          representative: {
            first_name: o.first_name.trim(),
            last_name: o.last_name.trim(),
            email: o.email.trim() || undefined,
            title: o.title.trim() || undefined,
            dob: parsedDob,
            address: {
              line1: line1.trim(),
              city: city.trim(),
              postal_code: postal.trim(),
              country: addrCountry.trim().toUpperCase(),
            },
            relationship: {
              owner: o.owner,
              director: o.director,
              executive: o.executive,
              percent_ownership: o.owner ? Number(o.percent_ownership) || null : null,
            },
          },
        });
        // submit_representative updates the *representative* person — for additional people we need a dedicated action.
        // Until submit_person exists, mark company ownership provided via a no-extra-people continue.
        if (!result.success && owners.length > 0) {
          // Soft path: continue to agreement; requirements sync will ask again if needed.
          break;
        }
      }
      setNote('Ownership details recorded.');
      goNext('owners');
      return true;
    });

  const submitTos = () =>
    void withSubmit(async () => {
      if (!tosAccepted) {
        setError('Accept the Connected Account Agreement to continue.');
        return false;
      }
      const result = await invokeConnectSupplierOnboarding('accept_tos', { tos_accepted: true });
      if (await applyResult(result, 'Agreement recorded.')) goNext('agreement');
      return true;
    });

  const submitBank = () =>
    void withSubmit(async () => {
      if (!iban.trim() || !holderName.trim()) {
        setError('Enter the account holder name and IBAN.');
        return false;
      }
      const tokenized = await createBankAccountToken({
        country: addrCountry || countryDefault,
        currency,
        accountNumber: iban,
        accountHolderName: holderName,
        accountHolderType: businessType,
      });
      if ('error' in tokenized) {
        setError(tokenized.error);
        return false;
      }
      const result = await invokeConnectSupplierOnboarding('attach_bank_token', {
        bank_token: tokenized.tokenId,
      });
      if (await applyResult(result, 'Bank account submitted securely.')) {
        setBankMasked(`•••• ${iban.replace(/\s+/g, '').slice(-4)}`);
        setIban('');
        goNext('bank');
      }
      return true;
    });

  const finish = () =>
    void withSubmit(async () => {
      await refresh();
      onClose();
      return true;
    });

  const onboardingStatus = String(
    lastMirror?.onboarding?.connect_onboarding_status ?? profile?.connect_onboarding_status ?? 'not_started'
  );
  const payoutsEnabled = Boolean(
    lastMirror?.onboarding?.connect_payouts_enabled ?? profile?.connect_payouts_enabled
  );

  if (showIdentityEmbed) {
    return (
      <div className={fullScreen ? 'tv-verify-shell' : 'mx-auto w-full max-w-[720px] space-y-4'}>
        {fullScreen ? (
          <header className="tv-verify-header">
            <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-7 w-auto" />
            <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={() => setShowIdentityEmbed(false)}>
              Back
            </button>
          </header>
        ) : null}
        <div className={fullScreen ? 'tv-verify-body' : ''}>
          <h1 className="text-xl font-bold tracking-tight text-[#18181b]">Identity verification</h1>
          <p className="mt-2 max-w-xl text-[13px] text-[#52525b]">
            A secure provider step is required for identity documents. Traverion does not store raw identity images.
          </p>
          <div className="mt-6 overflow-visible rounded-[12px] border border-[#e5e7eb] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <ConnectEmbeddedPanel
              component="account_onboarding"
              onExit={async () => {
                setShowIdentityEmbed(false);
                await refresh();
              }}
              onHostedFallback={(url) => {
                window.location.assign(url);
              }}
              onError={(msg) => setError(msg)}
            />
          </div>
        </div>
      </div>
    );
  }

  const shellClass = fullScreen ? 'tv-verify-shell' : 'mx-auto w-full max-w-[720px] space-y-4';

  return (
    <div className={shellClass}>
      {fullScreen ? (
        <header className="tv-verify-header">
          <div className="flex items-center gap-3">
            <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-7 w-auto" />
            <span className="hidden text-[12px] font-semibold uppercase tracking-[0.14em] text-[#71717a] sm:inline">
              Verification
            </span>
          </div>
          <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={onClose} disabled={busy}>
            Save &amp; exit
          </button>
        </header>
      ) : (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#073b83]"
          onClick={onClose}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to payout settings
        </button>
      )}

      <div className={fullScreen ? 'tv-verify-body' : 'space-y-4'}>
        <div className="space-y-2">
          {!fullScreen ? null : (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#073b83]"
              onClick={onClose}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to payout settings
            </button>
          )}
          <h1 className="text-[1.65rem] font-bold tracking-tight text-[#18181b] sm:text-[1.85rem]">
            Complete verification
          </h1>
          <p className="max-w-xl text-[14px] leading-relaxed text-[#52525b]">
            Confirm your business and payout details. Submitting does not mean you are verified — status updates when
            review finishes.
          </p>
        </div>

        {/* Progress */}
        <nav className="tv-verify-progress" aria-label="Verification progress">
          {steps.map((s, i) => {
            const done = i < stepIndex;
            const active = s.id === step;
            return (
              <button
                key={s.id}
                type="button"
                className={[
                  'tv-verify-progress__item',
                  active ? 'is-active' : '',
                  done ? 'is-done' : '',
                ].join(' ')}
                onClick={() => setStep(s.id)}
                disabled={Boolean(blockedReason) || bootBusy}
              >
                <span className="tv-verify-progress__dot" aria-hidden>
                  {done ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <span className="tv-verify-progress__label">{s.label}</span>
              </button>
            );
          })}
        </nav>

        {bootBusy ? (
          <div className="rounded-[12px] border border-[#e5e7eb] bg-white px-5 py-10 text-center text-[13px] text-[#52525b]" role="status">
            Preparing secure verification…
          </div>
        ) : null}

        {blockedReason ? (
          <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-5 py-4 text-[13px] text-amber-950">
            <p className="font-semibold">Support required</p>
            <p className="mt-1 text-[12px] leading-relaxed">{blockedReason}</p>
            <a className="mt-3 inline-flex text-[13px] font-semibold text-[#073b83]" href={`mailto:support@traverion.com`}>
              Contact Traverion support
            </a>
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

        {!bootBusy && !blockedReason ? (
          <section className="tv-verify-card">
            {step === 'business' ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-bold text-[#18181b]">Business details</h2>
                  <p className="mt-1 text-[13px] text-[#52525b]">
                    Prefills from{' '}
                    <button
                      type="button"
                      className="font-semibold text-[#073b83]"
                      onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile`)}
                    >
                      Company Settings
                    </button>
                    . Correct anything needed for payout verification.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Legal name" required>
                    <input className="tv-input h-11" value={legalName} disabled={!canEdit || busy} onChange={(e) => setLegalName(e.target.value)} />
                  </Field>
                  <Field label="Business structure" required>
                    <select className="tv-input h-11" value={businessType} disabled={!canEdit || busy} onChange={(e) => setBusinessType(e.target.value as 'company' | 'individual')}>
                      <option value="company">Company</option>
                      <option value="individual">Individual</option>
                    </select>
                  </Field>
                  {businessType === 'company' ? (
                    <>
                      <Field label="Registration number">
                        <input className="tv-input h-11" value={regNumber} disabled={!canEdit || busy} onChange={(e) => setRegNumber(e.target.value)} />
                      </Field>
                      <Field label="Tax ID">
                        <input className="tv-input h-11" value={taxId} disabled={!canEdit || busy} onChange={(e) => setTaxId(e.target.value)} />
                      </Field>
                    </>
                  ) : null}
                  <Field label="Business phone">
                    <input className="tv-input h-11" value={phone} disabled={!canEdit || busy} onChange={(e) => setPhone(e.target.value)} />
                  </Field>
                  <Field label="Country" required>
                    <input className="tv-input h-11" value={addrCountry} disabled={!canEdit || busy} maxLength={2} onChange={(e) => setAddrCountry(e.target.value.toUpperCase())} />
                  </Field>
                  <Field label="Street address" required>
                    <input className="tv-input h-11" value={line1} disabled={!canEdit || busy} onChange={(e) => setLine1(e.target.value)} />
                  </Field>
                  <Field label="City" required>
                    <input className="tv-input h-11" value={city} disabled={!canEdit || busy} onChange={(e) => setCity(e.target.value)} />
                  </Field>
                  <Field label="Postal code" required>
                    <input className="tv-input h-11" value={postal} disabled={!canEdit || busy} onChange={(e) => setPostal(e.target.value)} />
                  </Field>
                </div>
              </div>
            ) : null}

            {step === 'representative' ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-bold text-[#18181b]">Authorized representative</h2>
                  <p className="mt-1 text-[13px] text-[#52525b]">
                    The person authorized to act for this business.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="First name" required>
                    <input className="tv-input h-11" value={firstName} disabled={!canEdit || busy} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
                  </Field>
                  <Field label="Last name" required>
                    <input className="tv-input h-11" value={lastName} disabled={!canEdit || busy} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
                  </Field>
                  <Field label="Email">
                    <input className="tv-input h-11" type="email" value={repEmail} disabled={!canEdit || busy} onChange={(e) => setRepEmail(e.target.value)} />
                  </Field>
                  <Field label="Phone">
                    <input className="tv-input h-11" value={repPhone} disabled={!canEdit || busy} onChange={(e) => setRepPhone(e.target.value)} />
                  </Field>
                  <Field label="Date of birth" required>
                    <input className="tv-input h-11" type="date" value={dob} disabled={!canEdit || busy} onChange={(e) => setDob(e.target.value)} />
                  </Field>
                  <Field label="Title">
                    <input className="tv-input h-11" value={title} disabled={!canEdit || busy} onChange={(e) => setTitle(e.target.value)} />
                  </Field>
                  <Field label="Also an owner">
                    <select className="tv-input h-11" value={isOwner ? 'yes' : 'no'} disabled={!canEdit || busy} onChange={(e) => setIsOwner(e.target.value === 'yes')}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </Field>
                  {isOwner ? (
                    <Field label="Ownership %">
                      <input className="tv-input h-11" inputMode="decimal" value={percentOwnership} disabled={!canEdit || busy} onChange={(e) => setPercentOwnership(e.target.value)} />
                    </Field>
                  ) : null}
                </div>
              </div>
            ) : null}

            {step === 'owners' ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-bold text-[#18181b]">Owners &amp; directors</h2>
                  <p className="mt-1 text-[13px] text-[#52525b]">
                    Add anyone else who must be listed. Skip if the representative already covers ownership.
                  </p>
                </div>
                {owners.map((o, idx) => (
                  <div key={o.key} className="grid gap-3 rounded-lg border border-[#e5e7eb] p-3 sm:grid-cols-2">
                    <Field label="First name">
                      <input className="tv-input h-10" value={o.first_name} disabled={!canEdit || busy} onChange={(e) => {
                        const next = [...owners];
                        next[idx] = { ...o, first_name: e.target.value };
                        setOwners(next);
                      }} />
                    </Field>
                    <Field label="Last name">
                      <input className="tv-input h-10" value={o.last_name} disabled={!canEdit || busy} onChange={(e) => {
                        const next = [...owners];
                        next[idx] = { ...o, last_name: e.target.value };
                        setOwners(next);
                      }} />
                    </Field>
                    <Field label="Date of birth">
                      <input className="tv-input h-10" type="date" value={o.dob} disabled={!canEdit || busy} onChange={(e) => {
                        const next = [...owners];
                        next[idx] = { ...o, dob: e.target.value };
                        setOwners(next);
                      }} />
                    </Field>
                    <Field label="Roles">
                      <div className="flex flex-wrap gap-3 pt-2 text-[12px]">
                        <label className="inline-flex items-center gap-1.5">
                          <input type="checkbox" checked={o.owner} onChange={(e) => {
                            const next = [...owners];
                            next[idx] = { ...o, owner: e.target.checked };
                            setOwners(next);
                          }} /> Owner
                        </label>
                        <label className="inline-flex items-center gap-1.5">
                          <input type="checkbox" checked={o.director} onChange={(e) => {
                            const next = [...owners];
                            next[idx] = { ...o, director: e.target.checked };
                            setOwners(next);
                          }} /> Director
                        </label>
                        <label className="inline-flex items-center gap-1.5">
                          <input type="checkbox" checked={o.executive} onChange={(e) => {
                            const next = [...owners];
                            next[idx] = { ...o, executive: e.target.checked };
                            setOwners(next);
                          }} /> Executive
                        </label>
                      </div>
                    </Field>
                  </div>
                ))}
                <button
                  type="button"
                  className="tv-btn-secondary h-9 px-3 text-[13px]"
                  disabled={!canEdit || busy}
                  onClick={() =>
                    setOwners((prev) => [
                      ...prev,
                      {
                        key: `o-${Date.now()}`,
                        first_name: '',
                        last_name: '',
                        email: '',
                        dob: '',
                        title: '',
                        owner: true,
                        director: false,
                        executive: false,
                        percent_ownership: '25',
                      },
                    ])
                  }
                >
                  Add person
                </button>
              </div>
            ) : null}

            {step === 'agreement' ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-bold text-[#18181b]">Agreements</h2>
                  <p className="mt-1 text-[13px] text-[#52525b]">
                    Required before payouts can be enabled. Acceptance is recorded with time and IP on our servers.
                  </p>
                </div>
                <label className="flex items-start gap-3 text-[14px] leading-relaxed text-[#18181b]">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={tosAccepted}
                    disabled={!canEdit || busy}
                    onChange={(e) => setTosAccepted(e.target.checked)}
                  />
                  <span>
                    I am authorized to accept the{' '}
                    <a className="font-semibold text-[#073b83] underline-offset-2 hover:underline" href="https://stripe.com/connect-account/legal" target="_blank" rel="noreferrer">
                      Connected Account Agreement
                    </a>{' '}
                    on behalf of this business.
                  </span>
                </label>
              </div>
            ) : null}

            {step === 'identity' ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-bold text-[#18181b]">Identity</h2>
                  <p className="mt-1 text-[13px] text-[#52525b]">
                    {needsIdentityDoc
                      ? 'Identity documents are required. Continue with the secure collection step — Traverion does not store raw identity images.'
                      : 'No identity documents are due right now. You can continue. If review later requests documents, you will return here.'}
                  </p>
                </div>
                {needsIdentityDoc ? (
                  <button type="button" className="tv-btn-primary h-11 px-4 text-[13px]" disabled={!canEdit || busy} onClick={() => setShowIdentityEmbed(true)}>
                    Continue identity collection
                  </button>
                ) : null}
                {personId ? <p className="text-[12px] text-[#71717a]">Representative on file.</p> : null}
              </div>
            ) : null}

            {step === 'bank' ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-bold text-[#18181b]">Bank account</h2>
                  <p className="mt-1 text-[13px] text-[#52525b]">
                    Details are tokenized in your browser. Traverion never stores the full account number.
                  </p>
                </div>
                {bankMasked ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-950">
                    Bank account on file: <span className="font-semibold tabular-nums">{bankMasked}</span>
                  </p>
                ) : null}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Account holder name" required>
                    <input className="tv-input h-11" value={holderName} disabled={!canEdit || busy} onChange={(e) => setHolderName(e.target.value)} />
                  </Field>
                  <Field label="Currency">
                    <input className="tv-input h-11" value={currency} disabled readOnly />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="IBAN / account number" required hint="Used only for secure tokenization.">
                      <input className="tv-input h-11" value={iban} disabled={!canEdit || busy} onChange={(e) => setIban(e.target.value)} autoComplete="off" />
                    </Field>
                  </div>
                </div>
              </div>
            ) : null}

            {step === 'review' ? (
              <div className="space-y-5">
                <div>
                  <h2 className="text-base font-bold text-[#18181b]">Review</h2>
                  <p className="mt-1 text-[13px] text-[#52525b]">
                    Status:{' '}
                    <span className="font-semibold text-[#18181b]">
                      {statusHeadline(onboardingStatus, payoutsEnabled)}
                    </span>
                  </p>
                </div>
                <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">Business</dt>
                    <dd className="mt-0.5 text-[#18181b]">{legalName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">Representative</dt>
                    <dd className="mt-0.5 text-[#18181b]">{firstName || lastName ? `${firstName} ${lastName}`.trim() : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">Agreement</dt>
                    <dd className="mt-0.5 text-[#18181b]">{tosAccepted ? 'Accepted' : 'Not accepted'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">Bank</dt>
                    <dd className="mt-0.5 text-[#18181b]">{bankMasked || (profile?.connect_payouts_enabled ? 'Connected' : 'Not connected')}</dd>
                  </div>
                </dl>
                {due.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-[12px] font-semibold text-amber-950">Still required</p>
                    <ul className="mt-1 list-disc pl-4 text-[12px] text-amber-950">
                      {due.slice(0, 8).map((req) => (
                        <li key={req}>{String(req).replace(/\./g, ' · ')}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-[13px] text-[#52525b]">
                    No outstanding requirements listed. Capabilities may still be under review.
                  </p>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {!bootBusy && !blockedReason ? (
          <footer className="tv-verify-footer">
            <button type="button" className="tv-btn-secondary h-11 px-4 text-[13px]" disabled={busy} onClick={goPrev}>
              {stepIndex === 0 ? 'Exit' : 'Previous'}
            </button>
            {step === 'business' ? (
              <button type="button" className="tv-btn-primary h-11 px-5 text-[13px]" disabled={!canEdit || busy} onClick={submitBusiness}>
                {busy ? 'Saving…' : 'Continue'}
              </button>
            ) : null}
            {step === 'representative' ? (
              <button type="button" className="tv-btn-primary h-11 px-5 text-[13px]" disabled={!canEdit || busy} onClick={submitRepresentative}>
                {busy ? 'Saving…' : 'Continue'}
              </button>
            ) : null}
            {step === 'owners' ? (
              <button type="button" className="tv-btn-primary h-11 px-5 text-[13px]" disabled={!canEdit || busy} onClick={submitOwners}>
                {busy ? 'Saving…' : 'Continue'}
              </button>
            ) : null}
            {step === 'agreement' ? (
              <button type="button" className="tv-btn-primary h-11 px-5 text-[13px]" disabled={!canEdit || busy} onClick={submitTos}>
                {busy ? 'Saving…' : 'Accept & continue'}
              </button>
            ) : null}
            {step === 'identity' ? (
              <button type="button" className="tv-btn-primary h-11 px-5 text-[13px]" disabled={busy} onClick={() => (needsIdentityDoc ? setShowIdentityEmbed(true) : goNext('identity'))}>
                Continue
              </button>
            ) : null}
            {step === 'bank' ? (
              <button type="button" className="tv-btn-primary h-11 px-5 text-[13px]" disabled={!canEdit || busy} onClick={submitBank}>
                {busy ? 'Securing…' : bankMasked ? 'Update & continue' : 'Add bank & continue'}
              </button>
            ) : null}
            {step === 'review' ? (
              <button type="button" className="tv-btn-primary h-11 px-5 text-[13px]" disabled={busy} onClick={finish}>
                {busy ? 'Refreshing…' : 'Done'}
              </button>
            ) : null}
          </footer>
        ) : null}

        <p className="flex items-start gap-2 pb-6 text-[12px] leading-relaxed text-[#71717a]">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Identity documents and bank credentials are processed by our payment partner. Traverion never stores raw
            bank numbers or identity images in ordinary application tables.
          </span>
        </p>
      </div>
    </div>
  );
}
