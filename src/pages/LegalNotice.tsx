import LegalPageShell from '../components/LegalPageShell';
import type { MouseEvent } from 'react';

type LegalNoticeProps = {
  onNavigate?: (page: string) => void;
};

const LAST_UPDATED = '26 March 2026';

export default function LegalNotice({ onNavigate }: LegalNoticeProps) {
  const go = (page: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate(page);
    }
  };

  return (
    <LegalPageShell
      eyebrow="Legal"
      title="Legal notice"
      subtitle="Operator identification, contact details for official correspondence, and links to our policies."
      lastUpdated={LAST_UPDATED}
      onNavigate={onNavigate}
      toc={[
        { id: 'operator', label: 'Website operator' },
        { id: 'contact', label: 'Contact' },
        { id: 'consumer', label: 'Consumer information' },
        { id: 'related', label: 'Related documents' },
      ]}
    >
      <section>
        <h2 id="operator">Website operator</h2>
        <p>
          This website and the Traverion travel platform are operated by <strong>TRAVERION</strong> (Traverion Travel
          Agency), based in Finland. We arrange and facilitate bookings for tours, activities, stays, and related travel
          services in line with our{' '}
          <a href="/terms" onClick={go('terms')}>
            General Terms and Conditions
          </a>
          .
        </p>
        <p>
          Specific company registration details (legal entity name, registered address, and official registration
          identifiers used in your jurisdiction) can be provided on request for contractual or regulatory purposes. For
          general enquiries, use the contact details below.
        </p>
      </section>

      <section>
        <h2 id="contact">Contact for legal &amp; official matters</h2>
        <p>
          {/* Phase 1691: in-app Contact parity with Cookies/Privacy. */}
          <a href="/contact" onClick={go('contact')}>
            Contact support
          </a>
          <br />
          Email: <a href="mailto:info@traverion.com">info@traverion.com</a>
          <br />
          Postal address: TRAVERION Travel Agency, Finland
        </p>
      </section>

      <section>
        <h2 id="consumer">Consumer information</h2>
        <p>
          The European Commission provides a platform for online dispute resolution (ODR):{' '}
          <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noopener noreferrer">
            https://ec.europa.eu/consumers/odr
          </a>
          . Participation in a specific dispute resolution body is subject to applicable law and our operational setup;
          your statutory rights as a consumer are not limited by this notice.
        </p>
      </section>

      <section>
        <h2 id="related">Related documents</h2>
        <ul>
          <li>
            <a href="/terms" onClick={go('terms')}>
              General Terms and Conditions
            </a>
          </li>
          <li>
            <a href="/privacy" onClick={go('privacy')}>
              Privacy Policy
            </a>
          </li>
          <li>
            <a href="/cookies" onClick={go('cookies')}>
              Cookies and marketing preferences
            </a>
          </li>
        </ul>
      </section>
    </LegalPageShell>
  );
}
