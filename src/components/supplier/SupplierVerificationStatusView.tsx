import type { SupplierProfileRow } from '../../data/supabase-supplier-profile';
import {
  connectExperienceLabel,
  deriveConnectExperienceState,
} from '../../lib/connect-payout-progress';
import { connectCanReceiveTransfers } from '../../lib/connect-payout-status';
import {
  verificationNextStepsCopy,
  verificationStatusTone,
} from '../../lib/verification-workspace-lifecycle';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';

type Props = {
  profile: SupplierProfileRow | null;
  bankMasked: string | null;
  canEdit: boolean;
  busy: boolean;
  error: string | null;
  note: string | null;
  accountId: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onUpdateBusiness: () => void;
  onUpdateBank: () => void;
  onFixRequirements: () => void;
  onContinueIdentity: () => void;
  fullScreen?: boolean;
};

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#71717a]">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] font-medium text-[#18181b]">{value || '—'}</dd>
    </div>
  );
}

export default function SupplierVerificationStatusView({
  profile,
  bankMasked,
  canEdit,
  busy,
  error,
  note,
  accountId,
  onClose,
  onRefresh,
  onUpdateBusiness,
  onUpdateBank,
  onFixRequirements,
  onContinueIdentity,
  fullScreen = true,
}: Props) {
  const experience = deriveConnectExperienceState(profile);
  const label = connectExperienceLabel(experience);
  const tone = verificationStatusTone(experience);
  const next = verificationNextStepsCopy(profile);
  const due = Array.isArray(profile?.connect_requirements_currently_due)
    ? profile!.connect_requirements_currently_due!
    : [];
  const past = Array.isArray(profile?.connect_requirements_past_due)
    ? profile!.connect_requirements_past_due!
    : [];
  const outstanding = [...due, ...past].map(String);
  const transfersOk = connectCanReceiveTransfers(profile ?? {});
  const payoutsOk = Boolean(profile?.connect_payouts_enabled) && transfersOk;
  const needsAction =
    experience === 'additional_information_required' ||
    experience === 'information_required' ||
    experience === 'restricted' ||
    outstanding.length > 0;
  const needsIdentity = outstanding.some((r) => /verification\.document|identity/i.test(r));

  const toneClass =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
      : tone === 'pending'
        ? 'border-sky-200 bg-sky-50 text-sky-950'
        : tone === 'action'
          ? 'border-amber-200 bg-amber-50 text-amber-950'
          : tone === 'danger'
            ? 'border-red-200 bg-red-50 text-red-950'
            : 'border-[#e5e7eb] bg-[#fafafa] text-[#18181b]';

  const businessName =
    profile?.company_legal_name?.trim() || profile?.display_name?.trim() || '—';
  const address = [profile?.address_street, profile?.address_postal_code, profile?.address_city, profile?.address_country]
    .filter(Boolean)
    .join(', ');
  const bankLabel =
    bankMasked ||
    (profile?.connect_payouts_enabled ? 'Connected (masked by provider)' : 'Not connected');

  const body = (
    <div className="tv-verify-status mx-auto w-full max-w-[40rem] space-y-5">
      <div className={`rounded-[12px] border px-4 py-3 ${toneClass}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-80">Verification status</p>
        <p className="mt-1 text-lg font-bold tracking-tight">{label}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed opacity-90">{next}</p>
      </div>

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

      <section className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h2 className="text-sm font-bold text-[#18181b]">Submitted details</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <SummaryRow label="Business" value={businessName} />
          <SummaryRow
            label="Structure"
            value={profile?.business_type === 'individual' ? 'Individual' : 'Company'}
          />
          <SummaryRow label="Address" value={address || '—'} />
          <SummaryRow label="Phone" value={profile?.contact_phone?.trim() || '—'} />
          <SummaryRow label="Bank account" value={bankLabel} />
          <SummaryRow
            label="Account"
            value={accountId ? `${accountId.slice(0, 8)}…` : '—'}
          />
        </dl>
      </section>

      <section className="rounded-[12px] border border-[#e5e7eb] bg-white px-4 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <h2 className="text-sm font-bold text-[#18181b]">Provider capabilities</h2>
        <ul className="mt-3 space-y-2 text-[13px] text-[#3f3f46]">
          <li className="flex items-center justify-between gap-3">
            <span>Earnings transfers</span>
            <span className="font-semibold text-[#18181b]">{transfersOk ? 'Enabled' : 'Not enabled'}</span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Bank payouts</span>
            <span className="font-semibold text-[#18181b]">{payoutsOk ? 'Enabled' : 'Not enabled'}</span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <span>Details submitted</span>
            <span className="font-semibold text-[#18181b]">
              {profile?.connect_details_submitted ? 'Yes' : 'No'}
            </span>
          </li>
        </ul>
        <p className="mt-3 text-[12px] leading-relaxed text-[#71717a]">
          Capabilities come from the payment provider. Completing Traverion forms does not by itself mean verification
          is complete or that bank payouts are operational.
        </p>
      </section>

      {outstanding.length > 0 ? (
        <section className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-4">
          <h2 className="text-sm font-bold text-amber-950">Outstanding requirements</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-amber-950">
            {outstanding.slice(0, 10).map((req) => (
              <li key={req}>{req.replace(/\./g, ' · ')}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="tv-btn-secondary h-10 px-3 text-[13px]" disabled={busy} onClick={onRefresh}>
          {busy ? 'Refreshing…' : 'Refresh status'}
        </button>
        {canEdit && needsAction ? (
          <button type="button" className="tv-btn-primary h-10 px-3 text-[13px]" disabled={busy} onClick={onFixRequirements}>
            Update required details
          </button>
        ) : null}
        {canEdit && needsIdentity ? (
          <button type="button" className="tv-btn-secondary h-10 px-3 text-[13px]" disabled={busy} onClick={onContinueIdentity}>
            Continue identity
          </button>
        ) : null}
        {canEdit ? (
          <>
            <button type="button" className="tv-btn-secondary h-10 px-3 text-[13px]" disabled={busy} onClick={onUpdateBusiness}>
              Update business
            </button>
            <button type="button" className="tv-btn-secondary h-10 px-3 text-[13px]" disabled={busy} onClick={onUpdateBank}>
              Update bank
            </button>
          </>
        ) : null}
      </div>
    </div>
  );

  if (!fullScreen) {
    return (
      <div className="space-y-4">
        <button type="button" className="text-[13px] font-semibold text-[#073b83]" onClick={onClose}>
          Back to payout settings
        </button>
        {body}
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
          Done
        </button>
      </header>
      <div className="tv-verify-workspace__main tv-verify-workspace__stage--scroll">{body}</div>
      <footer className="tv-verify-workspace__footer">
        <button type="button" className="tv-btn-secondary h-11 px-4 text-[13px]" disabled={busy} onClick={onClose}>
          Back to settings
        </button>
        <button type="button" className="tv-btn-primary h-11 px-5 text-[13px]" disabled={busy} onClick={onRefresh}>
          {busy ? 'Refreshing…' : 'Refresh status'}
        </button>
      </footer>
    </div>
  );
}
