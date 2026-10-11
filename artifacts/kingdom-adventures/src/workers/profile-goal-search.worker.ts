import { searchProfileGoalBuildPages, type ProfileGoalBuild } from "../lib/profile-loadout-goal-planner";
import { restoreProfileWorkerInput, type ProfileWorkerInput, type ProfileWorkerMessage } from "../lib/profile-goal-worker-protocol";

const send = (message: ProfileWorkerMessage) => self.postMessage(message);
let builds: ProfileGoalBuild[] = [];
let started = false;
self.onmessage = async (event: MessageEvent<
  { type: "start"; input: ProfileWorkerInput; upgrades: boolean; nearestTargets?: Record<string, number> } | { type: "page"; page: number }
>) => {
  const message = event.data;
  if (message.type === "page") {
    const page = Math.max(0, Math.floor(message.page));
    send({ type: "page", page, builds: builds.slice(page * 40, (page + 1) * 40) });
    return;
  }
  if (started) return;
  started = true;
  try {
    let lastProgress = 0;
    let finalFrontier = false;
    for await (const page of searchProfileGoalBuildPages(restoreProfileWorkerInput(message.input), {
      pageSize: 40, nodeSliceSize: 20_000,
      inventoryPolicy: message.upgrades ? "owned-upgrades" : "owned-current",
      includeCurrentBuilds: message.upgrades,
      nearestTargets: message.nearestTargets,
      maxSearchNodes: message.nearestTargets ? 1_000_000 : undefined,
    })) {
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
    }
  } catch (cause) {
    send({ type: "error", error: cause instanceof Error ? cause.message : "Profile search failed." });
  }
};
