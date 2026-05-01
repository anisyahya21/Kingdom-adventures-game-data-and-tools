import { SHOP_RECORDS } from "@/lib/shop-utils";

export const SITE_URL = "https://kingdom-adventures-community-tools.vercel.app";
export const SITE_NAME = "Kingdom Adventures Community Tools";
export const DEFAULT_DESCRIPTION =
  "Kingdom Adventures tools, databases, guides, job stats, equipment exchange, shops, monsters, pets, events, maps, and calculators for planning stronger towns.";

type SeoMeta = {
  title: string;
  description: string;
  canonicalPath: string;
};

const ROUTE_SEO: Record<string, Omit<SeoMeta, "canonicalPath">> = {
  "/": {
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
  },
  "/jobs": {
    title: "Kingdom Adventures Job Database",
    description: "Compare Kingdom Adventures jobs by stats, battle type, skills, ranges, and weapon or shield access.",
  },
  "/match-finder": {
    title: "Kingdom Adventures Match Finder",
    description: "Find strong Kingdom Adventures marriage matches and plan children, awakenings, and job pairings.",
  },
  "/equipment": {
    title: "Kingdom Adventures Equipment Stats and Exchange",
    description: "Search Kingdom Adventures equipment stats, exchange values, shop data, and upgrade planning tools.",
  },
  "/equipment-stats": {
    title: "Kingdom Adventures Equipment Stats",
    description: "Look up Kingdom Adventures weapons, armor, accessories, stats, ranks, and equipment details.",
  },
  "/equipment-exchange": {
    title: "Kingdom Adventures Equipment Exchange",
    description: "Calculate Kingdom Adventures equipment exchange values and plan efficient item trades.",
  },
  "/equipment-leveling-optimizer": {
    title: "Kingdom Adventures Equipment Leveling Optimizer",
    description: "Optimize Kingdom Adventures equipment leveling plans with EXP, copper cost, sacrifice routes, cap stages, and upgrade calculations.",
  },
  "/skills": {
    title: "Kingdom Adventures Skills Database",
    description: "Search Kingdom Adventures skills, effects, compatibility, and planning data for jobs and units.",
  },
  "/loadout": {
    title: "Kingdom Adventures Loadout Builder",
    description: "Build and compare Kingdom Adventures loadouts with equipment, skills, jobs, and stat planning.",
  },
  "/eggs-pets-monsters": {
    title: "Kingdom Adventures Eggs, Pets, and Monsters",
    description: "Plan Kingdom Adventures eggs, pets, and monsters with egg outcomes, feed items, spawn locations, detailed stats, growth data, and level-based comparisons.",
  },
  "/eggs": {
    title: "Kingdom Adventures Eggs and Pets",
    description: "Plan Kingdom Adventures eggs and pets with hatching, compatibility, and pet data.",
  },
  "/monsters": {
    title: "Kingdom Adventures Monster Spawns",
    description: "Search Kingdom Adventures monsters, spawn locations, levels, drops, and map data.",
  },
  "/monster-spawns": {
    title: "Kingdom Adventures Monster Spawns",
    description: "Search Kingdom Adventures monster spawn locations, levels, drops, and map data.",
  },
  "/monsters-pets": {
    title: "Kingdom Adventures Monsters and Pets",
    description: "Browse detailed Kingdom Adventures monster and pet data, including spawn locations, base stats, growth, levels, and stat comparisons.",
  },
  "/monster-pet-stats": {
    title: "Kingdom Adventures Monster Pet Stats",
    description: "Compare Kingdom Adventures monster and pet stats with base levels, growth values, and level-based stat tables for stronger team planning.",
  },
  "/shops": {
    title: "Kingdom Adventures Shop Database",
    description: "Search Kingdom Adventures shop unlocks, furniture, weapons, armor, accessories, items, restaurants, and skills.",
  },
  "/houses": {
    title: "Kingdom Adventures Houses and Facilities",
    description: "Plan Kingdom Adventures houses and facilities with plot sizes, building costs, extra beds, shelves, monster rooms, owner jobs, upgrade costs, map unlocks, HP, range, storage, and production data.",
  },
  "/survey": {
    title: "Kingdom Adventures Survey Planner",
    description: "Plan Kingdom Adventures surveys, map exploration, rewards, and town progression.",
  },
  "/survey-planner": {
    title: "Kingdom Adventures Survey Planner",
    description: "Plan Kingdom Adventures surveys, map exploration, rewards, and town progression.",
  },
  "/timed-events": {
    title: "Kingdom Adventures Timed Events",
    description: "Track Kingdom Adventures timed events, weekly activities, gacha events, dungeons, and reward planning.",
  },
  "/weekly-conquest": {
    title: "Kingdom Adventures Weekly Conquest",
    description: "Plan Kingdom Adventures weekly conquest fights, rewards, timing, and event progress.",
  },
  "/wario-dungeon": {
    title: "Kingdom Adventures Wairo Dungeon",
    description: "Use Kingdom Adventures Wairo Dungeon data for event planning, rewards, and progression.",
  },
  "/daily-rank-rewards": {
    title: "Kingdom Adventures Daily Rank Rewards",
    description: "Check Kingdom Adventures daily rank rewards and plan collection timing.",
  },
  "/job-center": {
    title: "Kingdom Adventures Job Center",
    description: "Review Kingdom Adventures Job Center data, unlocks, and job planning details.",
  },
  "/kairo-room": {
    title: "Kingdom Adventures Kairo Room",
    description: "Find Kingdom Adventures Kairo Room data, rewards, and planning details.",
  },
  "/gacha-events": {
    title: "Kingdom Adventures Gacha Events",
    description: "Track Kingdom Adventures gacha events, banners, timing, and reward planning.",
  },
  "/town-rank": {
    title: "Kingdom Adventures Town Rank",
    description: "Plan Kingdom Adventures town rank progression, unlocks, requirements, and rewards.",
  },
  "/world-map": {
    title: "Kingdom Adventures World Map",
    description: "Use the Kingdom Adventures world map to plan exploration, monsters, rewards, and resources.",
  },
  "/map-2-testing": {
    title: "Kingdom Adventures Map 2 Testing",
    description: "Review Kingdom Adventures map testing data for exploration and progression planning.",
  },
  "/guides": {
    title: "Kingdom Adventures Guides",
    description: "Read Kingdom Adventures guides, community notes, playthrough help, and strategy resources.",
  },
  "/playthrough-guide": {
    title: "Kingdom Adventures Playthrough Guide",
    description: "Follow a Kingdom Adventures playthrough guide with progression advice, planning tips, and strategy notes.",
  },
  "/updates": {
    title: "Kingdom Adventures Tool Updates",
    description: "See recent updates to the Kingdom Adventures community tools, databases, and calculators.",
  },
  "/sync-devices": {
    title: "Kingdom Adventures Sync Devices",
    description: "Sync Kingdom Adventures tool settings and planning data across your devices.",
  },
};

