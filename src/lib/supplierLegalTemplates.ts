/**
 * Default legal copy for suppliers on Traverion. Not legal advice — operators should review with counsel.
 * Use {{OPERATOR_NAME}} and {{BUSINESS_ADDRESS}} placeholders; replace before save.
 */

export function applyLegalPlaceholders(
  template: string,
  ctx: { operatorName: string; businessAddress?: string }
): string {
  const name = ctx.operatorName.trim() || 'the operator';
  const addr = (ctx.businessAddress ?? '').trim() || '[your business address]';
  return template.replace(/\{\{OPERATOR_NAME\}\}/g, name).replace(/\{\{BUSINESS_ADDRESS\}\}/g, addr);
}

export function defaultPrivacyPolicyTemplate(): string {
  return `PRIVACY POLICY

Data controller: {{OPERATOR_NAME}}, {{BUSINESS_ADDRESS}}.

This privacy policy describes how we collect, use, and protect personal data when you book or enquire about experiences offered by {{OPERATOR_NAME}} through Traverion or related channels.

1. Who we are
{{OPERATOR_NAME}} (“we”, “us”) is responsible for the experience you book. Traverion may process data on our behalf as a technology platform as described in their policies.

2. Data we collect
• Identity and contact details you provide (name, email, phone).
• Booking details (dates, party size, special requests).
• Communications with us relating to your booking.
• Where applicable, payment-related information as handled by our payment partners (we do not store full card numbers on our own systems).

3. Purposes and legal bases
We use your data to perform the contract (provide the tour or activity), respond to enquiries, manage safety and logistics, comply with legal obligations, and, where allowed, improve our services. Where required, we rely on consent for optional marketing.

4. Sharing
We may share data with Traverion as platform provider, with guides or subcontractors strictly as needed to deliver the service, and with authorities where required by law.

5. Retention
We keep booking and contact data as long as necessary for the purposes above and to meet accounting, tax, and dispute resolution needs.

6. Your rights
Depending on your location, you may have rights to access, rectify, erase, restrict processing, object, and data portability. Contact us at the details below. You may also lodge a complaint with your local supervisory authority.

7. International transfers
If data is processed outside your country, we ensure appropriate safeguards where required.

8. Contact
For privacy questions, contact {{OPERATOR_NAME}} at the address above or via the contact details provided in your booking confirmation.

Last updated: {{DATE}}`;
}

export function defaultTermsConditionsTemplate(): string {
  return `TERMS & CONDITIONS

These terms govern bookings for experiences offered by {{OPERATOR_NAME}} (“Operator”, “we”, “us”) when you book via Traverion or as otherwise agreed in writing.

1. Contract
Your contract for the experience is with {{OPERATOR_NAME}}. Traverion provides the booking platform; platform terms may also apply separately.

2. Booking and payment
A booking is confirmed only when we confirm it (or when the platform confirms it on our behalf) and any required payment is authorised or received as stated at checkout. Prices are as shown at the time of booking unless we notify you otherwise.

3. Changes and cancellations
Cancellation and change rules are those shown on the listing at booking (e.g. free cancellation windows) unless we agree otherwise in writing. We may cancel for safety, force majeure, minimum numbers not met, or operational reasons; in such cases we will offer a reschedule or refund as applicable law and our stated policy require.

4. Participant responsibilities
You must arrive on time, follow safety instructions, and disclose health or mobility limitations that affect participation. We may refuse participation without refund if behaviour is unsafe or disruptive.

5. Liability
To the maximum extent permitted by law, our liability is limited as set out under applicable consumer law. We are not liable for indirect or consequential loss except where such limitation is not allowed.

6. Insurance
Where we maintain liability or other insurance, details are available on request and do not extend your rights beyond what the law provides.

7. Complaints
Contact us first using the details in your confirmation. If unresolved, you may use any dispute resolution or complaint mechanisms available in your jurisdiction.

8. Law
These terms are governed by the laws applicable to {{OPERATOR_NAME}}’s establishment, without prejudice to mandatory consumer protections in your country of residence where they cannot be waived.

9. Contact
{{OPERATOR_NAME}}, {{BUSINESS_ADDRESS}}.

Last updated: {{DATE}}`;
}

/** Inserts current ISO date for {{DATE}} placeholder. */
export function applyLegalDate(template: string): string {
  const d = new Date();
  const dateStr = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  return template.replace(/\{\{DATE\}\}/g, dateStr);
}
