import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./lib/pwa";

const queryClient = new QueryClient();
const AskDatabaseWidget = lazy(() => import("./components/AskDatabaseWidget"));

registerServiceWorker();

function DeferredAskDatabaseWidget() {
  const [requested, setRequested] = useState(false);
  const isWorldMap = window.location.pathname === "/world-map";
  const isEventReminderApp = window.location.pathname === "/event-reminders";

  if (isWorldMap || isEventReminderApp) return null;

  if (!requested) {
    return (
      <button
        type="button"
        onClick={() => setRequested(true)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        aria-label="Open Ask the Database"
        title="Ask the Database"
      >
        ?
      </button>
    );
  }

  return (
    <Suspense fallback={null}>
      <AskDatabaseWidget initialOpen />
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <App />
    <DeferredAskDatabaseWidget />
    <Analytics />
  </QueryClientProvider>
);
