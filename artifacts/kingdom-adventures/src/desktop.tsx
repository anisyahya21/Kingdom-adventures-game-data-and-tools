import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import StrategyOptimizerDesktopPage from "./pages/strategy-optimizer-desktop";
import "./index.css";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Desktop-only entry, rendered by the local pywebview host instead of the website router.
 *
 * It mirrors the provider that `src/main.tsx` installs for the browser app (React Query) but skips
 * the PWA service worker and the Vercel analytics beacon, which make no sense inside an embedded
 * desktop window and would try to reach the network. The optimiser talks to the host only through
 * `window.pywebview.api`; everything else it renders comes from the shared design system.
 */
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <TooltipProvider><StrategyOptimizerDesktopPage /></TooltipProvider>
  </QueryClientProvider>,
);
