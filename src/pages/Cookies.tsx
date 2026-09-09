import LegalPageShell from '../components/LegalPageShell';
import { COOKIES_PREFERENCES_NOTE } from '../lib/booking-confirmation-copy';

type CookiesProps = {
  onNavigate?: (page: string) => void;
};

const LAST_UPDATED = '26 March 2026';

export default function Cookies({ onNavigate }: CookiesProps) {
  return (
    <LegalPageShell
      title="Cookies & marketing preferences"
      subtitle="What cookies we use, why they matter, and how you can control analytics and marketing signals when you browse Traverion."
      lastUpdated={LAST_UPDATED}
      onNavigate={onNavigate}
    >
      <section>
        <h2>What are cookies?</h2>
        <p>
          Cookies are small text files that are placed on your computer or mobile device when you visit our website.
          They help us provide you with a better experience by remembering your preferences and enabling certain
          functionality.
        </p>
      </section>

      <section>
        <h2>How we use cookies</h2>
        <p>We use cookies for the following purposes:</p>
        <ul>
          <li>
            <strong>Essential cookies:</strong> Required for basic website functionality
          </li>
          <li>
            <strong>Analytics cookies:</strong> Help us understand how visitors use our site
          </li>
          <li>
            <strong>Preference cookies:</strong> Remember your language and region settings
          </li>
          <li>
            <strong>Marketing cookies:</strong> Used to deliver relevant advertisements
          </li>
        </ul>
        <p>{COOKIES_PREFERENCES_NOTE}</p>
      </section>

      <section>
        <h2>Managing cookies</h2>
        <p>You can control and manage cookies in several ways:</p>
        <ul>
          <li>Use your browser settings to block or delete cookies</li>
          <li>Use our cookie preference center (if available)</li>
          <li>Opt out of specific cookie categories</li>
        </ul>
        <p>Blocking certain cookies may affect the functionality of our website.</p>
      </section>

      <section>
        <h2>Third-party tools &amp; retention</h2>
        <p>
          Some cookies are set by trusted partners (for example analytics or embedded maps). Those providers have their
          own privacy notices. We aim to use only services that meet reasonable security and compliance standards.
        </p>
        <p>
          Retention periods vary: session cookies expire when you close the browser; persistent cookies may last from a
          few days to several months depending on their purpose. Marketing preferences you save with us are kept until
          you withdraw consent or close your account, subject to legal retention needs.
        </p>
      </section>

      <section>
        <h2>Contact us</h2>
        <p>If you have any questions about our use of cookies, please contact us:</p>
        <p>
          Email: <a href="mailto:info@traverion.com">info@traverion.com</a>
          <br />
          Address: TRAVERION Travel Agency, Finland
        </p>
      </section>
    </LegalPageShell>
  );
}
