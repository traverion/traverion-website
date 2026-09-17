import { Shield, MapPin, HeartHandshake } from 'lucide-react';
import LegalPageShell from '../components/LegalPageShell';
import NoticeCallout from '../components/NoticeCallout';

type AboutProps = {
  onNavigate?: (page: string) => void;
};

const VALUES = [
  {
    icon: Shield,
    title: 'Trust',
    body: 'Straightforward descriptions, visible policies, and support that answers when plans change.',
  },
  {
    icon: MapPin,
    title: 'Authenticity',
    body: 'We highlight local expertise and itineraries that respect culture and place.',
  },
  {
    icon: HeartHandshake,
    title: 'Care',
    body: 'From first search to confirmation, we want every step to feel calm and well explained.',
  },
] as const;

export default function About({ onNavigate }: AboutProps) {
  const goContact = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onNavigate) {
      e.preventDefault();
      onNavigate('contact');
    }
  };

  return (
    <LegalPageShell
      title="About Traverion"
      subtitle="A Finland-rooted team building a clearer way to book tours — for travelers and for operators who deserve a global stage."
      onNavigate={onNavigate}
    >
      <div className="mb-8 rounded-2xl bg-finland/8 px-4 py-3 sm:px-5 sm:py-4 ring-1 ring-finland/15">
        <p className="text-sm sm:text-base text-ink leading-relaxed m-0">
          Traverion is a tours marketplace where travelers discover and book worldwide, and where local operators list
          and manage offerings with tools built for real operations — not just a pretty listing page.
        </p>
      </div>

      <p>
        We are originally built in Finland, and that Nordic mindset shapes how we operate: clear communication, honest
        pricing, and high quality standards. Our mission is to help people find the best tours and holiday trips with
        confidence, while helping local operators reach global travelers fairly and sustainably.
      </p>

      <section className="!mt-10">
        <h2 className="!mb-4">How we work</h2>
        <div className="grid gap-3 sm:grid-cols-3 not-prose">
          {VALUES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-2xl bg-paper-raised p-4 sm:p-5 shadow-soft ring-1 ring-black/[0.06]"
            >
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-finland/10 text-finland">
                <Icon className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="font-sans text-base font-semibold text-ink mb-1.5">{title}</h3>
              <p className="text-sm text-ink-muted leading-relaxed m-0">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <p>
        We believe travel should feel exciting and simple from the first search to the final booking confirmation, with
        fair cancellation terms and responsive support along the way. Whether you are planning a multi-day route through
        Indochina or a single-day experience in one city, we work to surface options that match how you actually like to
        travel.
      </p>

      <div className="not-prose mt-8">
        <NoticeCallout
          title="Questions or partnerships"
          tone="info"
          action={
            <a href="/contact" onClick={goContact} className="tv-btn-primary inline-flex text-sm">
              Contact us
            </a>
          }
        >
          For media, supplier opportunities, or anything else — we read every message on Contact.
        </NoticeCallout>
      </div>
    </LegalPageShell>
  );
}
