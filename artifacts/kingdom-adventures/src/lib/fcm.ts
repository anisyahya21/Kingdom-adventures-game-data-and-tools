import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

const config: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export function hasFirebaseMessagingConfig() {
  return Boolean(config.apiKey && config.projectId && config.messagingSenderId && config.appId && import.meta.env.VITE_FIREBASE_VAPID_KEY);
}

function getFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(config);
}

function serviceWorkerConfig() {
  return {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  };
}

export async function getReminderPushToken() {
  if (!hasFirebaseMessagingConfig()) {
    throw new Error("Firebase messaging is not configured for this deployment yet.");
  }
  if (!(await isSupported())) {
    throw new Error("This browser does not support Firebase web push reminders.");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Notifications are blocked. Enable notifications in your browser to subscribe.");
  }

  const app = getFirebaseApp();
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const readyRegistration = await navigator.serviceWorker.ready;
  (readyRegistration.active ?? registration.active)?.postMessage({ type: "firebase-config", config: serviceWorkerConfig() });
  const token = await getToken(getMessaging(app), {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token) throw new Error("Firebase did not return a push token.");
  return token;
}
