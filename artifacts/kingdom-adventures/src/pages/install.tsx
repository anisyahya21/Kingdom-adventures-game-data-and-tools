import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Download, QrCode, Share2, Smartphone } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDeferredInstallPrompt, isProbablyIosSafari, listenForInstallPrompt, promptInstall } from "@/lib/pwa";

export default function InstallPage() {
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [canPromptInstall, setCanPromptInstall] = useState(() => Boolean(getDeferredInstallPrompt()));
  const [message, setMessage] = useState("");
  const installUrl = useMemo(() => `${window.location.origin}/timed-events`, []);

  useEffect(() => listenForInstallPrompt(() => setCanPromptInstall(true)), []);

  useEffect(() => {
    QRCode.toDataURL(installUrl, { margin: 2, width: 240 }).then(setQrCodeUrl).catch(() => setQrCodeUrl(""));
  }, [installUrl]);

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") setMessage("Install started. Open KA Reminders from your home screen or app list.");
    if (outcome === "dismissed") setMessage("Install was dismissed. You can try again from your browser menu.");
    if (outcome === "unavailable") setMessage("Use your browser menu and choose Install app or Add to Home Screen.");
    setCanPromptInstall(Boolean(getDeferredInstallPrompt()));
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">Install Event Reminders</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Scan the QR code on your phone, install the app, then subscribe to reminders from the Events page.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4 text-primary" />
              Phone QR code
            </CardTitle>
            <CardDescription>Open this app on your phone.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex aspect-square items-center justify-center rounded-lg border bg-white p-4">
              {qrCodeUrl ? <img src={qrCodeUrl} alt="QR code for the Kingdom Adventures event reminders app" className="h-full w-full object-contain" /> : null}
            </div>
            <div className="break-all text-xs text-muted-foreground">{installUrl}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Install steps</CardTitle>
            <CardDescription>Desktop, Android, and iPhone each handle install a little differently.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-2">
              <div className="font-medium">Android Chrome or desktop Chrome/Edge</div>
              <div className="text-muted-foreground">Use the install button here, or choose Install app from the browser menu. Push reminders work after Firebase is configured and notifications are allowed.</div>
              <Button type="button" onClick={handleInstall} disabled={!canPromptInstall}>
                <Download className="h-4 w-4" />
                Install app
              </Button>
            </div>

            <div className="space-y-2">
              <div className="font-medium">iPhone Safari</div>
              <div className="text-muted-foreground">
                Tap Share, then Add to Home Screen. iPhone Safari cannot receive true background Firebase web push in this setup, so open or refresh the app to update event timing.
              </div>
              <div className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-muted-foreground">
                <Share2 className="h-4 w-4" />
                Share menu then Add to Home Screen
              </div>
            </div>

            {isProbablyIosSafari() ? (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                You are on iPhone Safari, so this page is showing the realistic install and refresh flow for that browser.
              </div>
            ) : null}

            {message ? <div className="rounded-lg border bg-muted px-3 py-2">{message}</div> : null}
            <Button asChild variant="outline">
              <Link href="/timed-events">Go to event reminders</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
