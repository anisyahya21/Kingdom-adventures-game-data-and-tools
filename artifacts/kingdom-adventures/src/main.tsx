import { lazy, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient();
const AskDatabaseWidget = lazy(() => import("./components/AskDatabaseWidget"));

function DeferredAskDatabaseWidget() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 3000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <AskDatabaseWidget />
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