# Contact form → email (Resend)

Submissions are stored in Supabase table **`contact_inquiries`**.

## Fields to use in Resend

| Column | Use as |
|--------|--------|
| **`subject`** | **Email `Subject` header** — use as-is (each flow has its own pattern) |
| `email` | Reply-To or To (your workflow) |
| `message` | Email body |
| `name`, `phone` | Body or metadata |
| **`inquiry_type`** | `general` · `affiliate` · `content_creator` — for routing or different templates |

## Subject line format (set by the app)

- **General contact:** `[Traverion · Contact] …`
- **Affiliate (`/affiliate` form):** `[Traverion · Affiliate] …` + their label
- **Content creator (`/content-creator` form):** **`New Content Creator Application`** — optional channel label **`[Traverion]`** (e.g. `New Content Creator Application — @mytravel [Traverion]`)

General **Contact** form (no separate subject field): subject is **`[Traverion · Contact] Contact form message`** (body is the message textarea only).

## Email to operations (`info@traverion.com`)

The app calls the Edge Function **`notify-contact-inquiry`** after each successful insert into `contact_inquiries`. Configure in Supabase (same project as other functions):

| Secret / env | Purpose |
|--------------|---------|
| `RESEND_API_KEY` | Required — same as supplier notification emails |
| `CONTACT_INQUIRY_TO` | Optional — defaults to **`info@traverion.com`** |
| `CONTACT_EMAIL_FROM` or `SUPPLIER_EMAIL_FROM` | From header (must be a verified domain in Resend) |

Deploy: `supabase functions deploy notify-contact-inquiry`  
CLI: `[functions.notify-contact-inquiry]` has `verify_jwt = false` so the public site can invoke it after form submit (Resend key stays server-side).

The outgoing email uses the row’s **`subject`** as-is and sets **Reply-To** to the submitter’s address.

## Other trigger ideas

1. **Supabase Database Webhook** on `INSERT` into `contact_inquiries` → duplicate or replace the client invoke (optional).
2. **Footer links** for affiliate and content creator point to **`https://www.traverion.com/affiliate`** and **`/content-creator`** (`VITE_SITE_URL` when set) so partner.traverion.com visitors land on the traveler site forms.
