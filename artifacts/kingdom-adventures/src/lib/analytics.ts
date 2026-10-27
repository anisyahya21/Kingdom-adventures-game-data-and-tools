import { configuredApiBase } from "@/lib/api";
import { isAnalyticsOrigin, isAutomationUserAgent } from "./analytics-policy";

const ANALYTICS_ANON_KEY = "ka_anon_id";
const ANALYTICS_SESSION_KEY = "ka_session_id";

function getOrCreateStorageId(key: string) {
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
}

function getOrCreateSessionId() {
  const existing = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, next);
  return next;
}

function routeToToolSlug(route: string) {
  const segment = route.split("/").filter(Boolean)[0];
  return segment || "home";
}

export async function trackPageView(route: string) {
  if (typeof window === "undefined") return;
  if (
    !import.meta.env.PROD ||
    !isAnalyticsOrigin(window.location.origin) ||
    navigator.webdriver ||
    isAutomationUserAgent(navigator.userAgent) ||
    (window as Window & { __KA_DISABLE_ANALYTICS__?: boolean })
      .__KA_DISABLE_ANALYTICS__
  )
    return;
  try {
    const cleanRoute = route.startsWith("/") ? route : `/${route}`;
    const payload = {
      eventId: crypto.randomUUID(),
      eventType: "page_view",
      route: cleanRoute,
      toolSlug: routeToToolSlug(cleanRoute),
      anonId: getOrCreateStorageId(ANALYTICS_ANON_KEY),
      sessionId: getOrCreateSessionId(),
      referrer: document.referrer || undefined,
    };

    const base = configuredApiBase();
    const endpoint = `${base}/ka-api/ka/analytics/events`;
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify(payload),
    });
  } catch {
    // Analytics failures should never affect user flow.
  }
}
