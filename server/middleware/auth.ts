import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

// Lazy Supabase client creation to avoid startup errors
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
      // Return a mock client for development
      return {
        auth: {
          getUser: () =>
            Promise.resolve({
              data: { user: null },
              error: new Error("Supabase not configured"),
            }),
        },
      };
    }

    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        email_confirmed_at?: string;
      };
    }
  }
}

/**
 * Middleware to verify JWT token and extract user information
 */
export async function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        error: "Access token required",
        message: "Please provide a valid authentication token",
      });
    }

    // Verify the JWT token with Supabase
    const {
      data: { user },
      error,
    } = await getSupabaseClient().auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        error: "Invalid token",
        message: "The provided token is invalid or expired",
      });
    }

    // Add user to request object
    req.user = {
      id: user.id,
      email: user.email!,
      email_confirmed_at: user.email_confirmed_at,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      error: "Authentication error",
      message: "Internal server error during authentication",
    });
  }
}

/**
 * Middleware to ensure user has verified their email
 */
export function requireEmailVerification(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!req.user) {
    return res.status(401).json({
      error: "User not authenticated",
      message: "Please authenticate first",
    });
  }

  if (!req.user.email_confirmed_at) {
    return res.status(403).json({
      error: "Email not verified",
      message:
        "Please verify your email address before accessing this resource",
    });
  }

  next();
}

/**
 * Optional auth middleware - doesn't fail if no token provided
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (token) {
      const {
        data: { user },
        error,
      } = await getSupabaseClient().auth.getUser(token);

      if (!error && user) {
        req.user = {
          id: user.id,
          email: user.email!,
          email_confirmed_at: user.email_confirmed_at,
        };
      }
    }

    next();
  } catch (error) {
    console.error("Optional auth middleware error:", error);
    // Continue without auth if there's an error
    next();
  }
}
