/**
 * Google sign-in is intentionally off until the Supabase Google provider is configured.
 * Do not present the button as working before that.
 *
 * To enable later:
 * 1. Create a Google Cloud OAuth web client.
 * 2. Set the authorized redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`.
 * 3. In Supabase Auth → Providers → Google, paste the client id and secret.
 * 4. Add the public site origin and local dev origin (`http://127.0.0.1:5173`) to the
 *    Supabase redirect allow list.
 * 5. Set `GOOGLE_AUTH_ENABLED` to true and call
 *    `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })`
 *    with a same-origin redirect that returns the traveler to the page they left.
 */
export const GOOGLE_AUTH_ENABLED = false;
