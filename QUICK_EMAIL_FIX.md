# Quick Email Fix for NexaMap

## The Problem
Your contact and feedback forms aren't working because `info@nexamap.com.au` is a Microsoft 365 business account that requires OAuth2 authentication, not basic SMTP.

## Quick Solutions (Pick One)

### Option 1: Use SendGrid (Easiest - 5 minutes)
1. **Sign up**: Go to [SendGrid.com](https://sendgrid.com) (free tier gives 100 emails/day)
2. **Create API Key**: Settings → API Keys → Create API Key
3. **Update Environment Variables**:
   ```bash
   SMTP_HOST=smtp.sendgrid.net
   SMTP_PORT=587
   SMTP_USER=apikey
   SMTP_PASS=your-sendgrid-api-key-here
   EMAIL_FROM="NexaMap" <info@nexamap.com.au>
   ```
4. **Deploy** and test!

### Option 2: Use Mailgun (Alternative)
1. **Sign up**: Go to [Mailgun.com](https://mailgun.com) (free tier gives 5,000 emails/month)
2. **Get SMTP credentials**: Dashboard → Domain Settings → SMTP
3. **Update Environment Variables**:
   ```bash
   SMTP_HOST=smtp.mailgun.org
   SMTP_PORT=587
   SMTP_USER=postmaster@your-domain.mailgun.org
   SMTP_PASS=your-mailgun-password
   EMAIL_FROM="NexaMap" <info@nexamap.com.au>
   ```

### Option 3: Already Works! (Automatic Fallback)
The system now has automatic fallback:
- ✅ If SMTP fails, users get a popup asking if they want to use their email client
- ✅ Pre-fills the email with all the form data
- ✅ No configuration needed!

## How to Update Environment Variables

### If using Netlify:
1. Go to your Netlify dashboard
2. Site Settings → Environment Variables
3. Add the SMTP variables above

### If using Vercel:
1. Go to your Vercel dashboard  
2. Project Settings → Environment Variables
3. Add the SMTP variables above

### If using other hosting:
Update your `.env` file or hosting provider's environment variable settings.

## Test After Setup
1. **Deploy** your changes
2. **Visit** your contact form
3. **Submit** a test message
4. **Check** that you receive the email

## Current Status
- ✅ Contact form UI working
- ✅ Feedback form UI working  
- ✅ Server endpoints working
- �� Automatic fallback implemented
- ❌ SMTP authentication failing (Microsoft 365 business account)
- ✅ Ready for dedicated email service

## Need Help?
- Check `/api/email/status` on your site for configuration status
- See `EMAIL_TROUBLESHOOTING.md` for detailed OAuth2 setup (advanced)
- The automatic fallback will work immediately without any setup!
