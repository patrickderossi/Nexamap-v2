import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./test-setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  define: {
    // Define test environment variables
    "process.env.NODE_ENV": '"test"',
    "process.env.SUPABASE_URL": '"https://test.supabase.co"',
    "process.env.SUPABASE_SERVICE_ROLE_KEY": '"test-service-role-key"',
    "process.env.SMTP_HOST": '"smtp.test.com"',
    "process.env.SMTP_PORT": '"587"',
    "process.env.SMTP_USER": '"test@example.com"',
    "process.env.SMTP_PASS": '"test-password"',
    "process.env.EMAIL_FROM": '"Test App <test@example.com>"',
  },
});
