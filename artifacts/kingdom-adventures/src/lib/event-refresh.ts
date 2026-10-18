import { useEffect } from "react";

export function useEventRefresh(refresh: () => void, intervalMs = 180_000) {
  useEffect(() => {
    refresh();

    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = intervalMs > 0 ? window.setInterval(refresh, intervalMs) : null;

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (interval !== null) window.clearInterval(interval);
    };
  }, [intervalMs, refresh]);
}
