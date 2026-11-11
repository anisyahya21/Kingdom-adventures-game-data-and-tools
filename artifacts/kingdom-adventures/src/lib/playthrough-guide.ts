import { useEffect, useState } from "react";
import bundledMarkdown from "./jaza-gitbook.md?raw";

export function usePlaythroughGuideMarkdown(enabled = true): string {
  const [markdown, setMarkdown] = useState(bundledMarkdown);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/ka/guides/jaza-gitbook", {
          signal: controller.signal,
        });
        if (!response.ok || !response.headers.get("Content-Type")?.startsWith("text/plain")) return;
        const latest = await response.text();
        if (latest.trim() && !controller.signal.aborted) setMarkdown(latest);
      } catch {
        // Keep the bundled or previously loaded guide if the server is unavailable.
      }
    })();
    return () => controller.abort();
  }, [enabled]);

  return markdown;
}

export const PLAYTHROUGH_GUIDE_SOURCE_URL = "https://jazas.gitbook.io/kingdom-adventurers";

export type GuideOverlay = {
  title: string;
  description: string;
  href: string;
  cta: string;
};

export const PLAYTHROUGH_GUIDE_SECTION_OVERLAYS: Record<string, GuideOverlay> = {
  "Survey": {
    title: "Plan a survey",
    description: "Check survey requirements and calculate success with your survey team.",
    href: "/survey",
    cta: "Open Survey Calculator",
  },
  "Marriage Intro": {
    title: "Use the site tools for pair planning",
    description: "Jump to Match Finder and Marriage Sim for compatibility checks and outcome planning.",
    href: "/match-finder",
    cta: "Open Match Finder",
  },
  "Lv 999 2nd Gen": {
    title: "Open the marriage simulator",
    description: "Use the Match Finder tools to plan pairings and child outcomes while reading this section.",
    href: "/match-finder",
    cta: "Open Match Finder",
  },
  "Early useful skills": {
    title: "Browse the site's skill reference",
    description: "Open the Skills page if you want the searchable skill database alongside the guide.",
    href: "/skills",
    cta: "Open Skills",
  },
};
