import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;

    try {
      const mobileUserAgent =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        );
      const smallScreen = window.innerWidth <= MOBILE_BREAKPOINT;
      return mobileUserAgent || smallScreen;
    } catch {
      return false;
    }
  });

  React.useEffect(() => {
    const checkMobile = () => {
      try {
        const userAgent = navigator.userAgent;
        const mobileUserAgent =
          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            userAgent,
          );
        const smallScreen = window.innerWidth <= MOBILE_BREAKPOINT;
        const touchDevice =
          "ontouchstart" in window || navigator.maxTouchPoints > 0;

        const isMobileDevice =
          mobileUserAgent ||
          smallScreen ||
          (touchDevice && window.innerWidth <= 1024);

        setIsMobile(isMobileDevice);
        return isMobileDevice;
      } catch {
        const fallbackMobile = window.innerWidth <= MOBILE_BREAKPOINT;
        setIsMobile(fallbackMobile);
        return fallbackMobile;
      }
    };

    const timeoutId = setTimeout(() => {
      checkMobile();
    }, 50);

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
