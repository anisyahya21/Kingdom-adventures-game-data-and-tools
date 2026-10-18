import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { startDiscordAuth } from "@/lib/auth-session";
import { configuredApiBase } from "@/lib/api";

const notices: Record<string, [string, string]> = {
  cooldown: ["Discord sign-in paused", "Discord is limiting sign-ins right now. You can retry after the countdown."],
  conflict: ["Discord account already linked", "This Discord account belongs to another website account. Your current account has been kept."],
  cancelled: ["Discord sign-in cancelled", "No account links were changed."],
  expired: ["Start Discord sign-in again", "That sign-in expired or started in another browser."],
  unavailable: ["Discord sign-in unavailable", "We couldn't finish connecting to Discord. Please try again later."],
};

export function ProfileSignInNotice({ authenticated }: { authenticated: boolean }) {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  const [available, setAvailable] = useState(false);
  const reason = params.get("signInError") || "";
  const parsedRetryAt = Number(params.get("retryAt") || 0);
  const retryAt = Number.isFinite(parsedRetryAt) ? parsedRetryAt : 0;
  const seconds = reason === "cooldown" && !available ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : 0;
  useEffect(() => {
    if (reason !== "cooldown") return;
    let live = true;
    void fetch(`${configuredApiBase()}/ka-api/auth/discord/health`, { credentials: "include", cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((health) => { if (live && health?.status === "ready") setAvailable(true); }).catch(() => {});
    return () => { live = false; };
  }, [reason]);
  useEffect(() => {
    if (dismissed || available || reason !== "cooldown" || retryAt <= Date.now()) return;
    const timer = window.setInterval(() => { const time = Date.now(); setNow(time); if (time >= retryAt) window.clearInterval(timer); }, 1000);
    return () => window.clearInterval(timer);
  }, [dismissed, available, reason, retryAt]);
  if (dismissed || !Object.prototype.hasOwnProperty.call(notices, reason)) return null;
  const [title, message] = available ? ["Discord is available again", "You can retry connecting your Discord account."] : notices[reason];
  const wait = seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.ceil(seconds % 3600 / 60)}m` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return <Alert className="bg-muted/20">
    <AlertTitle>{title}</AlertTitle>
    <AlertDescription className="space-y-3">
      <p>{message}</p>
      <div className="flex flex-wrap gap-2">
        {reason !== "conflict" && <Button size="sm" disabled={busy || seconds > 0} onClick={() => { setBusy(true); void startDiscordAuth(authenticated).catch((failure) => { setError(failure instanceof Error ? failure.message : "Please try again later."); setBusy(false); }); }}>{seconds > 0 ? `Try again in ${wait}` : busy ? "Connecting…" : "Try Discord again"}</Button>}
        <Button size="sm" variant="ghost" onClick={() => {
          setDismissed(true);
          const url = new URL(window.location.href); url.searchParams.delete("signInError"); url.searchParams.delete("retryAt"); window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        }}>Dismiss</Button>
      </div>
      {error && <p role="status">{error}</p>}
    </AlertDescription>
  </Alert>;
}