export function getSeoMeta(pathname: string): SeoMeta {
  const cleanPath = pathname.split("?")[0].replace(/\/$/, "") || "/";

  if (cleanPath.startsWith("/jobs/")) {
    const jobName = decodeURIComponent(cleanPath.replace("/jobs/", ""));
    return {
      title: `${jobName} Job Stats - Kingdom Adventures`,
      description: `View ${jobName} job stats, rank scaling, skills, ranges, battle type, and equipment access in Kingdom Adventures.`,
      canonicalPath: cleanPath,
    };
  }

  if (cleanPath.startsWith("/shops/")) {
    const slug = cleanPath.replace("/shops/", "");
    const shop = SHOP_RECORDS.find((record) => record.slug === slug);
    const shopName = shop?.title ?? slug.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");

    return {
      title: `${shopName} - Kingdom Adventures Shop Database`,
      description: `Search ${shopName} items, unlocks, costs, and shop data for Kingdom Adventures.`,
      canonicalPath: cleanPath,
    };
  }

  if (cleanPath.startsWith("/guides/")) {
    const guideName = decodeURIComponent(cleanPath.replace("/guides/", "")).replace(/-/g, " ");
    return {
      title: `${guideName} - Kingdom Adventures Guide`,
      description: `Read the ${guideName} guide for Kingdom Adventures strategy, planning, and community tips.`,
      canonicalPath: cleanPath,
    };
  }

  const meta = ROUTE_SEO[cleanPath] ?? {
    title: SITE_NAME,
    description: DEFAULT_DESCRIPTION,
  };

  return { ...meta, canonicalPath: cleanPath };
}

export function encodeCanonicalPath(path: string) {
  if (path === "/") return "/";

  return path
    .split("/")
    .map((part) => {
      try {
        return encodeURIComponent(decodeURIComponent(part));
      } catch {
        return encodeURIComponent(part);
      }
    })
    .join("/");
}
