import express from "express";
import { z } from "zod";
import { emailService } from "../services/emailService";
import { createClient } from "@supabase/supabase-js";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

// Validation schemas
const feedbackSchema = z.object({
  type: z.string().min(1).max(100),
  title: z.string().min(1).max(200),
  feedback: z.string().min(1).max(5000),
  email: z.string().email().optional().or(z.literal("")),
  context: z.string().max(1000).optional(),
});

const contactSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  company: z.string().max(100).optional(),
  message: z.string().min(10).max(5000),
});

// Get configuration values
const nodeEnv = process.env.NODE_ENV;

// Supabase configuration (fallback to anon key if service role is missing)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY;

/**
 * GET /api/email/status
 * Check email service status (no auth required for now)
 */
router.get("/status", async (req, res) => {
  try {
    const status = await emailService.checkConfiguration();

    res.json({
      configured: status.configured,
      service: status.service,
      from: status.from,
      // Don't expose sensitive config in production
      debug:
        nodeEnv === "development"
          ? {
              smtpHost: status.smtpHost,
              smtpPort: status.smtpPort,
              smtpSecure: status.smtpSecure,
            }
          : undefined,
    });
  } catch (error) {
    console.error("Error checking email status:", error);
    res.status(500).json({
      error: "Failed to check email status",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * Helper function to create mock email service for development
 */
function createMockEmailService() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("⚠️ Supabase not configured - using mock client");
    return {
      auth: {
        getUser: () =>
          Promise.resolve({
            data: { user: null },
            error: new Error("Supabase not configured"),
          }),
        signInWithPassword: () =>
          Promise.resolve({
            data: { user: null },
            error: new Error("Supabase not configured"),
          }),
        signUp: () =>
          Promise.resolve({
            data: { user: null },
            error: new Error("Supabase not configured"),
          }),
        signOut: () => Promise.resolve({ error: null }),
        resetPasswordForEmail: () =>
          Promise.resolve({ error: new Error("Supabase not configured") }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => {} } },
        }),
        resend: () =>
          Promise.resolve({ error: new Error("Supabase not configured") }),
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: new Error("Supabase not configured"),
              }),
          }),
        }),
      }),
    };
  }
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * POST /api/email/feedback
 * Send feedback email (no auth required for now)
 */
router.post("/feedback", async (req, res) => {
  try {
    // Validate input using Zod schema
    const validationResult = feedbackSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Please check all required fields",
        details: validationResult.error.errors,
      });
    }

    const { type, title, feedback, email, context } = validationResult.data;

    // Send feedback email
    const result = await emailService.sendFeedbackEmail({
      type,
      title,
      feedback,
      email,
      context,
    });

    if (result.success) {
      res.json({
        message: "Feedback sent successfully",
        messageId: result.messageId,
      });
    } else {
      res.status(500).json({
        error: "Failed to send feedback",
        message: result.error,
      });
    }
  } catch (error) {
    console.error("Error in feedback endpoint:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to process feedback request",
    });
  }
});

/**
 * POST /api/email/contact
 * Send contact form email (no auth required)
 */
router.post("/contact", async (req, res) => {
  try {
    // Validate input using Zod schema
    const validationResult = contactSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid input",
        message: "Please check all required fields",
        details: validationResult.error.errors,
      });
    }

    const { name, email, company, message } = validationResult.data;

    // Send contact email
    const result = await emailService.sendContactEmail({
      name,
      email,
      company,
      message,
    });

    if (result.success) {
      res.json({
        message: "Contact form sent successfully",
        messageId: result.messageId,
      });
    } else {
      res.status(500).json({
        error: "Failed to send contact form",
        message: result.error,
      });
    }
  } catch (error) {
    console.error("Error in contact endpoint:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to process contact request",
    });
  }
});

/**
 * POST /api/email/welcome
 * Send welcome email (auth required)
 */
router.post("/welcome", authenticateToken, async (req, res) => {
  try {
    const { email, name } = req.body;

    if (!email || !name) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "Email and name are required",
      });
    }

    const result = await emailService.sendWelcomeEmail(email, name);

    if (result.success) {
      res.json({
        message: "Welcome email sent successfully",
        messageId: result.messageId,
      });
    } else {
      res.status(500).json({
        error: "Failed to send welcome email",
        message: result.error,
      });
    }
  } catch (error) {
    console.error("Error in welcome email endpoint:", error);
    res.status(500).json({
      error: "Internal server error",
      message: "Failed to send welcome email",
    });
  }
});

export default router;
