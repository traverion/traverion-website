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
      title="Legal notice"
      subtitle="Operator identification, contact details for official correspondence, and links to our policies."
      lastUpdated={LAST_UPDATED}
      onNavigate={onNavigate}
    >
      <section>
        <h2>Website operator</h2>
        <p>
          This website and the Traverion travel platform are operated by <strong>TRAVERION</strong> (Traverion Travel
          Agency), based in Finland. We arrange and facilitate bookings for tours, activities, and related travel
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
        <h2>Contact for legal &amp; official matters</h2>
        <p>
          Email: <a href="mailto:info@traverion.com">info@traverion.com</a>
          <br />
          Postal address: TRAVERION Travel Agency, Finland
        </p>
      </section>

      <section>
        <h2>Consumer information</h2>
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
        <h2>Related documents</h2>
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
