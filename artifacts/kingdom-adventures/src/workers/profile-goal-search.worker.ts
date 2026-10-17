import { searchProfileGoalBuildPages, type ProfileGoalBuild, type ProfileGoalSearchOptions } from "../lib/profile-loadout-goal-planner";
import { restoreProfileWorkerInput, type ProfileWorkerMessage, type ProfileWorkerRequest } from "../lib/profile-goal-worker-protocol";
import { compareProfileStrategies, type StrategyMatchTarget } from "../lib/profile-strategy-matches";

const send = (message: ProfileWorkerMessage) => self.postMessage(message);
let builds: ProfileGoalBuild[] = [];
let started = false;
let resume: (() => void) | null = null;
let budgetOptions: { maxSearchNodes?: number } | null = null;
self.onmessage = async (event: MessageEvent<ProfileWorkerRequest>) => {
  const message = event.data;
  if (message.type === "refine") {
    if (resume && budgetOptions) { budgetOptions.maxSearchNodes = (budgetOptions.maxSearchNodes ?? 0) + 1_000_000; const proceed = resume; resume = null; proceed(); }
    return;
  }
  if (message.type === "page") {
    const page = Math.max(0, Math.floor(message.page));
    send({ type: "page", page, builds: builds.slice(page * 40, (page + 1) * 40) });
    return;
  }
  if (started) return;
  started = true;
  try {
    if (message.type === "compare") {
      let lastSent = 0;
      for await (const progress of compareProfileStrategies(restoreProfileWorkerInput(message.input), message.targets, message.upgrades, message.maxSearchNodes, message.maximizeStats)) {
        const now = performance.now();
        if (progress.complete || now - lastSent >= 100) { send({ type: "comparison", ...progress }); lastSent = now; }
      }
      return;
    }
    let lastProgress = 0;
    let finalFrontier = false;
    const options: ProfileGoalSearchOptions = {
      pageSize: 40, nodeSliceSize: 20_000,
      inventoryPolicy: message.upgrades ? "owned-upgrades" : "owned-current",
      includeCurrentBuilds: message.upgrades,
      nearestTargets: message.nearestTargets,
      maxSearchNodes: message.nearestTargets ? 1_000_000 : undefined,
    };
    budgetOptions = options;
    for await (const page of searchProfileGoalBuildPages(restoreProfileWorkerInput(message.input), options)) {
      // Ordinary pages are disjoint. Optimization pages are provisional frontier
      // snapshots until all contexts finish; final pages expose the full frontier.
      if (page.limited) builds = page.builds;
      else if (!page.optimizing) builds.push(...page.builds);
      else if (page.completedCharacters === page.totalCharacters) {
        if (!finalFrontier) { builds = []; finalFrontier = true; }
        builds.push(...page.builds);
      } else builds = page.builds;
      const now = performance.now();
      if (page.complete || page.limited || now - lastProgress >= 100) {
        send({ type: "progress", progress: { ...page, builds: [], matchingBuilds: page.optimizing && !page.complete ? builds.length : page.matchingBuilds } });
        lastProgress = now;
      }
      if (page.limited) await new Promise<void>((resolve) => { resume = resolve; });
    }
  } catch (cause) {
    send({ type: "error", error: cause instanceof Error ? cause.message : "Profile search failed." });
  }
};
