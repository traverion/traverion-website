# 🗄️ Supabase Setup Guide for TRAVERION

## Quick Setup Steps

### 1. Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Sign up/Login with GitHub
3. Click "New Project"
4. Choose organization and enter project details:
   - **Name**: `traverion-travel`
   - **Database Password**: Generate a strong password
   - **Region**: Choose closest to your users
5. Click "Create new project"

### 2. Get API Credentials
1. In your Supabase dashboard, go to **Settings > API**
2. Copy the following:
   - **Project URL** (looks like: `https://abcdefghijklmnop.supabase.co`)
   - **anon/public key** (starts with `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`)

### 3. Set Up Environment Variables
1. Create `.env.local` file in your project root:
```bash
cp env.example .env.local
```

2. Edit `.env.local` with your credentials:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Create Database Tables
1. In Supabase dashboard, go to **SQL Editor**
2. Copy the contents of `supabase-schema.sql`
3. Paste and run the SQL commands
4. This creates:
   - `bookings` table for tour bookings
   - `contact_inquiries` table for contact form submissions
   - Proper indexes and security policies

### 5. Test the Integration
1. Start your dev server: `npm run dev`
2. Go to any tour page and try the booking form
3. Go to contact page and try the contact form
4. Check Supabase dashboard > Table Editor to see submitted data

## Database Schema

### Bookings Table
- Stores tour booking requests
- Includes customer info, tour details, preferences
- Status tracking (pending, confirmed, cancelled)

### Contact Inquiries Table  
- Stores general contact form submissions
- Categorizes inquiries (general, booking, support)
- Status tracking (new, in_progress, resolved)

## Security Features
- **Row Level Security (RLS)** enabled
- Public can insert bookings/inquiries
- Users can only read their own submissions
- Automatic timestamp updates

## Admin Dashboard Integration
The admin dashboard can now:
- View all bookings and inquiries
- Update status of submissions
- Track customer communications
- Export data for analysis

## Production Deployment
1. Add environment variables to Vercel:
   - Go to Vercel dashboard > Project Settings > Environment Variables
   - Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
2. Redeploy your site
3. Test forms in production

### Authentication redirect URLs (required for sign-up, email confirm, password reset)

In Supabase dashboard go to **Authentication → URL configuration** and add these **Redirect URLs** (wildcards `**` match query strings and hash tokens):

**Traveler site (www / apex)**
- `https://www.traverion.com/log-in**`
- `https://www.traverion.com/sign-up**`
- `https://www.traverion.com/set-password**`
- `https://www.traverion.com/email-confirmed**`
- `https://traverion.com/log-in**` (if you use apex)
- `https://traverion.com/set-password**`
- `https://www.traverion.com/reset-password**` (legacy — redirects to `/set-password`)
- `https://www.traverion.com/account/reset-password**` (legacy — redirects to `/set-password`)

**Partner portal**
- `https://partner.traverion.com/login**`
- `https://partner.traverion.com/reset-password**`
- `https://partner.traverion.com/email-verified**`
- `https://partner.traverion.com/partner**`

**Local dev**
- `http://localhost:5173/log-in**`
- `http://localhost:5173/set-password**`
- `http://localhost:5173/login**`

Traveler password reset emails redirect to `/set-password` on www. Partner reset emails use `/reset-password` on `partner.traverion.com`. Each page verifies the one-time recovery session (PKCE `?code=` or hash tokens) before showing **Set a new password**. After updating, the user is signed out and sent back to sign-in.

**Site URL** in Supabase can stay as your main marketing origin (e.g. `https://www.traverion.com`); the app redirects recovery links that land on `/log-in` or legacy reset paths to `/set-password` automatically.

**If reset links hang on “Verifying…”:** add `https://www.traverion.com/set-password**` to Redirect URLs, then request a **new** reset email (old links keep the old `redirect_to`).

## Troubleshooting

### Common Issues:
- **"Invalid API key"**: Check your environment variables
- **"Table doesn't exist"**: Run the SQL schema first
- **"Permission denied"**: Check RLS policies are set correctly

### Debug Steps:
1. Check browser console for errors
2. Verify environment variables are loaded
3. Test database connection in Supabase dashboard
4. Check RLS policies in Supabase > Authentication > Policies

## Next Steps
- Set up email notifications for new bookings
- Add real-time updates for admin dashboard
- Implement user authentication for customer accounts
- Add payment processing integration

---

**Your TRAVERION site now has a fully functional backend! 🚀**

