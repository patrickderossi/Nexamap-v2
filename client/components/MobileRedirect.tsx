import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";

export function MobileRedirect() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const shouldRedirect =
      isMobile &&
      location.pathname !== "/mobile" &&
      !location.pathname.startsWith("/auth");

    if (shouldRedirect) {
      setTimeout(() => {
        navigate("/mobile", { replace: true });
      }, 100);
    }
  }, [isMobile, navigate, location.pathname]);

  return null;
}

export default MobileRedirect;
