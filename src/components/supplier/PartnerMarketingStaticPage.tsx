import { useLayoutEffect } from 'react';
import { ArrowLeft, Mail, Phone } from 'lucide-react';
import PartnerPortalFooter from './PartnerPortalFooter';
import { BRAND_LOGO_SRC } from '../../lib/brandAssets';
import { publicSiteBaseUrl } from '../../lib/publicSiteUrl';
import type { PartnerMarketingPageId } from '../../lib/partnerPortalPaths';
import {
  PARTNER_COOKIES_POLICY_PATH,
  PARTNER_PRIVACY_POLICY_PATH,
  PARTNER_TERMS_OF_SERVICE_PATH,
  PARTNER_LOGIN_PATH,
} from '../../lib/partnerPortalPaths';

const LAST_UPDATED = '2026-04-06';
const SUPPORT_EMAIL = 'info@traverion.com';
const SUPPORT_PHONE_DISPLAY = '+358 45 8803060';
const SUPPORT_PHONE_TEL = '+358458803060';

const navLink = 'text-finland font-medium hover:underline';

function PartnerStaticHeader() {
  const mainSite = publicSiteBaseUrl();
  return (
    <header className="bg-white/95 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40 supports-[backdrop-filter]:bg-white/90">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-4">
        <a href={PARTNER_LOGIN_PATH} className="flex items-center gap-2 text-gray-900 min-w-0">
          <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 sm:h-11 sm:w-11 object-contain flex-shrink-0" />
          <span className="font-semibold text-finland tracking-tight text-sm sm:text-base">Partner portal</span>
        </a>
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <a href={mainSite} className="text-sm text-gray-600 hover:text-finland transition-colors whitespace-nowrap">
            Main site
          </a>
          <a
            href={PARTNER_LOGIN_PATH}
            className="text-sm text-gray-600 hover:text-finland transition-colors whitespace-nowrap hidden xs:inline"
          >
            Log in
          </a>
        </div>
      </div>
    </header>
  );
}

function DocShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PartnerStaticHeader />
      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <a
          href={PARTNER_LOGIN_PATH}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-finland mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to partner login
        </a>
        <article className="bg-white rounded-2xl border border-gray-200 shadow-soft-lg p-6 sm:p-8 space-y-8">
          <header className="space-y-2 pb-2 border-b border-gray-100">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{title}</h1>
            {intro && <p className="text-gray-600 text-sm sm:text-base leading-relaxed">{intro}</p>}
            <p className="text-xs text-gray-500">Last updated: {LAST_UPDATED}</p>
          </header>
          <div className="space-y-8 text-gray-700 text-sm sm:text-[15px] leading-relaxed">{children}</div>
        </article>
      </main>
      <PartnerPortalFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function PartnerTermsContent() {
  return (
    <>
      <Section title="Who these terms apply to">
        <p>
          These Partner Terms of Service govern your use of the Traverion partner portal and your relationship with
          Traverion as a tour or activity supplier (&quot;Partner&quot;, &quot;you&quot;). They are separate from the{' '}
          <a href={publicSiteBaseUrl()} className={navLink}>
            traveler-facing site
          </a>{' '}
          terms. By creating a partner account or listing offerings, you agree to these terms and to operate in good
          faith.
        </p>
      </Section>
      <Section title="The platform">
        <p>
          Traverion provides an online marketplace where Partners publish listings for tours and activities. Traverion
          may display your content, process bookings in line with platform rules, and facilitate communication between
          you and travelers. Features, fees, and payout schedules may evolve; material changes will be communicated
          through the portal or by email where appropriate.
        </p>
      </Section>
      <Section title="Your obligations">
        <ul className="list-disc pl-5 space-y-2">
          <li>Provide accurate business and listing information, and keep it up to date.</li>
          <li>Hold valid permissions, licences, and insurance where required for your activities.</li>
          <li>Honour confirmed bookings and communicate clearly with guests (including cancellations per your policy and ours).</li>
          <li>Comply with applicable laws (consumer, tax, data protection, safety, and sector-specific rules).</li>
          <li>Not misuse the platform, other users&apos; data, or Traverion&apos;s systems.</li>
        </ul>
      </Section>
      <Section title="Listings, pricing, and availability">
        <p>
          You are responsible for prices, descriptions, availability, and inclusions/exclusions shown on your listings.
          Traverion may moderate, reject, or remove content that is misleading, unsafe, or incompatible with platform
          standards.
        </p>
      </Section>
      <Section title="Bookings and payments">
        <p>
          When a traveler books through Traverion, a contract is formed between you and the traveler for the experience,
          subject to your stated terms and Traverion&apos;s booking flow. Payouts, commissions (if any), refunds, and
          chargebacks are handled according to the payout and commercial terms shown in the portal or agreed separately
          in writing. If specific percentages or timelines are not yet shown in-product, Traverion will provide them
          before you are charged fees or receive settlements in a new way.
        </p>
      </Section>
      <Section title="Data and confidentiality">
        <p>
          You may receive personal data about guests. You must use it only to deliver the booked service and as
          described in our{' '}
          <a href={PARTNER_PRIVACY_POLICY_PATH} className={navLink}>
            Partner Privacy Policy
          </a>
          .
        </p>
      </Section>
      <Section title="Suspension and termination">
        <p>
          Traverion may suspend or terminate access for breach of these terms, risk to customers, legal requirements, or
          extended inactivity. You may stop using the portal at any time; outstanding bookings and payment obligations
          survive where applicable.
        </p>
      </Section>
      <Section title="Limitation of liability">
        <p>
          To the extent permitted by law, Traverion&apos;s liability arising from the partner relationship is limited
          as set out in your separate agreements or in the general terms that apply to the marketplace. Nothing in
          these terms excludes liability that cannot be limited under applicable law.
        </p>
      </Section>
      <Section title="Contact">
        <p>
          Questions about these terms:{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={navLink}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </>
  );
}

function PartnerPrivacyContent() {
  return (
    <>
      <Section title="Purpose">
        <p>
          This Partner Privacy Policy describes how Traverion processes personal data when you use the partner portal as
          a supplier. It supplements (and, for partner activities, takes precedence over) high-level statements on the
          consumer site. Travelers booking on Traverion are covered by the consumer-facing privacy materials on{' '}
          <a href={publicSiteBaseUrl()} className={navLink}>
            traverion.com
          </a>
          .
        </p>
      </Section>
      <Section title="Data we process about Partners">
        <ul className="list-disc pl-5 space-y-2">
          <li>Account and login data (e.g. email, authentication identifiers).</li>
          <li>Business profile: legal name, registration details, address, tax/VAT where provided, bank details for payouts.</li>
          <li>Verification documents you upload for compliance review.</li>
          <li>Usage and support communications with Traverion.</li>
        </ul>
      </Section>
      <Section title="Data you receive about travelers">
        <p>
          When you receive a booking, we may show guest name, contact details, party size, special requests, and
          messages sent through the platform. You act as an independent controller or processor depending on your role
          and jurisdiction; you must only use this data to fulfil the booking, handle disputes, and meet legal
          obligations, and not for unrelated marketing unless you have a valid lawful basis and, where required,
          consent.
        </p>
      </Section>
      <Section title="Purposes and legal bases">
        <p>
          We process partner data to operate the marketplace, authenticate users, pay you, prevent fraud, comply with
          law, improve the service, and communicate about your account. Legal bases include contract, legitimate
          interests (e.g. securing the platform), and legal obligation where applicable.
        </p>
      </Section>
      <Section title="Processors and transfers">
        <p>
          We use trusted infrastructure and service providers (e.g. hosting, email, payments). Some may be outside the
          EEA; where required we use appropriate safeguards such as standard contractual clauses.
        </p>
      </Section>
      <Section title="Retention">
        <p>
          We keep partner and booking-related data as long as needed for operations, legal claims, and regulatory
          retention periods, then delete or anonymise where possible.
        </p>
      </Section>
      <Section title="Your rights">
        <p>
          Depending on your location, you may have rights to access, rectify, erase, restrict, or object to processing,
          and to lodge a complaint with a supervisory authority. Contact us at{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={navLink}>
            {SUPPORT_EMAIL}
          </a>{' '}
          to exercise rights.
        </p>
      </Section>
      <Section title="Cookies">
        <p>
          See our{' '}
          <a href={PARTNER_COOKIES_POLICY_PATH} className={navLink}>
            Partner Cookie Policy
          </a>{' '}
          for the partner site.
        </p>
      </Section>
    </>
  );
}

function PartnerCookiesContent() {
  return (
    <>
      <Section title="Cookies on the partner portal">
        <p>
          The partner site uses cookies and similar technologies to keep you signed in, protect against abuse, remember
          preferences, and understand how the portal is used.
        </p>
      </Section>
      <Section title="Types">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <strong>Strictly necessary:</strong> session and security cookies required for login and core features.
          </li>
          <li>
            <strong>Functional:</strong> choices such as UI preferences where we add them.
          </li>
          <li>
            <strong>Analytics:</strong> if enabled, to improve performance and reliability (aggregated where possible).
          </li>
        </ul>
      </Section>
      <Section title="Managing cookies">
        <p>
          You can control cookies through your browser settings. Blocking strictly necessary cookies may prevent sign-in
          or parts of the dashboard from working.
        </p>
      </Section>
      <Section title="More information">
        <p>
          For personal data related to cookies, see the{' '}
          <a href={PARTNER_PRIVACY_POLICY_PATH} className={navLink}>
            Partner Privacy Policy
          </a>
          .
        </p>
      </Section>
    </>
  );
}

function PartnerLegalNoticeContent() {
  return (
    <>
      <Section title="Service">
        <p>
          The Traverion partner portal (including partner.traverion.com) is operated by Traverion for tour and activity
          suppliers who list and manage offerings on the Traverion marketplace.
        </p>
      </Section>
      <Section title="Operator">
        <p>
          <strong>TRAVERION</strong> (Traverion Travel Agency). Full legal entity name, registered office, and other
          official registration particulars are available on request for contracts and regulatory correspondence.
        </p>
      </Section>
      <Section title="Contact">
        <div className="rounded-xl bg-gray-50 border border-gray-100 p-5 space-y-3">
          <p className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-finland shrink-0 mt-0.5" />
            <span>
              <strong className="text-gray-900">Email:</strong>{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className={navLink}>
                {SUPPORT_EMAIL}
              </a>
            </span>
          </p>
          <p className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-finland shrink-0 mt-0.5" />
            <span>
              <strong className="text-gray-900">Phone:</strong>{' '}
              <a href={`tel:${SUPPORT_PHONE_TEL}`} className={navLink}>
                {SUPPORT_PHONE_DISPLAY}
              </a>
            </span>
          </p>
          <p>
            <strong className="text-gray-900">Postal / mailing address:</strong> available on request via{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={navLink}>
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>
      </Section>
      <Section title="Related documents">
        <ul className="list-disc pl-5 space-y-2">
          <li>
            <a href={PARTNER_TERMS_OF_SERVICE_PATH} className={navLink}>
              Partner Terms of Service
            </a>
          </li>
          <li>
            <a href={PARTNER_PRIVACY_POLICY_PATH} className={navLink}>
              Partner Privacy Policy
            </a>
          </li>
          <li>
            <a href={PARTNER_COOKIES_POLICY_PATH} className={navLink}>
              Partner Cookie Policy
            </a>
          </li>
          <li>
            Traveler policies on{' '}
            <a href={publicSiteBaseUrl()} className={navLink}>
              traverion.com
            </a>
          </li>
        </ul>
      </Section>
    </>
  );
}

function PartnerContactContent() {
  return (
    <>
      <Section title="Partner support">
        <p>
          For questions about your partner account, listings, bookings, payouts, or verification, contact us using the
          details below. For traveler bookings and the public website, see{' '}
          <a href={publicSiteBaseUrl()} className={navLink}>
            traverion.com
          </a>
          .
        </p>
      </Section>
      <Section title="Email">
        <p className="flex items-start gap-3">
          <Mail className="w-5 h-5 text-finland shrink-0 mt-0.5" />
          <a href={`mailto:${SUPPORT_EMAIL}`} className={`${navLink} text-base`}>
            {SUPPORT_EMAIL}
          </a>
        </p>
      </Section>
      <Section title="Phone">
        <p className="flex items-start gap-3">
          <Phone className="w-5 h-5 text-finland shrink-0 mt-0.5" />
          <a href={`tel:${SUPPORT_PHONE_TEL}`} className={`${navLink} text-base`}>
            {SUPPORT_PHONE_DISPLAY}
          </a>
        </p>
      </Section>
      <Section title="Postal address">
        <p>
          For formal correspondence, email{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={navLink}>
            {SUPPORT_EMAIL}
          </a>{' '}
          and we will provide the appropriate mailing details.
        </p>
      </Section>
    </>
  );
}

const PAGE_META: Record<
  PartnerMarketingPageId,
  { title: string; description: string; docTitle: string; intro?: string }
> = {
  termsofservice: {
    title: 'Partner Terms of Service',
    description: 'Terms for tour and activity suppliers using the Traverion partner portal.',
    docTitle: 'Partner Terms of Service · Traverion',
    intro: 'Rules for listing, bookings, and using the Traverion supplier platform.',
  },
  privacypolicy: {
    title: 'Partner Privacy Policy',
    description: 'How Traverion processes supplier and guest data in the partner portal.',
    docTitle: 'Partner Privacy Policy · Traverion',
    intro: 'How we handle personal data when you operate as a Traverion partner.',
  },
  cookiespolicy: {
    title: 'Partner Cookie Policy',
    description: 'Cookies and similar technologies on the Traverion partner site.',
    docTitle: 'Partner Cookie Policy · Traverion',
    intro: 'Cookie and storage practices on partner.traverion.com.',
  },
  legalnotice: {
    title: 'Legal notice',
    description: 'Operator identification and official contact for the Traverion partner portal.',
    docTitle: 'Legal notice · Traverion Partner',
    intro: 'Imprint-style information for the partner portal.',
  },
  contact: {
    title: 'Contact',
    description: 'Contact Traverion for partner support.',
    docTitle: 'Contact · Traverion Partner',
    intro: 'Reach the Traverion team for supplier and partnership enquiries.',
  },
};

export default function PartnerMarketingStaticPage({ pageId }: { pageId: PartnerMarketingPageId }) {
  const meta = PAGE_META[pageId];

  useLayoutEffect(() => {
    document.title = meta.docTitle;
    const d = document.querySelector('meta[name="description"]');
    if (d) d.setAttribute('content', meta.description);
  }, [meta.description, meta.docTitle]);

  const body = (() => {
    switch (pageId) {
      case 'termsofservice':
        return <PartnerTermsContent />;
      case 'privacypolicy':
        return <PartnerPrivacyContent />;
      case 'cookiespolicy':
        return <PartnerCookiesContent />;
      case 'legalnotice':
        return <PartnerLegalNoticeContent />;
      case 'contact':
        return <PartnerContactContent />;
      default:
        return null;
    }
  })();

  return (
    <DocShell title={meta.title} intro={meta.intro}>
      {body}
    </DocShell>
  );
}
