# 🚀 TRAVERION Deployment Guide

## Quick Deploy to Vercel

### Option 1: GitHub Integration (Recommended)

1. **Push to GitHub:**
   ```bash
   git add .
   git commit -m "Initial commit - TRAVERION travel website"
   git push origin main
   ```

2. **Connect to Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Sign in with GitHub
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will auto-detect Vite framework
   - Click "Deploy"

3. **Custom Domain (Optional):**
   - In Vercel dashboard, go to Project Settings
   - Add your custom domain
   - Update DNS records as instructed

### Option 2: Vercel CLI

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Deploy:**
   ```bash
   vercel
   ```

3. **Follow prompts:**
   - Link to existing project or create new
   - Set up project settings
   - Deploy!

## 🔧 Pre-Deployment Checklist

### ✅ All Pages Created
- [x] Home page
- [x] Packages page  
- [x] About page
- [x] Contact page
- [x] Blog page
- [x] All 6 tour pages:
  - [x] Vietnam 9-Day
  - [x] Thailand 10-Day  
  - [x] Vietnam 12-Day
  - [x] Cambodia 10-Day
  - [x] Indochina 14-Day
  - [x] Thailand & Vietnam 14-Day

### ✅ Configuration Files
- [x] `vercel.json` - Vercel configuration
- [x] `.gitignore` - Git ignore rules
- [x] `README.md` - Project documentation
- [x] `package.json` - Updated with project info

### ✅ Build Configuration
- [x] Vite build setup
- [x] TypeScript configuration
- [x] Tailwind CSS setup
- [x] ESLint configuration

## 🌐 Environment Variables

### Vercel (frontend)
Set these in Vercel Project Settings -> Environment Variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SITE_URL` (recommended, e.g. `https://traverion.com`)

### Supabase Edge Functions (supplier email notifications)
Set these with Supabase function secrets:

- `RESEND_API_KEY`
- `SUPPLIER_EMAIL_FROM`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Without these, supplier notification functions (`notify-supplier-event`, `send-supplier-message`) will not send emails.

## 📱 Production Features

### ✅ Responsive Design
- Mobile-first approach
- Tablet optimization
- Desktop enhancement
- Touch-friendly interactions

### ✅ Performance
- Vite build optimization
- Asset compression
- Lazy loading
- Fast loading times

### ✅ SEO Ready
- Meta tags
- Open Graph tags
- Structured data
- Sitemap ready

## 🔍 Post-Deployment

### 1. Test All Pages
- [ ] Home page loads correctly
- [ ] All tour pages accessible
- [ ] Navigation works
- [ ] Forms submit properly
- [ ] Mobile responsive

### 2. Performance Check
- [ ] Page load speeds
- [ ] Image optimization
- [ ] Core Web Vitals
- [ ] Mobile performance

### 3. SEO Setup
- [ ] Google Analytics (if needed)
- [ ] Google Search Console
- [ ] Meta descriptions
- [ ] Alt tags for images

## 🛠️ Custom Domain Setup

1. **In Vercel Dashboard:**
   - Go to Project Settings
   - Click "Domains"
   - Add your domain
   - Follow DNS instructions

2. **DNS Configuration:**
   ```
   Type: CNAME
   Name: www
   Value: cname.vercel-dns.com
   
   Type: A
   Name: @
   Value: 76.76.19.61
   ```

## 📊 Analytics Setup (Optional)

### Google Analytics
1. Create GA4 property
2. Add tracking code to `index.html`
3. Set up conversion tracking

### Vercel Analytics
1. Enable in Vercel dashboard
2. Add to project settings
3. Monitor performance

## 🔄 Continuous Deployment

Once connected to GitHub:
- Every push to `main` branch auto-deploys
- Preview deployments for pull requests
- Automatic HTTPS certificates
- Global CDN distribution

## 🆘 Troubleshooting

### Build Errors
```bash
npm run build
npm run preview
```

### TypeScript Errors
```bash
npm run typecheck
```

### Linting Issues
```bash
npm run lint
```

## 📞 Support

- **Email**: info@traverion.com
- **Phone**: +358 45 8803060
- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)

---

**Ready to deploy TRAVERION to the world! 🌍✈️**
