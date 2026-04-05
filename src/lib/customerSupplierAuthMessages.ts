/** Copy for strict separation: traveler vs partner use different Supabase users (one email per account; same inbox via +aliases). */

export const SUPPLIER_ONLY_TRAVELER_SIGN_IN =
  'This login is for a Traverion partner account. Manage listings at the supplier portal. To book as a traveler, create a separate traveler account. With Gmail and many providers you can use an alias such as you+travel@gmail.com so mail still reaches the same inbox.';

export const TRAVELER_EMAIL_ALREADY_REGISTERED =
  'This email is already in use. If you have a traveler account, sign in. Partners sign in on the supplier portal. To hold both roles you need two accounts; many inboxes support +labels (e.g. you+partner@gmail.com).';

export const PARTNER_EMAIL_ALREADY_REGISTERED =
  'This email is already registered. If you use Traverion as a traveler, partner sign-up needs a different login — try an alias such as you+partner@gmail.com — or sign in here if you already have a supplier account.';
