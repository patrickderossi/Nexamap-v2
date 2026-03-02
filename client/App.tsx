import "./global.css";

// Initialize Sentry FIRST before any other imports
import * as Sentry from "@sentry/react";

// Initialize Sentry if DSN is provided
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE || "development",
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Performance Monitoring
    tracesSampleRate: import.meta.env.MODE === "production" ? 0.1 : 1.0,
    // Session Replay
    replaysSessionSampleRate: import.meta.env.MODE === "production" ? 0.1 : 1.0,
    replaysOnErrorSampleRate: 1.0,
    // Enhanced error context
    beforeSend(event) {
      // Don't send events in development unless explicitly wanted
      if (
        import.meta.env.MODE === "development" &&
        !import.meta.env.VITE_SENTRY_DEBUG
      ) {
        return null;
      }
      return event;
    },
  });
}

import { Toaster } from "@/components/ui/toaster";
import { createRoot } from "react-dom/client";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Index from "./pages/Index";
// import { registerServiceWorker } from "./lib/service-worker";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EmailDebugPanel } from "@/components/EmailDebugPanel";

const queryClient = new QueryClient();

// Register service worker for caching and performance (temporarily disabled)
// registerServiceWorker();

// Wrap BrowserRouter with Sentry for better error tracking and performance monitoring
const SentryBrowserRouter = import.meta.env.VITE_SENTRY_DSN
  ? Sentry.withSentryRouting(BrowserRouter)
  : BrowserRouter;

// Debug Panel Component (must be inside Router context)
const DebugEmailPanel = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const showEmailDebug = searchParams.get('debug') === 'email' || searchParams.get('email-debug') === 'true';

  if (!showEmailDebug) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 10000,
      backgroundColor: 'white',
      padding: '20px',
      borderRadius: '8px',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
      maxHeight: '80vh',
      overflow: 'auto',
      width: '90vw',
      maxWidth: '600px'
    }}>
      <div style={{ marginBottom: '10px', textAlign: 'right' }}>
        <button
          onClick={() => window.history.back()}
          style={{
            background: '#ef4444',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '5px 10px',
            cursor: 'pointer'
          }}
        >
          ✕ Close
        </button>
      </div>
      <EmailDebugPanel />
    </div>
  );
};

// Force reload to fix context
const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <SentryBrowserRouter>
          <DebugEmailPanel />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/email-debug" element={
              <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
                <EmailDebugPanel />
              </div>
            } />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </SentryBrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

// React 18 root initialization with proper singleton pattern
const container = document.getElementById("root")!;

// Global root instance storage
declare global {
  interface Window {
    __REACT_ROOT__?: ReturnType<typeof createRoot>;
  }
}

// Get or create the root instance
let root = window.__REACT_ROOT__;

if (!root) {
  // First time - create the root
  root = createRoot(container);
  window.__REACT_ROOT__ = root;
}

// Always render with the same root instance
root.render(<App />);

// HMR cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Don't destroy the root during HMR, just re-render
    // The root will be reused on the next module load
  });
}
