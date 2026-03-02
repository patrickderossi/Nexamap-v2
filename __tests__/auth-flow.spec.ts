import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import { createServer } from "../server/index";
import type { Express } from "express";

describe("Authentication Flow Integration Tests", () => {
  let app: Express;
  let testEmail: string;
  let authToken: string;

  beforeAll(() => {
    // Create test server instance
    app = createServer();

    // Generate unique test email to avoid conflicts
    testEmail = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;
  });

  beforeEach(() => {
    // Reset auth token before each test
    authToken = "";
  });

  describe("Server Health & Configuration", () => {
    it("should respond to ping endpoint", async () => {
      const response = await request(app).get("/api/ping").expect(200);

      expect(response.body).toHaveProperty("message");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body).toHaveProperty("environment");
    });

    it("should have security headers configured", async () => {
      const response = await request(app)
        .get("/api/security-check")
        .expect(200);

      expect(response.body).toHaveProperty("cors");
      expect(response.body).toHaveProperty("rateLimit");
      expect(response.body.rateLimit.enabled).toBe(true);
    });
  });

  describe("Rate Limiting", () => {
    it("should have rate limiting configured", async () => {
      // Just test that rate limiting is configured, not trigger it
      const response = await request(app)
        .get("/api/security-check")
        .expect(200);

      expect(response.body.rateLimit.enabled).toBe(true);
      expect(response.body.rateLimit.windowMs).toBe("15 minutes");
    });
  });

  describe("Input Validation", () => {
    it("should validate email feedback input with Zod schema", async () => {
      // Test missing required fields
      const invalidData = {
        type: "", // Empty type should fail
        title: "", // Empty title should fail
        feedback: "", // Empty feedback should fail
      };

      const response = await request(app)
        .post("/api/email/feedback")
        .send(invalidData)
        .expect(400);

      expect(response.body).toHaveProperty("error", "Validation failed");
      expect(response.body).toHaveProperty("details");
      expect(Array.isArray(response.body.details)).toBe(true);
    });

    it("should validate email format in feedback", async () => {
      const invalidEmailData = {
        type: "bug",
        title: "Test feedback",
        feedback: "This is a test feedback",
        email: "invalid-email-format", // Invalid email should fail
      };

      const response = await request(app)
        .post("/api/email/feedback")
        .send(invalidEmailData)
        .expect(400);

      expect(response.body).toHaveProperty("error", "Validation failed");
      expect(
        response.body.details.some(
          (detail: any) =>
            detail.field === "email" && detail.message.includes("email"),
        ),
      ).toBe(true);
    });

    it("should accept valid feedback data", async () => {
      const validData = {
        type: "feature-request",
        title: "Integration test feedback",
        feedback: "This is a valid feedback message for testing purposes.",
        email: testEmail,
        context: "Integration test context",
      };

      const response = await request(app)
        .post("/api/email/feedback")
        .send(validData)
        .expect(200);

      expect(response.body).toHaveProperty("message");
      expect(response.body.message).toContain("successfully");
    });
  });

  describe("Authentication Status", () => {
    it("should return unauthenticated status for anonymous requests", async () => {
      const response = await request(app).get("/api/auth/status").expect(200);

      expect(response.body).toHaveProperty("authenticated", false);
      expect(response.body).toHaveProperty("user", null);
    });

    it("should require authentication for protected endpoints", async () => {
      const response = await request(app).get("/api/auth/me").expect(401);

      expect(response.body).toHaveProperty("error");
    });

    it("should reject invalid JWT tokens", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid-jwt-token")
        .expect(401);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Email Service", () => {
    it("should check email service status", async () => {
      const response = await request(app).get("/api/email/status").expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("hasSmtp");
      expect(response.body).toHaveProperty("timestamp");
    });

    it("should validate test email input", async () => {
      const invalidTestEmail = {
        to: "invalid-email",
        subject: "",
        message: "",
      };

      const response = await request(app)
        .post("/api/email/test")
        .send(invalidTestEmail)
        .expect(400);

      expect(response.body).toHaveProperty("error", "Validation failed");
    });
  });

  describe("Profile Management (requires auth)", () => {
    it("should validate profile update data structure", async () => {
      const invalidProfileData = {
        full_name: "A".repeat(200), // Too long
        role: "X".repeat(150), // Too long
        provide_feedback: "not-a-boolean", // Wrong type
      };

      const response = await request(app)
        .put("/api/auth/profile")
        .send(invalidProfileData)
        .expect(401); // Should be unauthorized first

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Security Headers & CSP", () => {
    it("should include security headers in responses", async () => {
      const response = await request(app).get("/api/ping");

      // Check for common security headers added by Helmet
      expect(response.headers).toHaveProperty("x-content-type-options");
      expect(response.headers).toHaveProperty("x-frame-options");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    });

    it("should include CORS headers for allowed origins", async () => {
      const response = await request(app)
        .options("/api/ping")
        .set("Origin", "http://localhost:8080")
        .expect(204);

      expect(response.headers).toHaveProperty("access-control-allow-origin");
    });
  });

  describe("Error Handling", () => {
    it("should handle 404 routes gracefully", async () => {
      const response = await request(app)
        .get("/api/nonexistent-endpoint")
        .expect(404);

      // Express should handle this gracefully without crashing
    });

    it("should handle malformed JSON gracefully", async () => {
      const response = await request(app)
        .post("/api/email/feedback")
        .set("Content-Type", "application/json")
        .send("{ invalid json }")
        .expect(400);

      // Should not crash the server
    });
  });

  afterAll(() => {
    // Cleanup: In a real test environment, you might want to:
    // - Close database connections
    // - Clear test data
    // - Stop any background services
    console.log("✅ Integration tests completed");
  });
});

// Additional test utilities and helpers
export const testUtils = {
  /**
   * Helper to create a mock JWT token for testing
   * Note: This is for testing purposes only and requires a real Supabase setup
   */
  createMockAuthToken: (userId: string = "test-user-id") => {
    // In a real test environment, you'd use your testing Supabase instance
    // to generate actual valid tokens for testing authenticated routes
    return "mock-jwt-token-for-testing";
  },

  /**
   * Helper to wait for rate limit windows to reset
   */
  waitForRateLimit: (seconds: number = 1) => {
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  },

  /**
   * Generate test data for various scenarios
   */
  generateTestData: {
    validFeedback: () => ({
      type: "feature-request",
      title: `Test feedback ${Date.now()}`,
      feedback: "This is automatically generated test feedback data.",
      email: `test-${Date.now()}@example.com`,
      context: "Automated test context",
    }),

    invalidFeedback: () => ({
      type: "",
      title: "",
      feedback: "",
      email: "invalid-email",
    }),

    validProfile: () => ({
      full_name: "Test User",
      role: "Developer",
      company_name: "Test Company",
      company_size: "1-10",
      years_experience: "1-3",
      project_types: "Web Development",
      data_frequency: "Weekly",
      biggest_challenge: "Testing is hard",
      provide_feedback: true,
      hear_about_us: "Search Engine",
    }),
  },
};
