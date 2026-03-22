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

## Trigger ideas

1. **Supabase Database Webhook** on `INSERT` into `contact_inquiries` → Edge Function → Resend API.
2. **Supabase Edge Function** called from the client after insert (less ideal: exposes keys unless proxied).

Use the row’s **`subject`** as-is for the outgoing Resend `subject` so it matches what you see in the database.
