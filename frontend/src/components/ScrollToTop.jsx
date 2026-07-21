import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls the window (and any known scroll container) to the top on every
 * route change. Fixes the "page opens scrolled down" issue.
 */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    // Defer to next tick so route content has mounted first
    const t = setTimeout(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 0);
    return () => clearTimeout(t);
  }, [pathname]);
  return null;
}
