import { useState } from 'react';
import { submitContactInquiry } from '../../data/supabase-contact';
import { required, validateEmail } from '../../lib/validation';
import NoticeCallout from '../NoticeCallout';

/**
 * Optional supplier interest / application inquiry on the partner landing.
 * Does not replace account signup — signup remains the primary onboarding path.
 */
export default function SupplierInterestForm() {
  const [form, setForm] = useState({
    contactName: '',
    businessName: '',
    email: '',
    country: '',
    city: '',
    website: '',
    businessType: '',
    categories: '',
    description: '',
    message: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!required(form.contactName).valid) {
      setError('Enter a contact name.');
      return;
    }
    if (!required(form.businessName).valid) {
      setError('Enter your business name.');
      return;
    }
    const emailCheck = validateEmail(form.email);
    if (!emailCheck.valid) {
      setError(emailCheck.message ?? 'Enter a valid email.');
      return;
    }
    if (!required(form.country).valid) {
      setError('Enter your country.');
      return;
    }
    if (!required(form.businessType).valid) {
      setError('Describe your business type.');
      return;
    }
    if (!required(form.description).valid) {
      setError('Briefly describe your services.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const result = await submitContactInquiry({
        name: form.contactName.trim(),
        email: form.email.trim(),
        subject: `${form.businessName.trim()} — supplier application`,
        message: [form.description.trim(), form.message.trim() ? `\n\n${form.message.trim()}` : '']
          .filter(Boolean)
          .join(''),
        inquiry_type: 'supplier',
        structured_data: {
          business_name: form.businessName.trim(),
          contact_person: form.contactName.trim(),
          country: form.country.trim(),
          city_or_destination: form.city.trim() || null,
          website: form.website.trim() || null,
          business_type: form.businessType.trim(),
          categories: form.categories.trim() || null,
        },
      });
      if (result.success) {
        setReference(result.reference);
        setForm({
          contactName: '',
          businessName: '',
          email: '',
          country: '',
          city: '',
          website: '',
          businessType: '',
          categories: '',
          description: '',
          message: '',
        });
      } else {
        setError(result.error || 'Could not submit. Try again.');
      }
    } catch {
      setError('Could not submit. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (reference) {
    return (
      <NoticeCallout title="Application received" tone="success">
        Thank you for your interest. Your application reference is{' '}
        <strong className="tabular-nums">{reference}</strong>. We&apos;ve sent a confirmation to your
        email. This confirms receipt only — not account verification or approval. You can still create
        a partner account with Get started above.
      </NoticeCallout>
    );
  }

  return (
    <form noValidate onSubmit={(e) => void onSubmit(e)} className="mx-auto w-full max-w-3xl space-y-4">
      {error ? (
        <NoticeCallout title="Could not submit" tone="danger">
          {error}
        </NoticeCallout>
      ) : null}
      <p className="m-0 text-sm leading-relaxed text-ink-muted">
        Prefer to introduce your business first? Send an application below. Creating a partner account
        (Get started) remains the path to list products — this form does not create an account.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Contact person
          </label>
          <input
            className="tv-input"
            value={form.contactName}
            onChange={(e) => setForm((p) => ({ ...p, contactName: e.target.value }))}
            autoComplete="name"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Business name
          </label>
          <input
            className="tv-input"
            value={form.businessName}
            onChange={(e) => setForm((p) => ({ ...p, businessName: e.target.value }))}
            autoComplete="organization"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Email
          </label>
          <input
            type="email"
            className="tv-input"
            value={form.email}
            onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
            autoComplete="email"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Country
          </label>
          <input
            className="tv-input"
            value={form.country}
            onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))}
            autoComplete="country-name"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            City / destination <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input
            className="tv-input"
            value={form.city}
            onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Website <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input
            type="url"
            className="tv-input"
            value={form.website}
            onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">Business type</label>
          <input
            className="tv-input"
            value={form.businessType}
            onChange={(e) => setForm((p) => ({ ...p, businessType: e.target.value }))}
            placeholder="Tour operator, stay host, rental…"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-ink">
            Categories <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input
            className="tv-input"
            value={form.categories}
            onChange={(e) => setForm((p) => ({ ...p, categories: e.target.value }))}
            placeholder="Tours, stays, rentals…"
          />
        </div>
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-ink">Brief description of services</label>
        <textarea
          className="tv-input min-h-[6rem] resize-y"
          rows={4}
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-ink">
          Additional message <span className="font-normal text-ink-faint">(optional)</span>
        </label>
        <textarea
          className="tv-input resize-y"
          rows={2}
          value={form.message}
          onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
        />
      </div>
      <button type="submit" disabled={submitting} className="tv-btn-primary h-11 px-5 disabled:opacity-50">
        {submitting ? 'Sending…' : 'Send supplier application'}
      </button>
    </form>
  );
}
