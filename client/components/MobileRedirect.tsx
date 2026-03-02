import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

export function MobileRedirect() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // More comprehensive mobile detection for deployment environment
    const userAgent = navigator.userAgent;

    // Multiple detection methods
    const mobileUserAgentCheck =
      /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(
        userAgent,
      );
    const iPhoneCheck = /iPhone/i.test(userAgent);
    const androidCheck = /Android/i.test(userAgent);
    const tabletCheck = /iPad/i.test(userAgent);
    const isSmallScreen = window.innerWidth <= 768;
    const isTouchDevice =
      "ontouchstart" in window || navigator.maxTouchPoints > 0;

    // Platform API check (modern browsers)
    const platformMobile =
      typeof navigator.platform === "string" &&
      /iPhone|iPad|iPod|Android/i.test(navigator.platform);

    // Any mobile indicator should trigger redirect
    const shouldRedirectDirect =
      mobileUserAgentCheck ||
      iPhoneCheck ||
      androidCheck ||
      tabletCheck ||
      isSmallScreen ||
      (isTouchDevice && window.innerWidth <= 1024);

    // Enhanced logging for deployment debugging
    console.log("🔍 MobileRedirect ENHANCED Debug:", {
      // Environment info
      environment: import.meta.env.MODE,
      isDev: import.meta.env.DEV,
      isProd: import.meta.env.PROD,

      // Detection results
      hookResult: isMobile,
      shouldRedirectDirect,

      // Specific checks
      mobileUserAgentCheck,
      iPhoneCheck,
      androidCheck,
      tabletCheck,
      isSmallScreen,
      isTouchDevice,
      platformMobile,

      // Device info
      userAgent,
      platform: navigator.platform,
      screenWidth: window.innerWidth,
      screenHeight: window.innerHeight,
      maxTouchPoints: navigator.maxTouchPoints,

      // Route info
      currentPath: location.pathname,
      isNotMobilePage: location.pathname !== "/mobile",
      isNotAuthPage: !location.pathname.startsWith("/auth"),

      // Final decision
      finalShouldRedirect:
        (isMobile || shouldRedirectDirect) &&
        location.pathname !== "/mobile" &&
        !location.pathname.startsWith("/auth"),
    });

    // Use either hook result OR direct check
    const shouldRedirect =
      (isMobile || shouldRedirectDirect) &&
      location.pathname !== "/mobile" &&
      !location.pathname.startsWith("/auth");

    if (shouldRedirect) {
      console.log("🔄 REDIRECTING TO MOBILE PAGE from:", location.pathname);
      // Add small delay to ensure DOM is ready in production
      setTimeout(() => {
        navigate("/mobile", { replace: true });
      }, 100);
    } else {
      console.log("❌ No redirect needed - breakdown:", {
        anyMobileDetected: isMobile || shouldRedirectDirect,
        notOnMobilePage: location.pathname !== "/mobile",
        notOnAuthPage: !location.pathname.startsWith("/auth"),
        willRedirect: shouldRedirect,
      });
    }
  }, [isMobile, navigate, location.pathname]);

  // Temporary visual debug indicator for production testing
  // Remove this once the issue is resolved
  const showDebugInfo =
    import.meta.env.DEV || location.search.includes("debug=mobile");

  if (showDebugInfo) {
    return (
      <div
        style={{
          position: "fixed",
          top: "10px",
          left: "10px",
          backgroundColor: "rgba(255, 0, 0, 0.9)",
          color: "white",
          padding: "10px",
          borderRadius: "5px",
          zIndex: 9999,
          fontSize: "12px",
          maxWidth: "300px",
        }}
      >
        <div>
          <strong>Mobile Debug Info:</strong>
        </div>
        <div>Hook: {isMobile ? "Mobile" : "Desktop"}</div>
        <div>
          UA:{" "}
          {/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
            ? "Mobile"
            : "Desktop"}
        </div>
        <div>Screen: {window.innerWidth}px</div>
        <div>Path: {location.pathname}</div>
        <div>
          Should redirect:{" "}
          {(isMobile ||
            /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
            window.innerWidth <= 768) &&
          location.pathname !== "/mobile" &&
          !location.pathname.startsWith("/auth")
            ? "YES"
            : "NO"}
        </div>
      </div>
    );
  }

  return null;
}

export default MobileRedirect;
