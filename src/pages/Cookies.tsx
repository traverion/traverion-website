import LegalPageShell from '../components/LegalPageShell';
import { COOKIES_PREFERENCES_NOTE } from '../lib/booking-confirmation-copy';

type CookiesProps = {
  onNavigate?: (page: string) => void;
};

const LAST_UPDATED = '26 March 2026';

const CATEGORIES = [
  {
    id: 'essential',
    title: 'Essential',
    required: true,
    body: 'Required for sign-in, checkout, security, and core site features. These cannot be turned off without breaking those flows.',
  },
  {
    id: 'preference',
    title: 'Preferences',
    required: false,
    body: 'Remember language, region, and similar choices so the site feels consistent across visits.',
  },
  {
    id: 'analytics',
    title: 'Analytics',
    required: false,
    body: 'Help us understand how visitors use Traverion. We do not currently load third-party analytics tags that require a separate opt-in.',
  },
  {
    id: 'marketing',
    title: 'Marketing',
    required: false,
    body: 'Used only if we enable advertising or remarketing tools. Until then, no marketing cookies are set by Traverion for that purpose.',
  },
] as const;

export default function Cookies({ onNavigate }: CookiesProps) {
  const goContact = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('contact');
    }
  };

  return (
    <LegalPageShell
      layout="legal"
      eyebrow="Legal"
      title="Cookies and marketing preferences"
      subtitle="What cookies we use, why they matter, and how you can control optional signals when you browse Traverion."
      lastUpdated={LAST_UPDATED}
      onNavigate={onNavigate}
      toc={[
        { id: 'what', label: 'What are cookies?' },
        // Phase 1640: TOC labels match section headings for predictable in-page nav.
        { id: 'how', label: 'How we use cookies' },
        { id: 'preferences', label: 'Preference center' },
        { id: 'managing', label: 'Managing cookies' },
        { id: 'third-party', label: 'Third-party tools & retention' },
        { id: 'contact', label: 'Contact us' },
      ]}
    >
      <section>
        <h2 id="what">What are cookies?</h2>
        <p>
          Cookies are small text files that are placed on your computer or mobile device when you visit our website.
          They help us provide you with a better experience by remembering your preferences and enabling certain
          functionality.
        </p>
      </section>

      <section>
        <h2 id="how">How we use cookies</h2>
        <p>We use cookies for the following purposes:</p>
        <div className="not-prose mt-4 grid gap-3 sm:grid-cols-2">
          {CATEGORIES.map((cat) => (
            <div
              key={cat.id}
              className="rounded-xl border border-black/[0.06] bg-white px-4 py-3.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="m-0 text-[14px] font-semibold text-ink">{cat.title}</p>
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                    cat.required
                      ? 'bg-finland/10 text-finland'
                      : 'bg-black/[0.04] text-ink-muted'
                  }`}
                >
                  {cat.required ? 'Always on' : 'Optional'}
                </span>
              </div>
              <p className="mt-1.5 m-0 text-[13px] leading-relaxed text-ink-muted">{cat.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4">{COOKIES_PREFERENCES_NOTE}</p>
      </section>

      <section>
        <h2 id="preferences">Preference center</h2>
        <div className="not-prose rounded-xl border border-black/[0.06] bg-white px-4 py-4 sm:px-5">
          <p className="m-0 text-[14px] font-semibold text-ink">How preferences work today</p>
          <p className="mt-2 m-0 text-[14px] leading-relaxed text-ink-muted">
            Traverion does not yet ship an in-app cookie preference center with toggles. We will not show decorative
            switches that pretend to control tracking that is not actually running.
          </p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14px] text-ink-muted">
            <li>Essential cookies stay required for account and checkout.</li>
            <li>
              Optional analytics or marketing tools, when enabled later, will respect browser controls and any consent
              UI we introduce.
            </li>
            <li>Use your browser settings now to block or delete non-essential cookies.</li>
          </ul>
        </div>
      </section>

      <section>
        <h2 id="managing">Managing cookies</h2>
        <p>You can control and manage cookies in several ways:</p>
        <ul>
          <li>Use your browser settings to block or delete cookies</li>
          <li>Opt out of analytics or marketing tools via the vendor&apos;s own controls when we enable them</li>
        </ul>
        <p>Blocking certain cookies may affect the functionality of our website.</p>
      </section>

      <section>
        <h2 id="third-party">Third-party tools &amp; retention</h2>
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
        <h2 id="contact">Contact us</h2>
        <p>If you have any questions about our use of cookies, please contact us:</p>
        <p>
          {/* Phase 1688: in-app Contact parity with Terms (mailto alone is a dead end on mobile). */}
          <a href="/contact" onClick={goContact}>
            Contact support
          </a>
          <br />
          Email: <a href="mailto:info@traverion.com">info@traverion.com</a>
          <br />
          Address: TRAVERION Travel Agency, Finland
        </p>
      </section>
    </LegalPageShell>
  );
}
