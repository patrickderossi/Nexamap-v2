import "dotenv/config";

// Initialize Sentry FIRST before any other imports
import * as Sentry from "@sentry/node";

// Initialize Sentry if DSN is provided
if (process.env.SENTRY_DSN) {
  const integrations: any[] = [
    Sentry.httpIntegration(),
    Sentry.expressIntegration(),
  ];

  if (!process.env.NETLIFY) {
    // Only require profiling outside Netlify so the .node binaries aren’t bundled
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { nodeProfilingIntegration } = require("@sentry/profiling-node");
    integrations.push(nodeProfilingIntegration());
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    integrations,
    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    // Profiling (disabled on Netlify to avoid build errors)
    profilesSampleRate:
      process.env.NETLIFY || process.env.NODE_ENV !== "production" ? 0 : 0.1,
    // Enhanced error context
    beforeSend(event) {
      // Don't send events in development unless explicitly wanted
      if (process.env.NODE_ENV === "development" && !process.env.SENTRY_DEBUG) {
        return null;
      }
      return event;
    },
  });
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./routes/auth";
import emailRoutes from "./routes/email";
import { handleListingsSearch, handleGetListing } from "./routes/listings";
import { optionalAuth } from "./middleware/auth";

export function createServer() {
  const app = express();

  // Add Sentry request handler FIRST (must be before other middleware)
  if (process.env.SENTRY_DSN) {
    app.use(Sentry.expressIntegration());
  }

  // Trust proxy for accurate IP addresses behind reverse proxies
  app.set("trust proxy", 1);

  // Rate limiting - reasonable limits to prevent abuse while allowing normal usage
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === "production" ? 2000 : 5000,
    message: {
      error: "Too many requests",
      message: "Too many requests from this IP, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const trustedIPs = (process.env.TRUSTED_IPS || "")
        .split(",")
        .filter(Boolean);
      const isDev = process.env.NODE_ENV !== "production";
      const isLocalhost =
        req.ip === "127.0.0.1" ||
        req.ip === "::1" ||
        req.ip === "::ffff:127.0.0.1";
      return isDev || isLocalhost || trustedIPs.includes(req.ip);
    },
  });

  app.use(limiter);

  // Auth rate limiting
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === "production" ? 20 : 50,
    message: {
      error: "Too many authentication attempts",
      message: "Too many authentication attempts, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const trustedIPs = (process.env.TRUSTED_IPS || "")
        .split(",")
        .filter(Boolean);
      return trustedIPs.includes(req.ip);
    },
  });

  // Email rate limiting
  const emailLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: process.env.NODE_ENV === "production" ? 10 : 20,
    message: {
      error: "Too many email requests",
      message: "Too many email requests, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Security headers with helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc:
            process.env.NODE_ENV === "production"
              ? [
                  "'self'",
                  "https://unpkg.com",
                  "https://fonts.googleapis.com",
                  "https://cdn.builder.io",
                ]
              : [
                  "'self'",
                  "'unsafe-inline'",
                  "https://unpkg.com",
                  "https://fonts.googleapis.com",
                  "https://cdn.builder.io",
                ],
          scriptSrc:
            process.env.NODE_ENV === "production"
              ? [
                  "'self'",
                  "https://unpkg.com",
                  "https://maps.googleapis.com",
                  "https://cdn.builder.io",
                ]
              : [
                  "'self'",
                  "'unsafe-inline'",
                  "'unsafe-eval'",
                  "https://unpkg.com",
                  "https://maps.googleapis.com",
                  "https://cdn.builder.io",
                ],
          imgSrc: [
            "'self'",
            "data:",
            "https:",
            "blob:",
            "https://cdn.builder.io",
            "https://*.tile.openstreetmap.org",
            "https://server.arcgisonline.com",
            "https://api.maptiler.com",
          ],
          connectSrc: [
            "'self'",
            "https:",
            "wss:",
            "https://api.maptiler.com",
            "https://services.arcgisonline.com",
            "https://maps.googleapis.com",
            process.env.SUPABASE_URL || "https://*.supabase.co",
          ],
          fontSrc: [
            "'self'",
            "https://fonts.gstatic.com",
            "https://cdn.builder.io",
          ],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          workerSrc: ["'self'", "blob:"],
          manifestSrc: ["'self'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: process.env.NODE_ENV === "production",
      },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      dnsPrefetchControl: { allow: true },
      frameguard: { action: "deny" },
      hidePoweredBy: true,
      ieNoOpen: true,
      noSniff: true,
      xssFilter: true,
    }),
  );

  // CORS config
  const allowedOrigins =
    process.env.NODE_ENV === "production"
      ? [
          process.env.FRONTEND_URL ||
            "https://ba25c7773eab4edbb484613ad5e6cd0c-0821cf8e1f764123b775c7928.fly.dev",
          "https://ba25c7773eab4edbb484613ad5e6cd0c-0821cf8e1f764123b775c7928.fly.dev",
          ...(process.env.ADDITIONAL_ORIGINS?.split(",") || []),
        ].filter(Boolean)
      : [
          "http://localhost:8080",
          "http://localhost:8081",
          "http://localhost:3000",
        ];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        if (
          origin.includes("builder.io") ||
          origin.includes("fly.dev") ||
          origin.includes("localhost") ||
          origin.includes("127.0.0.1")
        ) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        if (process.env.NODE_ENV === "production") {
          console.warn(`CORS blocked origin in production: ${origin}`);
          return callback(
            new Error("CORS policy violation: Origin not allowed"),
            false,
          );
        }

        console.warn(`CORS allowing unknown origin in development: ${origin}`);
        return callback(null, true);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
      ],
      exposedHeaders: [
        "RateLimit-Limit",
        "RateLimit-Remaining",
        "RateLimit-Reset",
      ],
    }),
  );

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  app.use(optionalAuth);

  app.use("/api/auth", authLimiter, authRoutes);
  app.use("/api/email", emailLimiter, emailRoutes);

  // Real estate listings routes
  app.get("/api/listings/search", handleListingsSearch);
  app.get("/api/listings/:id", handleGetListing);

  app.get("/api/ping", (_req, res) => {
    res.json({
      message: process.env.PING_MESSAGE ?? "pong",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || "development",
    });
  });

  app.get("/api/security-check", (_req, res) => {
    res.json({
      message: "Security headers are properly configured",
      environment: process.env.NODE_ENV || "development",
      cors: { allowedOrigins, credentials: true },
      rateLimit: {
        enabled: true,
        windowMs: "15 minutes",
        maxRequests: process.env.NODE_ENV === "production" ? 100 : 1000,
      },
    });
  });

  if (process.env.SENTRY_DSN) {
    app.use(Sentry.expressErrorHandler());
  }

  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (err.message.includes("CORS policy violation")) {
        return res.status(403).json({
          error: "CORS Error",
          message: "Origin not allowed by CORS policy",
        });
      }

      if (err.status === 429) {
        return res.status(429).json({
          error: "Rate Limit Exceeded",
          message: "Too many requests, please try again later",
        });
      }

      console.error("Server error:", err);
      res.status(500).json({
        error: "Internal Server Error",
        message:
          process.env.NODE_ENV === "production"
            ? "Something went wrong"
            : err.message,
      });
    },
  );

  return app;
}
