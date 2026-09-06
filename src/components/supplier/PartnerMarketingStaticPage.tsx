import { useLayoutEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
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

const LAST_UPDATED = '6 April 2026';
const SUPPORT_EMAIL = 'info@traverion.com';

const navLink = 'underline underline-offset-2 decoration-black/25 hover:decoration-ink text-ink';

function PartnerStaticHeader() {
  const mainSite = publicSiteBaseUrl();
  return (
    <header className="bg-paper/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-2xl mx-auto px-5 sm:px-6 h-14 flex items-center justify-between gap-4">
        <a href={PARTNER_LOGIN_PATH} className="flex items-center gap-2.5 text-ink min-w-0">
          <img src={BRAND_LOGO_SRC} alt="" className="h-10 w-10 object-contain flex-shrink-0" />
          <span className="font-sans text-sm font-semibold tracking-[0.18em]">TRAVERION</span>
        </a>
        <div className="flex items-center gap-4 shrink-0">
          <a href={mainSite} className="lux-flat text-sm text-ink-muted hover:text-ink">
            Browse tours
          </a>
          <a href={PARTNER_LOGIN_PATH} className="lux-flat text-sm text-ink-muted hover:text-ink">
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
    <div className="min-h-[100dvh] bg-paper text-ink flex flex-col">
      <PartnerStaticHeader />
      <main className="flex-1 w-full max-w-2xl mx-auto px-5 sm:px-6 py-12 sm:py-16 motion-safe:animate-fade-in">
        <a href={PARTNER_LOGIN_PATH} className="tv-btn-ghost mb-8 -ml-2 inline-flex">
          <ArrowLeft className="w-4 h-4" aria-hidden />
          Back
        </a>
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink-faint">Traverion Partner</p>
        <h1 className="mt-2 font-display text-3xl sm:text-5xl text-ink tracking-tight">{title}</h1>
        {intro ? <p className="mt-3 text-base text-ink-muted leading-relaxed max-w-xl">{intro}</p> : null}
        <p className="mt-4 text-[11px] uppercase tracking-[0.16em] text-ink-faint">Last updated {LAST_UPDATED}</p>
        <article
          className="mt-10 space-y-8 text-[15px] sm:text-base leading-relaxed
            [&_p]:text-ink-muted [&_li]:text-ink-muted
            [&_strong]:text-ink [&_strong]:font-semibold
            [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-black/25 hover:[&_a]:decoration-ink"
        >
          {children}
        </article>
      </main>
      <PartnerPortalFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl text-ink tracking-tight">{title}</h2>
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
        <p>
          <strong>Email:</strong>{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={navLink}>
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p>
          <strong>Postal / mailing address:</strong> available on request via{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className={navLink}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
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
        <p>
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
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
