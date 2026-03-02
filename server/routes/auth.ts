import { Router } from "express";
import {
  authenticateToken,
  requireEmailVerification,
} from "../middleware/auth";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const router = Router();

// Validation schema for profile updates
const profileUpdateSchema = z.object({
  full_name: z.string().min(1).max(100).optional(),
  role: z.string().max(100).optional(),
  company_name: z.string().max(200).optional(),
  company_size: z.string().max(50).optional(),
  years_experience: z.string().max(50).optional(),
  project_types: z.string().max(500).optional(),
  data_frequency: z.string().max(100).optional(),
  biggest_challenge: z.string().max(1000).optional(),
  provide_feedback: z.boolean().optional(),
  hear_about_us: z.string().max(200).optional(),
});

// Lazy Supabase client creation
let supabase: any = null;

function getSupabaseClient() {
  if (!supabase) {
    const supabaseUrl =
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.warn("⚠️ Supabase not configured - using mock client");
      return {
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
          update: () => ({
            eq: () => ({
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: null,
                    error: new Error("Supabase not configured"),
                  }),
              }),
            }),
          }),
        }),
        auth: {
          resend: () =>
            Promise.resolve({ error: new Error("Supabase not configured") }),
        },
      };
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get("/me", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Fetch user profile from database
    const { data: profile, error } = await getSupabaseClient()
      .from("profiles")
      .select("*")
      .eq("id", req.user.id)
      .single();

    if (error) {
      console.error("Error fetching user profile:", error);
      return res.status(500).json({ error: "Failed to fetch user profile" });
    }

    res.json({
      user: req.user,
      profile: profile,
    });
  } catch (error) {
    console.error("Error in /me endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Validate input using Zod schema
    const validationResult = profileUpdateSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Validation failed",
        message: "Invalid profile data",
        details: validationResult.error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        })),
      });
    }

    const {
      full_name,
      role,
      company_name,
      company_size,
      years_experience,
      project_types,
      data_frequency,
      biggest_challenge,
      provide_feedback,
      hear_about_us,
    } = validationResult.data;

    // Update profile in database
    const { data, error } = await getSupabaseClient()
      .from("profiles")
      .update({
        full_name,
        role,
        company_name,
        company_size,
        years_experience,
        project_types,
        data_frequency,
        biggest_challenge,
        provide_feedback,
        hear_about_us,
        updated_at: new Date().toISOString(),
      })
      .eq("id", req.user.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating profile:", error);
      return res.status(500).json({ error: "Failed to update profile" });
    }

    res.json({
      message: "Profile updated successfully",
      profile: data,
    });
  } catch (error) {
    console.error("Error in profile update endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/auth/verify-email
 * Request email verification resend
 */
router.post("/verify-email", authenticateToken, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (req.user.email_confirmed_at) {
      return res.status(400).json({ error: "Email already verified" });
    }

    // Request email verification resend
    const { error } = await getSupabaseClient().auth.resend({
      type: "signup",
      email: req.user.email,
    });

    if (error) {
      console.error("Error resending verification email:", error);
      return res
        .status(500)
        .json({ error: "Failed to send verification email" });
    }

    res.json({
      message: "Verification email sent successfully",
    });
  } catch (error) {
    console.error("Error in email verification endpoint:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/auth/status
 * Check authentication status (public endpoint)
 */
router.get("/status", (req, res) => {
  res.json({
    authenticated: !!req.user,
    user: req.user || null,
  });
});

export default router;
