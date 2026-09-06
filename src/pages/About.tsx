import LegalPageShell from '../components/LegalPageShell';

type AboutProps = {
  onNavigate?: (page: string) => void;
};

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
      <p>
        Traverion is a tours and activities platform where travelers can discover and book experiences worldwide, and
        where local providers can list and manage their offerings with tools designed for real-world operations — not
        just a pretty listing page.
      </p>
      <p>
        We are originally built in Finland, and that Nordic mindset shapes how we operate: clear communication, honest
        pricing, and high quality standards. Our mission is to help people find the best tours and holiday trips with
        confidence, while helping local operators reach global travelers fairly and sustainably.
      </p>

      <section>
        <h2>How we work</h2>
        <p>
          <strong>Trust.</strong> Straightforward descriptions, visible policies, and support that answers when plans
          change.
        </p>
        <p>
          <strong>Authenticity.</strong> We highlight local expertise and itineraries that respect culture and place.
        </p>
        <p>
          <strong>Care.</strong> From first search to confirmation, we want every step to feel calm and well explained.
        </p>
      </section>

      <p>
        We believe travel should feel exciting and simple from the first search to the final booking confirmation, with
        fair cancellation terms and responsive support along the way. Whether you are planning a multi-day route through
        Indochina or a single-day experience in one city, we work to surface options that match how you actually like to
        travel.
      </p>
      <p>
        For questions, partnerships, media, or supplier opportunities, visit our{' '}
        <a href="/contact" onClick={goContact}>
          Contact
        </a>{' '}
        page — we read every message.
      </p>
    </LegalPageShell>
  );
}
