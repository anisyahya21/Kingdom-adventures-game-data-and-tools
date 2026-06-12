# Standalone Event Reminder PWA

The reminder PWA is a separate one-page app at `/event-reminders`. It is intentionally not the full Kingdom Adventures website and does not link users into the rest of the site.

## Files

- `public/manifest.json` - starts the installed PWA at `/event-reminders` and scopes it to that page.
- `public/event-reminder-sw.js` - service worker for standard Web Push and notification taps.
- `public/pwa-icon.svg` - Home Screen/install icon source. Replace this file to ship a different app icon.
- `src/lib/pwa.ts` - registers the service worker.
- `src/lib/web-push.ts` - browser Push API helpers and iOS standalone detection.
- `src/pages/event-reminder-app.tsx` - the mobile-first standalone reminder app.
- `src/App.tsx` - renders `/event-reminders` without the normal site shell/header.
- `src/main.tsx` - hides the Ask Database floating button inside the reminder app.
- `src/pages/timed-events.tsx` - no embedded reminder manager; the full site remains normal.
- `artifacts/api-server/src/routes/event-reminders.ts` - stores anonymous browser push subscriptions and sends due reminders.

## Notifications

This uses the standard browser Push API with VAPID keys, not Firebase Cloud Messaging. That matters because iOS Safari web push works only for installed Home Screen web apps and uses Safari Web Push behavior.

Recommended backend env vars:

```txt
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
EVENT_REMINDER_CRON_SECRET=
```

If `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are missing, the API server will generate a server-side key pair in `data/event-reminder-vapid-keys.json`. This is enough for testing and simple hosting, but stable production secrets are better because existing browser subscriptions depend on the same public/private key pair staying available across deploys.

Generate VAPID keys:

```bat
pnpm --filter @workspace/api-server exec web-push generate-vapid-keys
```

Optional external cron endpoint (still supported):

```txt
POST /ka-api/ka/event-reminders/send-due
x-cron-secret: your secret
```

The API server also runs an in-process due-check sweep every minute. This means reminders continue to fire on normal long-running deployments even if no external cron is configured.

## Supported Reminder Types

- Wairo Dungeon spawn
  - spawn notification only
  - one-hour warning plus spawn notification
- Individual S Rank gacha events
- Weekly Conquest reset notification

There is no daily Weekly Conquest reminder.

## iPhone Testing

1. Open `https://kingdom-adventures-community-tools.vercel.app/event-reminders` in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Open `KA Events` from the Home Screen icon.
5. Tap a reminder and allow notifications.

On iOS, notification permission is expected to work only after opening the installed Home Screen app.
