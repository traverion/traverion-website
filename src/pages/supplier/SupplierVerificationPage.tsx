import { useEffect, useState } from 'react';
import SupplierVerificationCard from '../../components/supplier/SupplierVerificationCard';
import { SUPPLIER_PAGE_CLASS, SupplierPageHero } from '../../components/supplier/supplierUi';
import { fetchSupplierProfile, type SupplierProfileRow } from '../../data/supabase-supplier-profile';
import { useSupplierAuth } from '../../contexts/SupplierAuthContext';
import { supplierVerificationState } from '../../lib/supplier-verification-state';

export default function SupplierVerificationPage({
  profile: initialProfile = null,
}: {
  profile?: SupplierProfileRow | null;
}) {
  const { user } = useSupplierAuth();
  const [profile, setProfile] = useState<SupplierProfileRow | null>(initialProfile);
  useEffect(() => {
    setProfile(initialProfile);
  }, [initialProfile]);
  useEffect(() => {
    if (!user?.id) return;
    void fetchSupplierProfile(user.id).then((next) => {
      if (next) setProfile(next);
    });
  }, [user?.id]);

  const view = supplierVerificationState(profile);
  const companyName = profile?.company_legal_name?.trim() || '';
  const documentOnFile = Boolean(profile?.company_registration_document_path?.trim());
  const payoutOnFile = profile?.connect_payouts_enabled === true;

  return (
    <div className={SUPPLIER_PAGE_CLASS}>
      <SupplierPageHero sansTitle title="Verification" description="The status of your supplier account." />
      <SupplierVerificationCard view={view} variant="page" />
      <section className="rounded-2xl border border-slate-200/80 bg-white px-5 py-5 sm:px-6" aria-label="Submitted information">
        <h2 className="text-[15px] font-semibold text-slate-900">Submitted information</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-[12px] text-slate-500">Company</dt>
            <dd className="mt-1 text-[14px] text-slate-900">{companyName || 'Not added'}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-slate-500">Registration document</dt>
            <dd className="mt-1 text-[14px] text-slate-900">{documentOnFile ? 'On file' : 'Not added'}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-slate-500">Payout account</dt>
            <dd className="mt-1 text-[14px] text-slate-900">
              {view.status === 'verified' ? 'Approved' : payoutOnFile ? 'Submitted' : 'Not added'}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
