// Test setup file to configure environment variables and mocks

// Set up test environment variables
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://test.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.SMTP_HOST = "smtp.test.com";
process.env.SMTP_PORT = "587";
process.env.SMTP_USER = "test@example.com";
process.env.SMTP_PASS = "test-password";
process.env.EMAIL_FROM = "Test App <test@example.com>";

// Mock console methods to reduce noise in tests
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.warn = (...args) => {
  // Only show warnings that aren't from our test mocks
  if (
    !args.some(
      (arg) =>
        typeof arg === "string" &&
        (arg.includes("Supabase not configured") ||
          arg.includes("Missing Supabase environment") ||
          arg.includes("Email service")),
    )
  ) {
    originalConsoleWarn(...args);
  }
};

console.error = (...args) => {
  // Show errors but filter out expected test-related errors
  if (
    !args.some(
      (arg) =>
        typeof arg === "string" &&
        (arg.includes("Supabase not configured") ||
          arg.includes("test account")),
    )
  ) {
    originalConsoleError(...args);
  }
};

// Cleanup function to restore console methods after tests
export const cleanup = () => {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
};
