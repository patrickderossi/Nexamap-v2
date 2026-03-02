import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  // Initialize with a function to avoid hydration mismatches
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    // Safe client-side only initialization
    if (typeof window === "undefined") return false;

    try {
      const userAgent = navigator.userAgent;
      const mobileUserAgent =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          userAgent,
        );
      const smallScreen = window.innerWidth <= MOBILE_BREAKPOINT;
      return mobileUserAgent || smallScreen;
    } catch (error) {
      console.warn("Mobile detection initialization error:", error);
      return false;
    }
  });

  React.useEffect(() => {
    const checkMobile = () => {
      try {
        // Enhanced mobile detection for production environments
        const userAgent = navigator.userAgent;

        // Multiple detection strategies
        const mobileUserAgent =
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            userAgent,
          );
        const iPhoneAgent = /iPhone/i.test(userAgent);
        const androidAgent = /Android/i.test(userAgent);
        const smallScreen = window.innerWidth <= MOBILE_BREAKPOINT;
        const touchDevice =
          "ontouchstart" in window || navigator.maxTouchPoints > 0;

        // Platform check (if available)
        const platformMobile =
          typeof navigator.platform === "string" &&
          /iPhone|iPad|iPod|Android/i.test(navigator.platform);

        // Final decision: mobile if ANY condition is true
        const isMobileDevice =
          mobileUserAgent ||
          iPhoneAgent ||
          androidAgent ||
          smallScreen ||
          (touchDevice && window.innerWidth <= 1024);

        console.log("📱 useIsMobile ENHANCED DEBUG:", {
          // Detection methods
          mobileUserAgent,
          iPhoneAgent,
          androidAgent,
          smallScreen,
          touchDevice,
          platformMobile,

          // Device info
          userAgent,
          platform: navigator.platform || "unknown",
          screenWidth: window.innerWidth,
          screenHeight: window.innerHeight,
          maxTouchPoints: navigator.maxTouchPoints || 0,

          // Environment
          isClient: typeof window !== "undefined",

          // Final result
          result: isMobileDevice,
          currentState: isMobile,
          stateWillChange: isMobile !== isMobileDevice,
        });

        setIsMobile(isMobileDevice);
        return isMobileDevice;
      } catch (error) {
        console.error("Mobile detection error:", error);
        // Fallback to small screen detection
        const fallbackMobile = window.innerWidth <= MOBILE_BREAKPOINT;
        setIsMobile(fallbackMobile);
        return fallbackMobile;
      }
    };

    // Initial check with small delay to ensure DOM is ready
    const timeoutId = setTimeout(() => {
      const result = checkMobile();
      console.log("📱 Initial mobile check result:", result);
    }, 50);

    // Resize listener
    const handleResize = () => {
      checkMobile();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return isMobile;
}
