const API_BASE = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  const clean = path.startsWith("/") ? path : "/" + path;
  return `${API_BASE}/ka-api/ka${clean}`;
}
