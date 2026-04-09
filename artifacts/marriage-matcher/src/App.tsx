import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import MarriageMatcher from "@/pages/marriage-matcher";
import EquipmentPage from "@/pages/equipment";
import MonstersPage from "@/pages/monsters";
import JobsPage from "@/pages/jobs";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/match-finder" component={MarriageMatcher} />
      <Route path="/equipment" component={EquipmentPage} />
      <Route path="/monsters" component={MonstersPage} />
      <Route path="/jobs" component={JobsPage} />
      <Route path="/jobs/:name" component={JobsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
