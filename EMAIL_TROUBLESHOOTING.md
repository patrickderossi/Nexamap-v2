# Email Service Troubleshooting Guide

## Current Issue: Microsoft 365 Business Account Authentication

The contact and feedback forms are failing to send emails due to this error:
```
535 5.7.139 Authentication unsuccessful, user is locked by your organization's security defaults policy
```

**Root Cause**: `info@nexamap.com.au` is a Microsoft 365 business account with a custom domain. Microsoft 365 business accounts **do not support app passwords** by default and require **OAuth2 authentication** instead of basic SMTP authentication.

## Solutions (Choose Best Option)

### Solution 1: Set Up OAuth2 for Microsoft 365 (Recommended for Business Accounts)

#### Step 1: Register App in Azure AD
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to "Azure Active Directory" → "App registrations"
3. Click "New registration"
4. Name: "NexaMap Email Service"
5. Account types: "Accounts in this organizational directory only"
6. Redirect URI: Not needed for server-to-server
7. Click "Register"

#### Step 2: Configure API Permissions
1. In your new app, go to "API permissions"
2. Click "Add a permission" → "Microsoft Graph"
3. Choose "Application permissions"
4. Add: `Mail.Send`, `Mail.ReadWrite`
5. Click "Grant admin consent" (requires admin)

#### Step 3: Create Client Secret
1. Go to "Certificates & secrets"
2. Click "New client secret"
3. Description: "NexaMap SMTP"
4. Expiry: Choose appropriate duration
5. Copy the secret value (you won't see it again)

#### Step 4: Update Environment Variables
```bash
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_USER=info@nexamap.com.au
# Don't set SMTP_PASS for OAuth2
MICROSOFT_CLIENT_ID=your-application-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_TENANT_ID=your-tenant-id
EMAIL_FROM="NexaMap" <info@nexamap.com.au>
```

### Solution 2: Use Dedicated Email Service (Easiest - Recommended)

Instead of fighting with Microsoft's authentication, use a professional email service designed for applications:

#### SendGrid (Free tier: 100 emails/day)
1. Sign up at [SendGrid](https://sendgrid.com)
2. Create API key in Settings → API Keys
3. Set environment variables:
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
EMAIL_FROM="NexaMap" <info@nexamap.com.au>
```

#### Mailgun (Free tier: 5,000 emails/month)
1. Sign up at [Mailgun](https://mailgun.com)
2. Add your domain and verify
3. Get SMTP credentials from Settings → Domain Settings
```bash
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your-mailgun-password
EMAIL_FROM="NexaMap" <info@nexamap.com.au>
```

#### Amazon SES (Very cheap, $0.10 per 1,000 emails)
1. Set up AWS SES in AWS Console
2. Verify your domain
3. Create SMTP credentials
```bash
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USER=your-aws-access-key
SMTP_PASS=your-aws-secret-key
EMAIL_FROM="NexaMap" <info@nexamap.com.au>
```

### Solution 3: Switch to Gmail (Alternative)

#### Step 1: Enable 2-Factor Authentication
1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable 2-factor authentication if not already enabled

#### Step 2: Create App Password
1. Go to "Security" → "2-Step Verification" → "App passwords"
2. Select "Mail" and generate password
3. Copy the 16-character password

#### Step 3: Update Environment Variables
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-app-password
EMAIL_FROM="NexaMap" <your-email@gmail.com>
```

### Solution 4: Use Automatic Fallback (Already Implemented)

The system now includes an automatic fallback solution:

1. **Primary**: Tries to send via SMTP server
2. **Fallback**: If SMTP fails with authentication error, offers to open user's email client with pre-filled message
3. **Result**: User can send the email manually through their default email app

This works automatically - no configuration needed! Users will see a popup asking if they want to open their email client when SMTP fails.

### Solution 5: Use a Professional Email Service (Best for Production)

For production apps, consider using services like:
- **SendGrid** (Free tier: 100 emails/day)
- **Mailgun** (Free tier: 5,000 emails/month)
- **Amazon SES** (Very cheap, reliable)

#### SendGrid Example:
```bash
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
EMAIL_FROM="NexaMap" <noreply@yourdomain.com>
```

## Testing Your Email Configuration

### Method 1: Check Status Endpoint
Visit: `https://your-site.com/api/email/status`

This will show:
- Whether SMTP is configured
- Which email service is detected
- Configuration details (in development)

### Method 2: Check Server Logs
Look for these messages in your server logs:
- ✅ Email service connection verified successfully
- ❌ Email service connection verification failed
- 🔧 Detected Microsoft Outlook - using enhanced configuration

### Method 3: Test the Contact Form
1. Open your website
2. Fill out the contact form
3. Check browser console for errors
4. Check server logs for detailed error messages

## Security Best Practices

1. **Never use your main password** for SMTP - always use app passwords
2. **Use environment variables** for sensitive information
3. **Enable 2FA** on your email account
4. **Use dedicated email addresses** for your application (like noreply@yourdomain.com)

## Current Enhanced Configuration

The email service now includes:
- ✅ Enhanced Microsoft Outlook compatibility
- ✅ Automatic detection of email providers
- ✅ Better error messages and troubleshooting hints
- ✅ Fallback to test email service if SMTP fails
- ✅ Connection verification with helpful error messages

## Need Help?

If you're still having issues:
1. Check the server logs for detailed error messages
2. Try the `/api/email/status` endpoint to see configuration
3. Verify your environment variables are set correctly
4. Consider switching to a professional email service for production use

## Files Modified

The following files were enhanced to fix the email issue:
- `server/services/emailService.ts` - Enhanced SMTP configuration
- `server/routes/email.ts` - Already had proper error handling
- `client/components/ContactForm.tsx` - Working correctly
- `client/components/FeedbackModal.tsx` - Working correctly
- `client/lib/email-service.ts` - Working correctly
