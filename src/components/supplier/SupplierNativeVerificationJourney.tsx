import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Lock } from 'lucide-react';
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
import {
  bankAlreadyManaged,
  editCategoryForRequirement,
  firstScreenForEditCategory,
  hasAuthoritativeSubmission,
  resolveVerificationWorkspacePhase,
  type VerificationWorkspacePhase,
} from '../../lib/verification-workspace-lifecycle';
import ConnectEmbeddedPanel from './ConnectEmbeddedPanel';
import SupplierVerificationStatusView from './SupplierVerificationStatusView';

type CategoryId =
  | 'business'
  | 'representative'
  | 'ownership'
  | 'agreement'
  | 'identity'
  | 'banking'
  | 'review';

type ScreenId =
  | 'biz_structure'
  | 'biz_legal'
  | 'biz_reg'
  | 'biz_address'
  | 'biz_contact'
  | 'rep_identity'
  | 'rep_contact'
  | 'rep_dob'
  | 'rep_role'
  | 'own_intro'
  | 'own_people'
  | 'agree_info'
  | 'agree_accept'
  | 'id_status'
  | 'bank_replace'
  | 'bank_details'
  | 'bank_confirm'
  | 'review_summary'
  | 'review_done';

type ScreenDef = {
  id: ScreenId;
  category: CategoryId;
  title: string;
  lede: string;
  /** Submit to provider on Continue; otherwise advance locally. */
  submit?: 'business' | 'representative' | 'owners' | 'tos' | 'bank' | 'finish' | 'identity';
};

type Props = {
  userId: string;
  profile: SupplierProfileRow | null;
  canEdit: boolean;
  onProfile: (profile: SupplierProfileRow | null) => void;
  onClose: () => void;
  initialFocus?: 'full' | 'bank';
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

type DraftPayload = {
  screen: ScreenId;
  legalName: string;
  businessType: 'company' | 'individual';
  regNumber: string;
  taxId: string;
  phone: string;
  line1: string;
  city: string;
  postal: string;
  addrCountry: string;
  firstName: string;
  lastName: string;
  repEmail: string;
  repPhone: string;
  title: string;
  dob: string;
  isOwner: boolean;
  percentOwnership: string;
  tosAccepted: boolean;
  holderName: string;
  bankMasked: string | null;
  owners: OwnerDraft[];
};

const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'business', label: 'Business' },
  { id: 'representative', label: 'Representative' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'agreement', label: 'Agreement' },
  { id: 'identity', label: 'Identity' },
  { id: 'banking', label: 'Banking' },
  { id: 'review', label: 'Review' },
];

function draftKey(userId: string) {
  return `tv-verify-draft:v2:${userId}`;
}

function submittedKey(userId: string) {
  return `tv-verify-submitted:v1:${userId}`;
}

function loadDraft(userId: string): DraftPayload | null {
  try {
    const raw = sessionStorage.getItem(draftKey(userId));
    if (!raw) return null;
    return JSON.parse(raw) as DraftPayload;
  } catch {
    return null;
  }
}

function saveDraft(userId: string, draft: DraftPayload) {
  try {
    sessionStorage.setItem(draftKey(userId), JSON.stringify(draft));
  } catch {
    /* ignore quota */
  }
}

function clearDraft(userId: string) {
  try {
    sessionStorage.removeItem(draftKey(userId));
  } catch {
    /* ignore */
  }
}

function markClientSubmitted(userId: string) {
  try {
    sessionStorage.setItem(submittedKey(userId), new Date().toISOString());
  } catch {
    /* ignore */
  }
}

function readClientSubmitted(userId: string): boolean {
  try {
    return Boolean(sessionStorage.getItem(submittedKey(userId)));
  } catch {
    return false;
  }
}

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
    <label className="tv-verify-field">
      <span>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      {children}
      {hint ? <em>{hint}</em> : null}
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

