/** sessionStorage key — set before navigating to Contact for pre-filled subject/message */
export const CONTACT_PREFILL_KEY = 'traverion_contact_prefill';

export type ContactPrefillPayload = {
  subject: string;
  message: string;
  /** Drives DB `inquiry_type` and email subject prefix when the form is submitted */
  inquiry_type?: 'affiliate' | 'content_creator';
};

export const CONTACT_PRESETS: Record<'affiliate' | 'creator', ContactPrefillPayload> = {
  affiliate: {
    inquiry_type: 'affiliate',
    subject: 'Affiliate partnership inquiry',
    message:
      'I would like to learn more about the Traverion affiliate program.\n\n' +
      'My website or main channel:\n' +
      'Approx. monthly traffic or audience size:\n' +
      'Countries or topics I focus on:\n\n',
  },
  creator: {
    inquiry_type: 'content_creator',
    subject: 'Content creator collaboration',
    message:
      'I am interested in collaborating with Traverion as a content creator.\n\n' +
      'My channels (links):\n' +
      'Typical audience and engagement:\n' +
      'Destinations or travel styles I cover:\n\n',
  },
};

export function stashContactPrefill(payload: ContactPrefillPayload): void {
  try {
    sessionStorage.setItem(CONTACT_PREFILL_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function takeContactPrefill(): ContactPrefillPayload | null {
  try {
    const raw = sessionStorage.getItem(CONTACT_PREFILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(CONTACT_PREFILL_KEY);
    const parsed = JSON.parse(raw) as ContactPrefillPayload;
    if (parsed && typeof parsed.subject === 'string' && typeof parsed.message === 'string') {
      let inquiry_type = parsed.inquiry_type;
      if (inquiry_type !== 'affiliate' && inquiry_type !== 'content_creator') {
        const s = parsed.subject.toLowerCase();
        if (s.includes('affiliate')) inquiry_type = 'affiliate';
        else if (s.includes('content creator')) inquiry_type = 'content_creator';
      }
      return { ...parsed, inquiry_type };
    }
  } catch {
    /* ignore */
  }
  return null;
}
