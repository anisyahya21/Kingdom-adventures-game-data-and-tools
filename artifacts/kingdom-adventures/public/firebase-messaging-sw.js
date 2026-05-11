importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/timed-events";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

function initializeMessaging(config) {
  if (!config?.apiKey || !config?.messagingSenderId || !config?.appId || firebase.apps.length) return;
  firebase.initializeApp(config);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const url = payload.data?.url || "/timed-events";
    self.registration.showNotification(notification.title || "Kingdom Adventures reminder", {
      body: notification.body || "An event you subscribed to is starting.",
      icon: "/pwa-icon.svg",
      badge: "/pwa-icon.svg",
      data: { url },
    });
  });
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "firebase-config") initializeMessaging(event.data.config);
});

fetch("/firebase-messaging-config.json", { cache: "no-store" })
  .then((response) => (response.ok ? response.json() : null))
  .then((config) => {
    initializeMessaging(config);
  })
  .catch(() => {});
