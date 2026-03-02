import { devLog } from "./logger";

interface FeedbackData {
  type: "lot-data" | "map-layers" | "analysis-tools";
  title: string;
  feedback: string;
  email?: string;
  context?: string;
}

interface ContactData {
  name: string;
  email: string;
  company?: string;
  message: string;
}

export async function sendFeedbackEmail(data: FeedbackData): Promise<void> {
  try {
    // Send feedback via backend API
    const response = await fetch("/api/email/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: data.type,
        title: data.title,
        feedback: data.feedback,
        email: data.email,
        context: data.context,
      }),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));

      // If SMTP authentication fails, offer mailto fallback
      if (errorData.message && errorData.message.includes('535')) {
        devLog.log("🔄 SMTP failed, offering mailto fallback...");
        const mailtoLink = createMailtoLink(data);

        // Ask user if they want to open their email client
        const useMailto = window.confirm(
          "Email server authentication failed. Would you like to open your email client to send the feedback manually?"
        );

        if (useMailto) {
          window.open(mailtoLink, '_blank');
          return; // Success via mailto
        }
      }

      throw new Error(
        errorData.message || errorData.error || "Failed to send feedback",
      );
    }

    const result = await response.json();
    devLog.log("✅ Feedback sent successfully:", result);

    if (result.previewUrl) {
      devLog.log("📧 Email preview:", result.previewUrl);
    }
  } catch (error) {
    console.error("❌ Failed to send feedback email:", error);
    throw new Error(
      error instanceof Error
        ? error.message
        : "Failed to send feedback. Please try again.",
    );
  }
}

export async function sendContactEmail(data: ContactData): Promise<void> {
  try {
    // Send contact form via backend API
    const response = await fetch("/api/email/contact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: data.name,
        email: data.email,
        company: data.company || "",
        message: data.message,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();

      // If SMTP authentication fails, offer mailto fallback
      if (errorData.message && errorData.message.includes('535')) {
        devLog.log("🔄 SMTP failed, offering mailto fallback...");
        const mailtoLink = createContactMailtoLink(data);

        // Ask user if they want to open their email client
        const useMailto = window.confirm(
          "Email server authentication failed. Would you like to open your email client to send the message manually?"
        );

        if (useMailto) {
          window.open(mailtoLink, '_blank');
          return; // Success via mailto
        }
      }

      throw new Error(
        errorData.message || errorData.error || "Failed to send contact form",
      );
    }

    const result = await response.json();
    devLog.log("✅ Contact form sent successfully:", result);
  } catch (error) {
    console.error("❌ Failed to send contact form:", error);
    throw new Error(
      error instanceof Error
        ? error.message
        : "Failed to send contact form. Please try again.",
    );
  }
}

// Alternative: Create a mailto: link for user's default email client
export function createMailtoLink(data: FeedbackData): string {
  const subject = encodeURIComponent(`Nexamap Beta Feedback: ${data.title}`);
  const body = encodeURIComponent(
    `
Type: ${data.type}
Title: ${data.title}

Feedback:
${data.feedback}

${data.context ? `Context Information:\n${data.context}` : ""}

---
From: ${data.email || "Beta User"}
Sent: ${new Date().toISOString()}
  `.trim(),
  );

  return `mailto:info@nexamap.com.au?subject=${subject}&body=${body}`;
}

// Create mailto link for contact form
export function createContactMailtoLink(data: ContactData): string {
  const subject = encodeURIComponent(`Contact Form: ${data.name}`);
  const body = encodeURIComponent(
    `
Name: ${data.name}
Email: ${data.email}
Company: ${data.company || "Not provided"}

Message:
${data.message}

---
Sent from NexaMap Contact Form
Date: ${new Date().toISOString()}
  `.trim(),
  );

  return `mailto:info@nexamap.com.au?subject=${subject}&body=${body}`;
}

// Send welcome email to new user
export async function sendWelcomeEmail(userName: string): Promise<void> {
  try {
    const authToken = await getAuthToken();

    if (!authToken) {
      devLog.warn("⚠️ No auth token available for welcome email, skipping...");
      return;
    }

    const response = await fetch("/api/email/welcome", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        userName,
      }),
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        // If JSON parsing fails, create error object without reading text again
        errorData = {
          error: `HTTP ${response.status}`,
          message: response.statusText || "Unknown error",
        };
      }
      console.error(`❌ Welcome email failed (${response.status}):`, errorData);
      return;
    }

    const result = await response.json();
    devLog.log("✅ Welcome email sent successfully:", result);

    if (result.previewUrl) {
      devLog.log("📧 Email preview:", result.previewUrl);
    }
  } catch (error) {
    console.error("❌ Failed to send welcome email:", error);
    // Don't throw error for welcome email - it's not critical
  }
}

export async function sendWelcomeEmailForSignup(
  userEmail: string,
  userName: string,
): Promise<void> {
  try {
    const token = await getAuthToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch("/api/email/welcome", {
      method: "POST",
      headers,
      body: JSON.stringify({ userEmail, userName }),
    });

    if (!response.ok) {
      devLog.warn(`⚠️ Welcome email failed during signup (${response.status})`);
      return;
    }

    const result = await response.json();
    devLog.log("✅ Welcome email sent successfully during signup:", result);

    if (result.previewUrl) {
      devLog.log("📧 Email preview:", result.previewUrl);
    }
  } catch (error) {
    console.error("❌ Failed to send welcome email during signup:", error);
  }
}

// Test email functionality
export async function sendTestEmail(
  to: string,
  subject: string,
  message: string,
): Promise<void> {
  try {
    const response = await fetch("/api/email/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to,
        subject,
        message,
      }),
    });

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = {
          error: `HTTP ${response.status}`,
          message: response.statusText || "Unknown error",
        };
      }
      throw new Error(
        errorData.message || errorData.error || "Failed to send test email",
      );
    }

    const result = await response.json();
    devLog.log("✅ Test email sent successfully:", result);

    if (result.previewUrl) {
      devLog.log("📧 Email preview:", result.previewUrl);
    }
  } catch (error) {
    console.error("❌ Failed to send test email:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to send test email",
    );
  }
}

export async function checkEmailStatus(): Promise<{
  configured: boolean;
  service: string;
  from: string;
  debug?: { smtpHost: string; smtpPort: number; smtpSecure: boolean };
}> {
  try {
    const response = await fetch("/api/email/status");

    if (!response.ok) {
      throw new Error("Failed to check email status");
    }

    return await response.json();
  } catch (error) {
    console.error("❌ Failed to check email status:", error);
    throw error;
  }
}

// Helper to get auth token for authenticated requests
async function getAuthToken(): Promise<string | null> {
  // This assumes you have access to supabase client
  try {
    const { supabase } = await import("./supabase");
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch (error) {
    console.error("Failed to get auth token:", error);
    return null;
  }
}
