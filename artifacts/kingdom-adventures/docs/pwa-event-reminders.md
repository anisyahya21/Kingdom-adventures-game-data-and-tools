# Event Reminder PWA

## Files added or changed

- `public/manifest.json` - small install manifest for the event reminder PWA.
- `public/pwa-icon.svg` - install icon used by the manifest and notifications.
- `public/firebase-messaging-sw.js` - service worker for install support, notification clicks, and FCM background messages.
- `public/firebase-messaging-config.json` - optional static Firebase config for hosted service-worker startup.
- `index.html` - links the manifest and mobile install metadata.
- `src/main.tsx` - registers the service worker.
- `src/lib/pwa.ts` - install prompt and service-worker helper functions.
- `src/lib/fcm.ts` - Firebase Cloud Messaging setup and token creation.
- `src/lib/event-refresh.ts` - refresh-on-open, refresh-on-focus, and timed refresh hook.
- `src/pages/install.tsx` - install page with generated QR code.
- `src/components/event-reminders.tsx` - reminder subscription UI on the Events page.
- `src/pages/timed-events.tsx` - embeds the reminder manager and refresh behavior.
- `src/pages/gacha-events.tsx` - exports existing gacha schedule data/resolvers for reuse.
- `src/pages/wario-dungeon.tsx` - exports existing Wairo schedule data for reuse.
- `artifacts/api-server/src/routes/event-reminders.ts` - anonymous subscription storage and scheduled send endpoint.
- `artifacts/api-server/src/routes/index.ts` - mounts the reminder API routes.
- `package.json` / `pnpm-lock.yaml` - adds `firebase`, `qrcode`, `@types/qrcode`, and `firebase-admin`.

## Key snippets

Manifest:

```json
{
  "name": "Kingdom Adventures Event Reminders",
  "short_name": "KA Reminders",
  "start_url": "/timed-events",
  "scope": "/",
  "display": "standalone",
  "background_color": "#0b1220",
  "theme_color": "#2563eb",
  "icons": [{ "src": "/pwa-icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }]
}
```

Service worker registration:

```ts
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/firebase-messaging-sw.js").catch(() => {});
  });
}
```

QR code install page:

```ts
const installUrl = `${window.location.origin}/timed-events`;
QRCode.toDataURL(installUrl, { margin: 2, width: 240 }).then(setQrCodeUrl);
```

FCM subscription setup:

```ts
const permission = await Notification.requestPermission();
const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
const token = await getToken(getMessaging(app), {
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
  serviceWorkerRegistration: registration,
});
```

Backend subscription save endpoint:

```ts
router.post("/event-reminders/subscriptions", (req, res) => {
  const id = subscriptionHash(req.body.token, req.body.subscriptionId);
  store.subscriptions = [...store.subscriptions.filter((sub) => sub.id !== id), nextSubscription];
  writeStore(store);
  res.json({ ok: true, id });
});
```

Backend scheduled send endpoint:

```ts
router.post("/event-reminders/send-due", async (req, res) => {
  const due = notificationTimes(subscription, now).filter(({ at }) => {
    const diff = at.getTime() - now.getTime();
    return diff >= -5 * 60_000 && diff <= lookAheadMs;
  });
  await admin.messaging().send({ token, notification, data: { url: subscription.href } });
});
```

Event refresh logic:

```ts
useEventRefresh(() => setNow(new Date()), 180_000);
```

## Firebase configuration

Frontend environment variables:

```txt
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
```

Backend environment variables, choose one credential style:

```txt
FIREBASE_SERVICE_ACCOUNT_JSON=
```

or:

```txt
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

Optional scheduled endpoint protection:

```txt
EVENT_REMINDER_CRON_SECRET=
```

Call `POST /ka-api/ka/event-reminders/send-due` from a cron job every few minutes. If `EVENT_REMINDER_CRON_SECRET` is set, include `x-cron-secret`.

## Platform testing

Android Chrome:

1. Open `/install`, scan the QR code, and install the app.
2. Open `/timed-events`, allow notifications, and subscribe to an S Rank event or Wairo spawn.
3. Run the cron endpoint near a due event and tap the notification. It should open the correct event page.

Desktop Chrome or Edge:

1. Open `/install` and use Install app.
2. Subscribe from `/timed-events`.
3. Confirm the saved token appears in `artifacts/api-server/data/event-reminder-subscriptions.json`.

iPhone Safari:

1. Open `/install`, tap Share, then Add to Home Screen.
2. Open the installed app from the home screen.
3. Confirm event times refresh on open, focus, periodic refresh, and pull down in the reminder panel. Do not expect true background Firebase push on iPhone Safari.
