import LegalPageShell from '../components/LegalPageShell';

type PrivacyProps = {
  onNavigate?: (page: string) => void;
};

const LAST_UPDATED = '26 March 2026';

export default function Privacy({ onNavigate }: PrivacyProps) {
  return (
    <LegalPageShell
      title="Privacy Policy"
      subtitle="How we collect, use, and protect personal data when you use Traverion — including bookings, accounts, and marketing preferences."
      lastUpdated={LAST_UPDATED}
      onNavigate={onNavigate}
    >
      <section>
        <h2>Information we collect</h2>
        <p>We collect information you provide directly to us, such as when you:</p>
        <ul>
          <li>Book travel packages or request quotes</li>
          <li>Create an account or contact us</li>
          <li>Subscribe to our newsletter</li>
          <li>Participate in surveys or promotions</li>
        </ul>
        <p>This may include your name, email address, phone number, travel preferences, and payment information.</p>
      </section>

      <section>
        <h2>How we use your information</h2>
        <p>We use the information we collect to:</p>
        <ul>
          <li>Provide, maintain, and improve our services</li>
          <li>Process transactions and send related information</li>
          <li>Send technical notices and support messages</li>
          <li>Respond to your comments and questions</li>
          <li>Provide personalized travel recommendations</li>
        </ul>
      </section>

      <section>
        <h2>Information sharing</h2>
        <p>We do not sell, trade, or otherwise transfer your personal information to third parties except:</p>
        <ul>
          <li>With your consent</li>
          <li>To trusted partners who assist in operating our website</li>
          <li>When required by law or to protect our rights</li>
          <li>In connection with a business transfer or acquisition</li>
        </ul>
      </section>

      <section>
        <h2>Data security</h2>
        <p>
          We implement appropriate security measures to protect your personal information against unauthorized access,
          alteration, disclosure, or destruction.
        </p>
        <p>However, no method of transmission over the internet is 100% secure, and we cannot guarantee absolute security.</p>
      </section>

      <section>
        <h2>Your rights (including GDPR)</h2>
        <p>
          Where the EU General Data Protection Regulation (GDPR) or similar laws apply, you may have the right to access,
          correct, delete, or restrict processing of your personal data, to data portability, and to object to certain
          processing. You may also lodge a complaint with a supervisory authority in your country of residence.
        </p>
        <p>
          To exercise these rights, contact us using the details below. We may need to verify your identity before
          fulfilling a request. Our legal bases for processing include performance of a contract (e.g. completing a
          booking), legitimate interests (e.g. fraud prevention and analytics), consent where required (e.g. certain
          marketing cookies), and legal obligation.
        </p>
      </section>

      <section>
        <h2>Contact us</h2>
        <p>If you have any questions about this Privacy Policy, please contact us:</p>
        <p>
          Email:{' '}
          <a href="mailto:info@traverion.com">info@traverion.com</a>
          <br />
          Address: TRAVERION Travel Agency, Finland
        </p>
      </section>
    </LegalPageShell>
  );
}