function buildScreens(opts: {
  businessType: 'company' | 'individual';
  needsOwners: boolean;
  /** Bank replacement / bank-only correction — no full journey, no country step. */
  startBank: boolean;
}): ScreenDef[] {
  const biz: ScreenDef[] = [
    {
      id: 'biz_structure',
      category: 'business',
      title: 'Business structure',
      lede: 'Choose how this organization is registered.',
    },
    {
      id: 'biz_legal',
      category: 'business',
      title: 'Legal name',
      lede: 'Use the official name from Company Settings.',
    },
    ...(opts.businessType === 'company'
      ? ([
          {
            id: 'biz_reg',
            category: 'business',
            title: 'Registration & tax',
            lede: 'Add registration and tax identifiers when available.',
          },
        ] as ScreenDef[])
      : []),
    {
      id: 'biz_address',
      category: 'business',
      title: 'Business address',
      lede: 'Primary registered address for verification.',
    },
    {
      id: 'biz_contact',
      category: 'business',
      title: 'Business contact',
      lede: 'Phone used for verification notices.',
      submit: 'business',
    },
  ];

  const rep: ScreenDef[] = [
    {
      id: 'rep_identity',
      category: 'representative',
      title: 'Representative identity',
      lede: 'The person authorized to act for this business.',
    },
    {
      id: 'rep_contact',
      category: 'representative',
      title: 'Contact details',
      lede: 'Email and phone for the authorized representative.',
    },
    {
      id: 'rep_dob',
      category: 'representative',
      title: 'Date of birth',
      lede: 'Required for identity verification.',
    },
    {
      id: 'rep_role',
      category: 'representative',
      title: 'Business role',
      lede: 'Title and ownership relationship.',
      submit: 'representative',
    },
  ];

  const ownership: ScreenDef[] = opts.needsOwners
    ? [
        {
          id: 'own_intro',
          category: 'ownership',
          title: 'Ownership structure',
          lede: 'List anyone else who must appear as an owner or director.',
        },
        {
          id: 'own_people',
          category: 'ownership',
          title: 'Additional people',
          lede: 'Skip if the representative already covers ownership.',
          submit: 'owners',
        },
      ]
    : [];

  const agreement: ScreenDef[] = [
    {
      id: 'agree_info',
      category: 'agreement',
      title: 'Agreement information',
      lede: 'Payouts require accepting the Connected Account Agreement.',
    },
    {
      id: 'agree_accept',
      category: 'agreement',
      title: 'Accept agreement',
      lede: 'Acceptance is recorded with time and IP on our servers.',
      submit: 'tos',
    },
  ];

  const identity: ScreenDef[] = [
    {
      id: 'id_status',
      category: 'identity',
      title: 'Identity verification',
      lede: 'Documents are collected securely when required — Traverion never stores raw identity images.',
      submit: 'identity',
    },
  ];

  // Country/currency are account facts — shown read-only on bank details, not as onboarding steps.
  const bankingFull: ScreenDef[] = [
    {
      id: 'bank_details',
      category: 'banking',
      title: 'Bank account details',
      lede: 'Tokenized in your browser. Traverion never stores the full account number.',
    },
    {
      id: 'bank_confirm',
      category: 'banking',
      title: 'Confirm bank account',
      lede: 'Submit securely to attach the account for payouts.',
      submit: 'bank',
    },
  ];

  const bankingReplace: ScreenDef[] = [
    {
      id: 'bank_replace',
      category: 'banking',
      title: 'Bank destination',
      lede: 'Replace your payout destination only when you need a different account.',
    },
    ...bankingFull,
  ];

  const review: ScreenDef[] = [
    {
      id: 'review_summary',
      category: 'review',
      title: 'Review your details',
      lede: 'Confirm everything looks correct before finishing.',
    },
    {
      id: 'review_done',
      category: 'review',
      title: 'Verification submitted',
      lede: 'Status updates when review finishes — submitting is not the same as verified.',
      submit: 'finish',
    },
  ];

  if (opts.startBank) {
    return bankingReplace;
  }

  return [...biz, ...rep, ...ownership, ...agreement, ...identity, ...bankingFull, ...review];
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
  const draft = useMemo(() => loadDraft(userId), [userId]);
  const [forceWizard, setForceWizard] = useState(false);
  /** When true, wizard is a bank-only correction — not the full first-time journey. */
  const [bankOnlyEdit, setBankOnlyEdit] = useState(false);
  const [clientSubmitted, setClientSubmitted] = useState(() => readClientSubmitted(userId));

  const initialPhase = resolveVerificationWorkspacePhase({
    profile,
    hasDraft: Boolean(draft),
    forceWizard: false,
    clientSubmitted: readClientSubmitted(userId),
  });

  const [phase, setPhase] = useState<VerificationWorkspacePhase>(() => initialPhase);

  const [screen, setScreen] = useState<ScreenId>(() => {
    if (draft?.screen && draft.screen !== 'bank_country') return draft.screen;
    return 'biz_structure';
  });
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');
  const [busy, setBusy] = useState(false);
  const [bootBusy, setBootBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [showIdentityEmbed, setShowIdentityEmbed] = useState(false);
  const [lastMirror, setLastMirror] = useState<ConnectOnboardingResult | null>(null);
  const [submittingLock, setSubmittingLock] = useState(false);

  const [legalName, setLegalName] = useState(
    () => draft?.legalName ?? profile?.company_legal_name ?? profile?.display_name ?? ''
  );
  const [businessType, setBusinessType] = useState<'company' | 'individual'>(
    () => draft?.businessType ?? (profile?.business_type === 'individual' ? 'individual' : 'company')
  );
  const [regNumber, setRegNumber] = useState(() => draft?.regNumber ?? profile?.company_registration_number ?? '');
  const [taxId, setTaxId] = useState(() => draft?.taxId ?? profile?.tax_id ?? '');
  const [phone, setPhone] = useState(() => draft?.phone ?? profile?.contact_phone ?? '');
  const [line1, setLine1] = useState(() => draft?.line1 ?? profile?.address_street ?? '');
  const [city, setCity] = useState(() => draft?.city ?? profile?.address_city ?? '');
  const [postal, setPostal] = useState(() => draft?.postal ?? profile?.address_postal_code ?? '');
  const [addrCountry, setAddrCountry] = useState(() => draft?.addrCountry ?? countryDefault);

  const [firstName, setFirstName] = useState(() => draft?.firstName ?? '');
  const [lastName, setLastName] = useState(() => draft?.lastName ?? '');
  const [repEmail, setRepEmail] = useState(() => draft?.repEmail ?? '');
  const [repPhone, setRepPhone] = useState(() => draft?.repPhone ?? profile?.contact_phone ?? '');
  const [title, setTitle] = useState(
    () => draft?.title ?? (profile?.business_type === 'individual' ? 'Owner' : 'Director')
  );
  const [dob, setDob] = useState(() => draft?.dob ?? '');
  const [isOwner, setIsOwner] = useState(() => draft?.isOwner ?? true);
  const [percentOwnership, setPercentOwnership] = useState(() => draft?.percentOwnership ?? '100');
  const [tosAccepted, setTosAccepted] = useState(() => draft?.tosAccepted ?? false);
  const [owners, setOwners] = useState<OwnerDraft[]>(() => draft?.owners ?? []);

  const [holderName, setHolderName] = useState(
    () => draft?.holderName ?? profile?.company_legal_name ?? profile?.display_name ?? ''
  );
  const [iban, setIban] = useState('');
  const [bankMasked, setBankMasked] = useState<string | null>(draft?.bankMasked ?? null);

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

  const screens = useMemo(
    () =>
      buildScreens({
        businessType,
        needsOwners: needsOwnersStep,
        startBank: bankOnlyEdit,
      }),
    [businessType, needsOwnersStep, bankOnlyEdit]
  );

  const screenIndex = Math.max(0, screens.findIndex((s) => s.id === screen));
  const current = screens[screenIndex] ?? screens[0]!;
  const categoryScreens = screens.filter((s) => s.category === current.category);
  const substepIndex = Math.max(0, categoryScreens.findIndex((s) => s.id === current.id));
  const activeCategoryIndex = Math.max(
    0,
    CATEGORIES.filter((c) => screens.some((s) => s.category === c.id)).findIndex((c) => c.id === current.category)
  );
  const visibleCategories = CATEGORIES.filter((c) => screens.some((s) => s.category === c.id));

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    let cancelled = false;
    void (async () => {
      setBootBusy(true);
      setError(null);
      // Reuse existing connected account — never create a duplicate on Manage.
      const ensured = await invokeConnectSupplierOnboarding('ensure_account');
      if (cancelled) return;
      if (!ensured.success) {
        setBootBusy(false);
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
      const nextProfile = await fetchSupplierProfile(userId);
      if (cancelled) return;
      onProfile(nextProfile);
      const submitted =
        hasAuthoritativeSubmission(nextProfile) || readClientSubmitted(userId);
      if (submitted) {
        clearDraft(userId);
        setClientSubmitted(true);
      }
      const nextPhase = resolveVerificationWorkspacePhase({
        profile: nextProfile,
        hasDraft: Boolean(loadDraft(userId)),
        forceWizard: false,
        clientSubmitted: submitted,
      });
      // Manage bank on a submitted account → status overview (same account). Never re-collect.
      // Explicit replace is opt-in via ?focus=bank&replace=1 or status "Replace bank account".
      const wantReplace =
        typeof window !== 'undefined' &&
        new URLSearchParams(window.location.search).get('replace') === '1';
      if (initialFocus === 'bank' && submitted && wantReplace) {
        setForceWizard(true);
        setBankOnlyEdit(true);
        setScreen('bank_replace');
        setPhase('wizard');
      } else if (initialFocus === 'bank' && submitted) {
        setForceWizard(false);
        setBankOnlyEdit(false);
        setPhase('status');
        const masked = loadDraft(userId)?.bankMasked ?? null;
        if (bankAlreadyManaged(nextProfile, masked)) {
          setNote('Bank destination is managed here. Use Replace bank account only when you need a new account.');
        }
      } else if (initialFocus === 'bank' && nextPhase === 'wizard') {
        setBankOnlyEdit(false);
        const d = loadDraft(userId);
        setScreen(d?.screen && d.screen !== 'bank_country' ? d.screen : 'bank_details');
        setPhase('wizard');
      } else {
        setPhase(nextPhase);
      }
      setBootBusy(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once per mount
  }, [userId, onProfile]);

  // Persist non-sensitive draft only while collecting (never overwrite after submission).
  useEffect(() => {
    if (phase !== 'wizard') return;
    if (hasAuthoritativeSubmission(profile) && !forceWizard) return;
    saveDraft(userId, {
      screen,
      legalName,
      businessType,
      regNumber,
      taxId,
      phone,
      line1,
      city,
      postal,
      addrCountry,
      firstName,
      lastName,
      repEmail,
      repPhone,
      title,
      dob,
      isOwner,
      percentOwnership,
      tosAccepted,
      holderName,
      bankMasked,
      owners,
    });
  }, [
    phase,
    forceWizard,
    profile,
    userId,
    screen,
    legalName,
    businessType,
    regNumber,
    taxId,
    phone,
    line1,
    city,
    postal,
    addrCountry,
    firstName,
    lastName,
    repEmail,
    repPhone,
    title,
    dob,
    isOwner,
    percentOwnership,
    tosAccepted,
    holderName,
    bankMasked,
    owners,
  ]);

  // Keep screen valid when ownership screens appear/disappear.
  useEffect(() => {
    if (!screens.some((s) => s.id === screen)) {
      setScreen(screens[0]?.id ?? 'biz_structure');
    }
  }, [screens, screen]);

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

  const goToIndex = (idx: number, dir: 'forward' | 'back') => {
    const next = screens[Math.max(0, Math.min(idx, screens.length - 1))];
    if (!next) return;
    setDirection(dir);
    setScreen(next.id);
    setNote(null);
    setError(null);
  };

  const goNextLocal = () => goToIndex(screenIndex + 1, 'forward');

  const goPrev = () => {
    if (screenIndex <= 0) {
      if (forceWizard && (hasAuthoritativeSubmission(profile) || clientSubmitted)) {
        setForceWizard(false);
        setBankOnlyEdit(false);
        setPhase('status');
        return;
      }
      // Draft already persisted — exit to settings without restarting later.
      onClose();
      return;
    }
    goToIndex(screenIndex - 1, 'back');
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
      if (await applyResult(result, 'Business details saved.')) afterSuccessfulStep();
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
      if (await applyResult(result, 'Representative saved.')) afterSuccessfulStep();
      return true;
    });

  const submitOwners = () =>
    void withSubmit(async () => {
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
        if (!result.success && owners.length > 0) break;
      }
      setNote('Ownership details recorded.');
      afterSuccessfulStep();
      return true;
    });

  const submitTos = () =>
    void withSubmit(async () => {
      if (!tosAccepted) {
        setError('Accept the Connected Account Agreement to continue.');
        return false;
      }
      const result = await invokeConnectSupplierOnboarding('accept_tos', { tos_accepted: true });
      if (await applyResult(result, 'Agreement recorded.')) afterSuccessfulStep();
      return true;
    });

  const enterWizardAt = (start: ScreenId, opts?: { bankOnly?: boolean }) => {
    setForceWizard(true);
    setBankOnlyEdit(Boolean(opts?.bankOnly));
    setDirection('forward');
    setScreen(start);
    setPhase('wizard');
    setError(null);
    setNote(null);
  };

  const afterSuccessfulStep = () => {
    if (forceWizard && (hasAuthoritativeSubmission(profile) || clientSubmitted)) {
      void (async () => {
        setForceWizard(false);
        setBankOnlyEdit(false);
        clearDraft(userId);
        markClientSubmitted(userId);
        setClientSubmitted(true);
        await refresh();
        setPhase('status');
        setNote('Update submitted. Status refreshes from the payment provider.');
      })();
      return;
    }
    goNextLocal();
  };

  const submitBank = () =>
    void withSubmit(async () => {
      if (bankMasked && !iban.trim()) {
        afterSuccessfulStep();
        return true;
      }
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
        afterSuccessfulStep();
      }
      return true;
    });

  const finish = () =>
    void withSubmit(async () => {
      markClientSubmitted(userId);
      setClientSubmitted(true);
      clearDraft(userId);
      setForceWizard(false);
      setBankOnlyEdit(false);
      await refresh();
      const nextProfile = await fetchSupplierProfile(userId);
      onProfile(nextProfile);
      setPhase('status');
      setNote('Information submitted. Status updates when review finishes.');
      return true;
    });

  const startFromIntro = () => {
    setForceWizard(false);
    setBankOnlyEdit(false);
    setScreen('biz_structure');
    setPhase('wizard');
  };

  const startFixRequirements = () => {
    const firstDue = due[0] ? String(due[0]) : '';
    const category = firstDue ? editCategoryForRequirement(firstDue) : 'business';
    enterWizardAt(firstScreenForEditCategory(category) as ScreenId, {
      bankOnly: category === 'banking',
    });
  };

  const onContinue = () => {
    const action = current.submit;
    if (!action) {
      goNextLocal();
      return;
    }
    switch (action) {
      case 'business':
        submitBusiness();
        break;
      case 'representative':
        submitRepresentative();
        break;
      case 'owners':
        submitOwners();
        break;
      case 'tos':
        submitTos();
        break;
      case 'bank':
        submitBank();
        break;
      case 'identity':
        if (needsIdentityDoc) setShowIdentityEmbed(true);
        else goNextLocal();
        break;
      case 'finish':
        finish();
        break;
      default:
        goNextLocal();
    }
  };

  const onboardingStatus = String(
    lastMirror?.onboarding?.connect_onboarding_status ?? profile?.connect_onboarding_status ?? 'not_started'
  );
  const payoutsEnabled = Boolean(
    lastMirror?.onboarding?.connect_payouts_enabled ?? profile?.connect_payouts_enabled
  );

  const progressPct = Math.round(((screenIndex + 1) / Math.max(screens.length, 1)) * 100);
  const continueLabel =
    current.id === 'bank_replace'
      ? 'Continue'
      : current.submit === 'tos'
        ? 'Accept & continue'
        : current.submit === 'bank'
          ? busy
            ? 'Securing…'
            : bankOnlyEdit
              ? 'Submit new bank'
              : 'Add bank & continue'
          : current.submit === 'finish'
            ? busy
              ? 'Refreshing…'
              : 'Done'
            : busy
              ? 'Saving…'
              : 'Continue';

  if (bootBusy) {
    return (
      <div className={fullScreen ? 'tv-verify-workspace' : 'mx-auto w-full max-w-[720px] px-4 py-16'}>
        {fullScreen ? (
          <header className="tv-verify-workspace__header">
            <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-7 w-auto" />
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#71717a]">Verification</span>
          </header>
        ) : null}
        <div className={fullScreen ? 'tv-verify-workspace__main' : ''}>
          <p className="text-center text-[13px] text-[#52525b]" role="status">
            Preparing secure verification…
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'status' && !forceWizard) {
    return (
      <SupplierVerificationStatusView
        profile={profile}
        bankMasked={bankMasked}
        canEdit={canEdit}
        busy={busy}
        error={error}
        note={note}
        onClose={onClose}
        onRefresh={() =>
          void withSubmit(async () => {
            await refresh();
            setNote('Verification status refreshed.');
            return true;
          })
        }
        onUpdateBusiness={() => enterWizardAt('biz_structure')}
        onUpdateBank={() => enterWizardAt('bank_replace', { bankOnly: true })}
        onFixRequirements={startFixRequirements}
        onContinueIdentity={() => {
          setShowIdentityEmbed(true);
        }}
        fullScreen={fullScreen}
        highlightBank={initialFocus === 'bank'}
      />
    );
  }

  if (phase === 'intro' && !forceWizard) {
    const introBody = (
      <div className="mx-auto w-full max-w-[36rem] space-y-5 text-center sm:text-left">
        <p className="tv-verify-kicker">Payout verification</p>
        <h1 className="tv-verify-title">Verify your business for payouts</h1>
        <p className="tv-verify-lede mx-auto sm:mx-0">
          Confirm your business, representative, and bank details in Traverion. Submitting does not mean you are
          verified — status comes from the payment provider when review finishes.
        </p>
        {error ? (
          <p className="rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-left text-[13px] text-red-900" role="alert">
            {error}
          </p>
        ) : null}
        {blockedReason ? (
          <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-left text-[13px] text-amber-950">
            <p className="font-semibold">Support required</p>
            <p className="mt-1 text-[12px] leading-relaxed">{blockedReason}</p>
          </div>
        ) : (
          <button
            type="button"
            className="tv-btn-primary h-11 px-5 text-[13px]"
            disabled={!canEdit || busy}
            onClick={startFromIntro}
          >
            Start verification
          </button>
        )}
      </div>
    );
    if (!fullScreen) {
      return (
        <div className="space-y-4">
          <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={onClose}>
            Back to payout settings
          </button>
          {introBody}
        </div>
      );
    }
    return (
      <div className="tv-verify-workspace">
        <header className="tv-verify-workspace__header">
          <div className="flex min-w-0 items-center gap-3">
            <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-7 w-auto shrink-0" />
            <span className="hidden text-[12px] font-semibold uppercase tracking-[0.14em] text-[#71717a] sm:inline">
              Verification
            </span>
          </div>
          <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={onClose}>
            Save &amp; exit
          </button>
        </header>
        <div className="tv-verify-workspace__main">{introBody}</div>
        <footer className="tv-verify-workspace__footer">
          <button type="button" className="tv-btn-secondary h-11 px-4 text-[13px]" onClick={onClose}>
            Exit
          </button>
          <button
            type="button"
            className="tv-btn-primary h-11 px-5 text-[13px]"
            disabled={!canEdit || Boolean(blockedReason)}
            onClick={startFromIntro}
          >
            Start verification
          </button>
        </footer>
      </div>
    );
  }

  if (showIdentityEmbed) {
    return (
      <div className={fullScreen ? 'tv-verify-workspace' : 'mx-auto w-full max-w-[720px] space-y-4'}>
        {fullScreen ? (
          <header className="tv-verify-workspace__header">
            <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-7 w-auto" />
            <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-[#71717a]">Identity</span>
            <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={() => setShowIdentityEmbed(false)}>
              Back
            </button>
          </header>
        ) : null}
        <div className={fullScreen ? 'tv-verify-workspace__stage tv-verify-workspace__stage--scroll' : ''}>
          <h1 className="stay-title text-xl font-bold tracking-tight text-[#18181b]">Identity verification</h1>
          <p className="mt-2 max-w-xl text-[13px] text-[#52525b]">
            A secure provider step is required for identity documents. Traverion does not store raw identity images.
          </p>
          <div className="mt-4 overflow-visible rounded-[12px] border border-[#e5e7eb] bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <ConnectEmbeddedPanel
              component="account_onboarding"
              onExit={async () => {
                setShowIdentityEmbed(false);
                await refresh();
                if (hasAuthoritativeSubmission(profile) || clientSubmitted) {
                  setForceWizard(false);
                  setPhase('status');
                } else {
                  goNextLocal();
                }
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

  const stageClass = [
    'tv-verify-workspace__stage',
    direction === 'back' ? 'stay-stage-back' : 'stay-stage-forward',
  ].join(' ');

  const content = (
    <>
      {bootBusy ? (
        <p className="text-center text-[13px] text-[#52525b]" role="status">
          Preparing secure verification…
        </p>
      ) : null}

      {blockedReason ? (
        <div className="rounded-[12px] border border-amber-200 bg-amber-50 px-5 py-4 text-[13px] text-amber-950">
          <p className="font-semibold">Support required</p>
          <p className="mt-1 text-[12px] leading-relaxed">{blockedReason}</p>
          <a className="mt-3 inline-flex text-[13px] font-semibold text-[#073b83]" href="mailto:support@traverion.com">
            Contact Traverion support
          </a>
        </div>
      ) : null}

      {error ? (
        <p className="mb-3 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900" role="alert">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="mb-2 text-[12px] text-[#18181b]" role="status">
          {note}
        </p>
      ) : null}

      {!bootBusy && !blockedReason ? (
        <div key={current.id} className={stageClass}>
          <p className="tv-verify-kicker">{visibleCategories[activeCategoryIndex]?.label}</p>
          <h1 className="tv-verify-title">{current.title}</h1>
          <p className="tv-verify-lede">
            {current.lede}
            {current.id === 'biz_legal' ? (
              <>
                {' '}
                Prefills from{' '}
                <button
                  type="button"
                  className="font-semibold text-[#073b83]"
                  onClick={() => navigateSupplierUrl(`${PARTNER_APP_BASE}/business-profile`)}
                >
                  Company Settings
                </button>
                .
              </>
            ) : null}
          </p>

          <div className="tv-verify-form">
            {current.id === 'biz_structure' ? (
              <Field label="Business structure" required>
                <select
                  className="tv-input h-11"
                  value={businessType}
                  disabled={!canEdit || busy}
                  onChange={(e) => setBusinessType(e.target.value as 'company' | 'individual')}
                >
                  <option value="company">Company</option>
                  <option value="individual">Individual</option>
                </select>
              </Field>
            ) : null}

            {current.id === 'biz_legal' ? (
              <Field label="Legal name" required>
                <input
                  className="tv-input h-11"
                  value={legalName}
                  disabled={!canEdit || busy}
                  onChange={(e) => setLegalName(e.target.value)}
                />
              </Field>
            ) : null}

            {current.id === 'biz_reg' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Registration number">
                  <input className="tv-input h-11" value={regNumber} disabled={!canEdit || busy} onChange={(e) => setRegNumber(e.target.value)} />
                </Field>
                <Field label="Tax ID">
                  <input className="tv-input h-11" value={taxId} disabled={!canEdit || busy} onChange={(e) => setTaxId(e.target.value)} />
                </Field>
              </div>
            ) : null}

            {current.id === 'biz_address' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Street address" required>
                    <input className="tv-input h-11" value={line1} disabled={!canEdit || busy} onChange={(e) => setLine1(e.target.value)} />
                  </Field>
                </div>
                <Field label="City" required>
                  <input className="tv-input h-11" value={city} disabled={!canEdit || busy} onChange={(e) => setCity(e.target.value)} />
                </Field>
                <Field label="Postal code" required>
                  <input className="tv-input h-11" value={postal} disabled={!canEdit || busy} onChange={(e) => setPostal(e.target.value)} />
                </Field>
                <Field label="Country" required>
                  <input
                    className="tv-input h-11"
                    value={addrCountry}
                    disabled={!canEdit || busy}
                    maxLength={2}
                    onChange={(e) => setAddrCountry(e.target.value.toUpperCase())}
                  />
                </Field>
              </div>
            ) : null}

            {current.id === 'biz_contact' ? (
              <Field label="Business phone">
                <input className="tv-input h-11" value={phone} disabled={!canEdit || busy} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            ) : null}

            {current.id === 'rep_identity' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="First name" required>
                  <input className="tv-input h-11" value={firstName} disabled={!canEdit || busy} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
                </Field>
                <Field label="Last name" required>
                  <input className="tv-input h-11" value={lastName} disabled={!canEdit || busy} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
                </Field>
              </div>
            ) : null}

            {current.id === 'rep_contact' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email">
                  <input className="tv-input h-11" type="email" value={repEmail} disabled={!canEdit || busy} onChange={(e) => setRepEmail(e.target.value)} />
                </Field>
                <Field label="Phone">
                  <input className="tv-input h-11" value={repPhone} disabled={!canEdit || busy} onChange={(e) => setRepPhone(e.target.value)} />
                </Field>
              </div>
            ) : null}

            {current.id === 'rep_dob' ? (
              <Field label="Date of birth" required>
                <input className="tv-input h-11" type="date" value={dob} disabled={!canEdit || busy} onChange={(e) => setDob(e.target.value)} />
              </Field>
            ) : null}

            {current.id === 'rep_role' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Title">
                  <input className="tv-input h-11" value={title} disabled={!canEdit || busy} onChange={(e) => setTitle(e.target.value)} />
                </Field>
                <Field label="Also an owner">
                  <select
                    className="tv-input h-11"
                    value={isOwner ? 'yes' : 'no'}
                    disabled={!canEdit || busy}
                    onChange={(e) => setIsOwner(e.target.value === 'yes')}
                  >
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
            ) : null}

            {current.id === 'own_intro' ? (
              <p className="text-[14px] leading-relaxed text-[#3f3f46]">
                Companies may need beneficial owners and directors listed separately from the representative. You can
                add them on the next screen, or continue if the representative already covers ownership.
              </p>
            ) : null}

            {current.id === 'own_people' ? (
              <div className="space-y-3">
                {owners.map((o, idx) => (
                  <div key={o.key} className="grid gap-3 rounded-lg border border-[#e5e7eb] p-3 sm:grid-cols-2">
                    <Field label="First name">
                      <input
                        className="tv-input h-10"
                        value={o.first_name}
                        disabled={!canEdit || busy}
                        onChange={(e) => {
                          const next = [...owners];
                          next[idx] = { ...o, first_name: e.target.value };
                          setOwners(next);
                        }}
                      />
                    </Field>
                    <Field label="Last name">
                      <input
                        className="tv-input h-10"
                        value={o.last_name}
                        disabled={!canEdit || busy}
                        onChange={(e) => {
                          const next = [...owners];
                          next[idx] = { ...o, last_name: e.target.value };
                          setOwners(next);
                        }}
                      />
                    </Field>
                    <Field label="Date of birth">
                      <input
                        className="tv-input h-10"
                        type="date"
                        value={o.dob}
                        disabled={!canEdit || busy}
                        onChange={(e) => {
                          const next = [...owners];
                          next[idx] = { ...o, dob: e.target.value };
                          setOwners(next);
                        }}
                      />
                    </Field>
                    <Field label="Roles">
                      <div className="flex flex-wrap gap-3 pt-2 text-[12px]">
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={o.owner}
                            onChange={(e) => {
                              const next = [...owners];
                              next[idx] = { ...o, owner: e.target.checked };
                              setOwners(next);
                            }}
                          />{' '}
                          Owner
                        </label>
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={o.director}
                            onChange={(e) => {
                              const next = [...owners];
                              next[idx] = { ...o, director: e.target.checked };
                              setOwners(next);
                            }}
                          />{' '}
                          Director
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

            {current.id === 'agree_info' ? (
              <p className="text-[14px] leading-relaxed text-[#3f3f46]">
                Before payouts can be enabled, an authorized person must accept the Connected Account Agreement. The
                next screen records your acceptance with time and IP.
              </p>
            ) : null}

            {current.id === 'agree_accept' ? (
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
            ) : null}

            {current.id === 'id_status' ? (
              <div className="space-y-3">
                <p className="text-[14px] leading-relaxed text-[#3f3f46]">
                  {needsIdentityDoc
                    ? 'Identity documents are required. Continue with the secure collection step.'
                    : 'No identity documents are due right now. You can continue. If review later requests documents, you will return here.'}
                </p>
                {personId ? <p className="text-[12px] text-[#71717a]">Representative on file.</p> : null}
              </div>
            ) : null}

            {current.id === 'bank_replace' ? (
              <div className="space-y-4">
                <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">
                    Current destination
                  </p>
                  <p className="mt-1 text-[15px] font-semibold tabular-nums text-[#18181b]">
                    {bankMasked ||
                      (profile?.connect_payouts_enabled
                        ? 'Connected (masked by provider)'
                        : 'No masked destination on file yet')}
                  </p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                    <div>
                      <dt className="text-[#71717a]">Country</dt>
                      <dd className="font-medium text-[#18181b]">{addrCountry}</dd>
                    </div>
                    <div>
                      <dt className="text-[#71717a]">Currency</dt>
                      <dd className="font-medium text-[#18181b]">{currency}</dd>
                    </div>
                  </dl>
                </div>
                <p className="text-[13px] leading-relaxed text-[#52525b]">
                  Continue only if you need to replace this destination. Country and currency stay with your payout
                  account.
                </p>
              </div>
            ) : null}

            {current.id === 'bank_details' ? (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-2 rounded-lg border border-[#e5e7eb] bg-[#fafafa] px-3 py-2.5 text-[12px]">
                  <div>
                    <dt className="text-[#71717a]">Country</dt>
                    <dd className="font-medium text-[#18181b]">{addrCountry}</dd>
                  </div>
                  <div>
                    <dt className="text-[#71717a]">Currency</dt>
                    <dd className="font-medium text-[#18181b]">{currency}</dd>
                  </div>
                </dl>
                {bankMasked && bankOnlyEdit ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950">
                    Replacing destination{' '}
                    <span className="font-semibold tabular-nums">{bankMasked}</span>
                  </p>
                ) : null}
                <Field label="Account holder name" required>
                  <input className="tv-input h-11" value={holderName} disabled={!canEdit || busy} onChange={(e) => setHolderName(e.target.value)} />
                </Field>
                <Field label="IBAN / account number" required hint="Used only for secure tokenization. Never stored in Traverion.">
                  <input className="tv-input h-11" value={iban} disabled={!canEdit || busy} onChange={(e) => setIban(e.target.value)} autoComplete="off" />
                </Field>
              </div>
            ) : null}

            {current.id === 'bank_confirm' ? (
              <div className="space-y-3 text-[14px] text-[#3f3f46]">
                <p>
                  Holder: <span className="font-semibold text-[#18181b]">{holderName || '—'}</span>
                </p>
                <p>
                  Account:{' '}
                  <span className="font-semibold tabular-nums text-[#18181b]">
                    {bankMasked || (iban ? `•••• ${iban.replace(/\s+/g, '').slice(-4)}` : '—')}
                  </span>
                </p>
                <p className="text-[12px] text-[#71717a]">
                  Submitting attaches the tokenized account. Payouts enable only when the provider confirms
                  capabilities.
                </p>
              </div>
            ) : null}

            {current.id === 'review_summary' || current.id === 'review_done' ? (
              <div className="space-y-4">
                <p className="text-[14px] text-[#52525b]">
                  Status:{' '}
                  <span className="font-semibold text-[#18181b]">
                    {statusHeadline(onboardingStatus, payoutsEnabled)}
                  </span>
                </p>
                <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">Business</dt>
                    <dd className="mt-0.5 text-[#18181b]">{legalName || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">Representative</dt>
                    <dd className="mt-0.5 text-[#18181b]">
                      {firstName || lastName ? `${firstName} ${lastName}`.trim() : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">Agreement</dt>
                    <dd className="mt-0.5 text-[#18181b]">{tosAccepted ? 'Accepted' : 'Not accepted'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">Bank</dt>
                    <dd className="mt-0.5 text-[#18181b]">
                      {bankMasked || (profile?.connect_payouts_enabled ? 'Connected' : 'Not connected')}
                    </dd>
                  </div>
                </dl>
                {due.length > 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-[12px] font-semibold text-amber-950">Still required</p>
                    <ul className="mt-1 list-disc pl-4 text-[12px] text-amber-950">
                      {due.slice(0, 6).map((req) => (
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
          </div>
        </div>
      ) : null}
    </>
  );

  if (!fullScreen) {
    return (
      <div className="mx-auto w-full max-w-[720px] space-y-4">
        <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={onClose}>
          Back to payout settings
        </button>
        {content}
        {!bootBusy && !blockedReason ? (
          <div className="flex items-center justify-between gap-3 pt-2">
            <button type="button" className="tv-btn-secondary h-11 px-4 text-[13px]" disabled={busy} onClick={goPrev}>
              {screenIndex === 0 ? 'Exit' : 'Back'}
            </button>
            <button
              type="button"
              className="tv-btn-primary h-11 px-5 text-[13px]"
              disabled={!canEdit || busy}
              onClick={onContinue}
            >
              {continueLabel}
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="tv-verify-workspace">
      <header className="tv-verify-workspace__header">
        <div className="flex min-w-0 items-center gap-3">
          <img src={BRAND_LOGO_SRC} alt="Traverion" className="h-7 w-auto shrink-0" />
          <span className="hidden text-[12px] font-semibold uppercase tracking-[0.14em] text-[#71717a] sm:inline">
            Verification
          </span>
        </div>
        <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={onClose} disabled={busy}>
          Save &amp; exit
        </button>
      </header>

      <div className="tv-verify-workspace__progress" aria-label="Verification progress">
        <div className="tv-verify-workspace__progress-meta">
          <span className="font-semibold text-[#18181b]">{visibleCategories[activeCategoryIndex]?.label}</span>
          <span className="text-[#71717a]">
            Step {substepIndex + 1} of {categoryScreens.length}
            <span className="hidden sm:inline"> · {current.title}</span>
          </span>
        </div>
        <div className="tv-verify-workspace__bar" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progressPct}%` }} />
        </div>
        <ol className="tv-verify-workspace__cats">
          {visibleCategories.map((cat, i) => {
            const done = i < activeCategoryIndex;
            const active = i === activeCategoryIndex;
            return (
              <li key={cat.id} className={[done ? 'is-done' : '', active ? 'is-active' : ''].filter(Boolean).join(' ')}>
                <span className="tv-verify-workspace__cat-dot" aria-hidden>
                  {done ? <Check className="h-2.5 w-2.5" /> : null}
                </span>
                <span className="tv-verify-workspace__cat-label">{cat.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="tv-verify-workspace__main">{content}</div>

      {!bootBusy && !blockedReason ? (
        <footer className="tv-verify-workspace__footer">
          <button type="button" className="tv-btn-secondary h-11 px-4 text-[13px]" disabled={busy} onClick={goPrev}>
            {screenIndex === 0 ? 'Exit' : 'Back'}
          </button>
          <p className="hidden items-center gap-1.5 text-[11px] text-[#71717a] sm:flex">
            <Lock className="h-3 w-3" aria-hidden />
            Secure submission
          </p>
          <button
            type="button"
            className="tv-btn-primary h-11 px-5 text-[13px]"
            disabled={!canEdit || busy}
            onClick={onContinue}
          >
            {continueLabel}
          </button>
        </footer>
      ) : (
        <footer className="tv-verify-workspace__footer">
          <button type="button" className="tv-btn-secondary h-11 px-4 text-[13px]" onClick={onClose}>
            Exit
          </button>
        </footer>
      )}
    </div>
  );
}
