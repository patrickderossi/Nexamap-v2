import nodemailer from "nodemailer";
import sanitizeHtml from "sanitize-html";

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
}

// HTML sanitization options for email content
const emailSanitizeOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "ol",
    "ul",
    "li",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
  ],
  allowedAttributes: {},
  allowedIframeHostnames: [],
  disallowedTagsMode: "escape",
};

// Helper function to sanitize and escape HTML content
function sanitizeContent(content: string): string {
  if (!content) return "";
  // First sanitize any HTML tags
  const sanitized = sanitizeHtml(content, emailSanitizeOptions);
  // Then escape any remaining special characters for safe HTML insertion
  return sanitized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    // Check if we have SMTP configuration
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpHost && smtpUser && smtpPass) {
      // Enhanced SMTP configuration with better Microsoft Outlook support
      const transportConfig: any = {
        host: smtpHost,
        port: parseInt(smtpPort || "587"),
        secure: parseInt(smtpPort || "587") === 465, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        tls: {
          minVersion: 'TLSv1.2',
        },
        // Connection timeout and retry options
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
      };

      // Special configuration for different email providers
      if (smtpHost.includes('outlook.com') || smtpHost.includes('hotmail.com') || smtpHost.includes('live.com')) {
        console.log("🔧 Detected Microsoft Outlook - checking account type...");

        // Check if this is a business account (custom domain) or personal account
        const isBusinessAccount = smtpUser && !smtpUser.includes('@outlook.com') && !smtpUser.includes('@hotmail.com') && !smtpUser.includes('@live.com');

        if (isBusinessAccount) {
          console.log("🏢 Microsoft 365 Business Account detected");
          console.log("⚠️  IMPORTANT: Business accounts require OAuth2 authentication");
          console.log("   Basic SMTP auth may fail due to security policies");

          // Check for OAuth2 configuration
          const clientId = process.env.MICROSOFT_CLIENT_ID;
          const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
          const tenantId = process.env.MICROSOFT_TENANT_ID;

          if (clientId && clientSecret && tenantId) {
            console.log("✅ OAuth2 credentials found - using Modern Authentication");
            transportConfig.auth = {
              type: 'OAuth2',
              user: smtpUser,
              clientId: clientId,
              clientSecret: clientSecret,
              refreshToken: process.env.MICROSOFT_REFRESH_TOKEN,
              accessToken: process.env.MICROSOFT_ACCESS_TOKEN,
            };
          } else {
            console.log("❌ No OAuth2 credentials found");
            console.log("💡 Solutions:");
            console.log("   1. Set up OAuth2 in Azure AD (recommended)");
            console.log("   2. Use a dedicated SMTP service (SendGrid, Mailgun)");
            console.log("   3. Enable legacy auth in Microsoft 365 Admin (not recommended)");
          }
        } else {
          console.log("👤 Personal Microsoft account detected");
          console.log("⚠️  For personal accounts, enable 2FA and use App Password");
        }

        transportConfig.tls = {
          minVersion: 'TLSv1.2',
        };
        transportConfig.requireTLS = true;
      } else if (smtpHost.includes('gmail.com')) {
        console.log("🔧 Detected Gmail - using secure configuration");
        transportConfig.service = 'gmail';
        transportConfig.tls = {
          minVersion: 'TLSv1.2',
        };
      }

      try {
        this.transporter = nodemailer.createTransport(transportConfig);
        console.log("✅ Email service initialized with SMTP configuration");

        // Test the connection immediately
        this.verifyConnectionAsync();
      } catch (error) {
        console.error("❌ Failed to create SMTP transporter:", error);
        console.log("🔄 Falling back to test email service...");
        this.createTestAccount();
      }
    } else {
      console.log("⚠️  No SMTP configuration found - using test email service");
      console.log("   Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables for production");
      // Use ethereal email for testing (creates fake accounts)
      this.createTestAccount();
    }
  }

  private async createTestAccount() {
    try {
      // Create a test account with Ethereal
      const testAccount = await nodemailer.createTestAccount();

      this.transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });

      console.log("📧 Email service initialized with test account:");
      console.log(`   User: ${testAccount.user}`);
      console.log(`   Pass: ${testAccount.pass}`);
      console.log("   Emails will be captured at: https://ethereal.email/");
    } catch (error) {
      console.error("❌ Failed to create test email account:", error);
    }
  }

  async sendEmail(options: EmailOptions): Promise<{
    success: boolean;
    messageId?: string;
    previewUrl?: string;
    error?: string;
  }> {
    if (!this.transporter) {
      return {
        success: false,
        error: "Email service not initialized",
      };
    }

    try {
      const mailOptions = {
        from:
          options.from ||
          process.env.EMAIL_FROM ||
          '"Nexamap" <noreply@nexamap.com.au>',
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      const info = await this.transporter.sendMail(mailOptions);

      // Get preview URL for test emails
      const previewUrl = nodemailer.getTestMessageUrl(info);

      if (previewUrl) {
        console.log("📧 Test email sent! Preview at:", previewUrl);
      }

      return {
        success: true,
        messageId: info.messageId,
        previewUrl: previewUrl || undefined,
      };
    } catch (error) {
      console.error("❌ Failed to send email:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // Template methods for different email types
  async sendFeedbackEmail(feedbackData: {
    type: string;
    title: string;
    feedback: string;
    email?: string;
    context?: string;
  }) {
    // Sanitize all user inputs
    const sanitizedType = sanitizeContent(feedbackData.type);
    const sanitizedTitle = sanitizeContent(feedbackData.title);
    const sanitizedFeedback = sanitizeContent(feedbackData.feedback);
    const sanitizedEmail = feedbackData.email
      ? sanitizeContent(feedbackData.email)
      : "Not provided";
    const sanitizedContext = feedbackData.context
      ? sanitizeContent(feedbackData.context)
      : "";

    const subject = `Nexamap Beta Feedback: ${sanitizedTitle}`;

    const text = `
New feedback received from Nexamap Beta user:

Type: ${sanitizedType}
Title: ${sanitizedTitle}

User Email: ${sanitizedEmail}

Feedback:
${sanitizedFeedback}

${sanitizedContext ? `Context Information:\n${sanitizedContext}` : ""}

---
Sent from Nexamap Beta Feedback System
Timestamp: ${new Date().toISOString()}
    `.trim();

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0891b2;">New Beta Feedback Received</h2>

        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Type:</strong> ${sanitizedType}</p>
          <p><strong>Title:</strong> ${sanitizedTitle}</p>
          <p><strong>User Email:</strong> ${sanitizedEmail}</p>
        </div>

        <div style="margin: 20px 0;">
          <h3>Feedback:</h3>
          <p style="white-space: pre-wrap;">${sanitizedFeedback}</p>
        </div>

        ${
          sanitizedContext
            ? `
          <div style="margin: 20px 0;">
            <h3>Context Information:</h3>
            <p style="white-space: pre-wrap;">${sanitizedContext}</p>
          </div>
        `
            : ""
        }

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;">
        <p style="color: #64748b; font-size: 12px;">
          Sent from Nexamap Beta Feedback System<br>
          ${new Date().toISOString()}
        </p>
      </div>
    `;

    return this.sendEmail({
      to: "info@nexamap.com.au",
      subject,
      text,
      html,
    });
  }

  async sendContactEmail(contactData: {
    name: string;
    email: string;
    company?: string;
    message: string;
  }) {
    // Sanitize all user inputs
    const sanitizedName = sanitizeContent(contactData.name);
    const sanitizedEmail = sanitizeContent(contactData.email);
    const sanitizedCompany = contactData.company
      ? sanitizeContent(contactData.company)
      : "Not provided";
    const sanitizedMessage = sanitizeContent(contactData.message);

    const subject = `Contact Form Submission from ${sanitizedName}`;

    const text = `
New contact form submission from Nexamap website:

Name: ${sanitizedName}
Email: ${sanitizedEmail}
Company: ${sanitizedCompany}

Message:
${sanitizedMessage}

---
Sent from Nexamap Contact Form
Timestamp: ${new Date().toISOString()}
    `.trim();

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0891b2;">New Contact Form Submission</h2>

        <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Name:</strong> ${sanitizedName}</p>
          <p><strong>Email:</strong> ${sanitizedEmail}</p>
          <p><strong>Company:</strong> ${sanitizedCompany}</p>
        </div>

        <div style="margin: 20px 0;">
          <h3>Message:</h3>
          <p style="white-space: pre-wrap;">${sanitizedMessage}</p>
        </div>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;">
        <p style="color: #64748b; font-size: 12px;">
          Sent from Nexamap Contact Form<br>
          ${new Date().toISOString()}
        </p>
      </div>
    `;

    return this.sendEmail({
      to: "info@nexamap.com.au",
      subject,
      text,
      html,
    });
  }

  async sendWelcomeEmail(userEmail: string, userName: string) {
    // Sanitize user inputs
    const sanitizedUserName = sanitizeContent(userName);
    const sanitizedUserEmail = sanitizeContent(userEmail);

    const subject = "Welcome to Nexamap Open Beta!";

    const text = `
Hi ${sanitizedUserName},

Welcome to Nexamap Open Beta! Thank you for joining our beta program.

We're excited to have you test our advanced property analysis and subdivision planning platform for Western Australia.

Getting Started:
- Search for any WA property to see comprehensive land data
- Try the subdivision analysis tool for lot yield calculations
- Use the feedback button to share your thoughts

Your feedback is invaluable in helping us build the best property analysis tool for WA professionals.

Best regards,
The Nexamap Team

---
This email was sent because you signed up for Nexamap Open Beta.
    `.trim();

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="text-align: center; margin: 30px 0;">
          <img src="https://cdn.builder.io/api/v1/image/assets%2F0df748b9b86d4bc5af1be6fda4f6f0d0%2F9fbd34283535421db2163a3b996c4e11?format=webp&width=800"
               alt="Nexamap" style="height: 60px;">
        </div>

        <h1 style="color: #0891b2; text-align: center;">Welcome to Nexamap Open Beta!</h1>

        <p>Hi ${sanitizedUserName},</p>

        <p>Thank you for joining our beta program! We're excited to have you test our advanced property analysis and subdivision planning platform for Western Australia.</p>

        <div style="background-color: #f1f5f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #334155; margin-top: 0;">Getting Started:</h3>
          <ul style="color: #475569;">
            <li>Search for any WA property to see comprehensive land data</li>
            <li>Try the subdivision analysis tool for lot yield calculations</li>
            <li>Use the feedback button to share your thoughts</li>
          </ul>
        </div>

        <p>Your feedback is invaluable in helping us build the best property analysis tool for WA professionals.</p>

        <p>Best regards,<br>
        <strong>The Nexamap Team</strong></p>

        <hr style="margin: 30px 0; border: none; border-top: 1px solid #e2e8f0;">
        <p style="color: #64748b; font-size: 12px; text-align: center;">
          This email was sent because you signed up for Nexamap Open Beta.
        </p>
      </div>
    `;

    return this.sendEmail({
      to: userEmail,
      subject,
      text,
      html,
    });
  }

  // Async verification without blocking initialization
  private async verifyConnectionAsync(): Promise<void> {
    setTimeout(async () => {
      try {
        if (this.transporter) {
          await this.transporter.verify();
          console.log("✅ Email service connection verified successfully");
        }
      } catch (error) {
        console.error("❌ Email service connection verification failed:", error);
        if (error instanceof Error && error.message.includes('535')) {
          console.log("💡 SMTP Authentication Issue - Try these solutions:");

          const smtpUser = process.env.SMTP_USER;
          const isBusinessAccount = smtpUser && !smtpUser.includes('@outlook.com') && !smtpUser.includes('@hotmail.com') && !smtpUser.includes('@live.com');

          if (isBusinessAccount) {
            console.log("📧 Microsoft 365 Business Account Solutions:");
            console.log("   1. Set up OAuth2 in Azure AD (recommended)");
            console.log("      - Register app in Azure AD");
            console.log("      - Add Mail.Send permissions");
            console.log("      - Set MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_TENANT_ID");
            console.log("   2. Use dedicated SMTP service (SendGrid, Mailgun, Amazon SES)");
            console.log("   3. Ask admin to enable legacy authentication (not recommended)");
          } else {
            console.log("👤 Personal Account Solutions:");
            console.log("   1. Enable 2FA and use App Password");
            console.log("   2. Check if SMTP authentication is enabled");
          }
          console.log("   4. Alternative: Use contact form with mailto: links");
        }
      }
    }, 2000); // Verify after 2 seconds
  }

  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }

    try {
      await this.transporter.verify();
      console.log("✅ Email service connection verified");
      return true;
    } catch (error) {
      console.error("❌ Email service connection failed:", error);
      return false;
    }
  }

  // Check email configuration status
  async checkConfiguration(): Promise<{
    configured: boolean;
    service: string;
    from: string;
    smtpHost?: string;
    smtpPort?: string;
    smtpSecure?: boolean;
  }> {
    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const emailFrom = process.env.EMAIL_FROM || '"Nexamap" <noreply@nexamap.com.au>';

    const hasSmtpConfig = !!(smtpHost && smtpUser && smtpPass);

    let service = "Not configured";
    if (hasSmtpConfig) {
      if (smtpHost.includes('outlook.com') || smtpHost.includes('hotmail.com') || smtpHost.includes('live.com')) {
        service = "Microsoft Outlook";
      } else if (smtpHost.includes('gmail.com')) {
        service = "Gmail";
      } else {
        service = "Custom SMTP";
      }
    } else {
      service = "Ethereal (Test)";
    }

    return {
      configured: hasSmtpConfig,
      service,
      from: emailFrom,
      smtpHost: hasSmtpConfig ? smtpHost : undefined,
      smtpPort: hasSmtpConfig ? smtpPort : undefined,
      smtpSecure: hasSmtpConfig ? parseInt(smtpPort || "587") === 465 : undefined,
    };
  }
}

// Export singleton instance
export const emailService = new EmailService();
