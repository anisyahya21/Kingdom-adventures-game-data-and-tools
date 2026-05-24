import { SHOP_RECORDS } from "@/lib/shop-utils";

export const SITE_URL = "https://kingdom-adventures-community-tools.vercel.app";
export const SITE_NAME = "Kingdom Adventurers Community Tools";
export const DEFAULT_DESCRIPTION =
  "Kingdom Adventurers tools, databases, guides, job stats, equipment exchange, shops, monsters, pets, events, maps, and calculators for planning stronger towns.";

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
    title: "Kingdom Adventurers Job Database",
    description: "Compare Kingdom Adventurers jobs by stats, battle type, skills, ranges, and weapon or shield access.",
  },
  "/jobs-marriage": {
    title: "Kingdom Adventurers Jobs and Marriage Hub",
    description: "Read a wiki-style Kingdom Adventurers jobs and marriage overview, then jump to Job Database and Match Finder tools.",
  },
  "/match-finder": {
    title: "Kingdom Adventurers Match Finder",
    description: "Find strong Kingdom Adventurers marriage matches and plan children, awakenings, and job pairings.",
  },
  "/equipment": {
    title: "Kingdom Adventurers Equipment Stats and Exchange",
    description: "Search Kingdom Adventurers equipment stats, exchange values, shop data, and upgrade planning tools.",
  },
  "/equipment-stats": {
    title: "Kingdom Adventurers Equipment Stats",
    description: "Look up Kingdom Adventurers weapons, armor, accessories, stats, ranks, and equipment details.",
  },
  "/equipment-exchange": {
    title: "Kingdom Adventurers Equipment Exchange",
    description: "Calculate Kingdom Adventurers equipment exchange values and plan efficient item trades.",
  },
  "/equipment-leveling-optimizer": {
    title: "Kingdom Adventurers Equipment Leveling Optimizer",
    description: "Optimize Kingdom Adventurers equipment leveling plans with EXP, copper cost, sacrifice routes, cap stages, and upgrade calculations.",
  },
  "/skills": {
    title: "Kingdom Adventurers Skills Database",
    description: "Search Kingdom Adventurers skills, effects, compatibility, and planning data for jobs and units.",
  },
  "/loadout": {
    title: "Kingdom Adventurers Loadout Builder",
    description: "Build and compare Kingdom Adventurers loadouts with equipment, skills, jobs, and stat planning.",
  },
  "/eggs-pets-monsters": {
    title: "Kingdom Adventurers Eggs, Pets, and Monsters",
    description: "Plan Kingdom Adventurers eggs, pets, and monsters with egg outcomes, feed items, spawn locations, detailed stats, growth data, and level-based comparisons.",
  },
  "/eggs": {
    title: "Kingdom Adventurers Eggs and Pets",
    description: "Plan Kingdom Adventurers eggs and pets with hatching, compatibility, and pet data.",
  },
  "/monsters": {
    title: "Kingdom Adventurers Monster Spawns",
    description: "Search Kingdom Adventurers monsters, spawn locations, levels, drops, and map data.",
  },
  "/monster-spawns": {
    title: "Kingdom Adventurers Monster Spawns",
    description: "Search Kingdom Adventurers monster spawn locations, levels, drops, and map data.",
  },
  "/monsters-pets": {
    title: "Kingdom Adventurers Monsters and Pets",
    description: "Browse detailed Kingdom Adventurers monster and pet data, including spawn locations, base stats, growth, levels, and stat comparisons.",
  },
  "/monster-pet-stats": {
    title: "Kingdom Adventurers Monster Pet Stats",
    description: "Compare Kingdom Adventurers monster and pet stats with base levels, growth values, and level-based stat tables for stronger team planning.",
  },
  "/shops": {
    title: "Kingdom Adventurers Shop Database",
    description: "Search Kingdom Adventurers shop unlocks, furniture, weapons, armor, accessories, items, restaurants, and skills.",
  },
  "/houses": {
    title: "Kingdom Adventurers Houses and Facilities",
    description: "Plan Kingdom Adventurers houses and facilities with plot sizes, building costs, extra beds, shelves, monster rooms, owner jobs, upgrade costs, map unlocks, HP, range, storage, and production data.",
  },
  "/survey": {
    title: "Kingdom Adventurers Survey Planner",
    description: "Plan Kingdom Adventurers surveys, map exploration, rewards, and town progression.",
  },
  "/survey-planner": {
    title: "Kingdom Adventurers Survey Planner",
    description: "Plan Kingdom Adventurers surveys, map exploration, rewards, and town progression.",
  },
  "/timed-events": {
    title: "Kingdom Adventurers Timed Events",
    description: "Track Kingdom Adventurers timed events, weekly activities, gacha events, dungeons, and reward planning.",
  },
  "/weekly-conquest": {
    title: "Kingdom Adventurers Weekly Conquest",
    description: "Plan Kingdom Adventurers weekly conquest fights, rewards, timing, and event progress.",
  },
  "/wario-dungeon": {
    title: "Kingdom Adventurers Wairo Dungeon",
    description: "Use Kingdom Adventurers Wairo Dungeon data for event planning, rewards, and progression.",
  },
  "/daily-rank-rewards": {
    title: "Kingdom Adventurers Daily Rank Rewards",
    description: "Check Kingdom Adventurers daily rank rewards and plan collection timing.",
  },
  "/job-center": {
    title: "Kingdom Adventurers Job Center",
    description: "Review Kingdom Adventurers Job Center data, unlocks, and job planning details.",
  },
  "/kairo-room": {
    title: "Kingdom Adventurers Kairo Room",
    description: "Find Kingdom Adventurers Kairo Room data, rewards, and planning details.",
  },
  "/gacha-events": {
    title: "Kingdom Adventurers Gacha Events",
    description: "Track Kingdom Adventurers gacha events, banners, timing, and reward planning.",
  },
  "/town-rank": {
    title: "Kingdom Adventurers Town Rank",
    description: "Plan Kingdom Adventurers town rank progression, unlocks, requirements, and rewards.",
  },
  "/world-map": {
    title: "Kingdom Adventurers World Map",
    description: "Use the Kingdom Adventurers world map to plan exploration, monsters, rewards, and resources.",
  },
  "/world-map-v2": {
    title: "Kingdom Adventurers World Map V2",
    description: "View the work-in-progress Kingdom Adventurers isometric world map with terrain, facilities, resources, and map chip layers.",
  },
  "/map-2-testing": {
    title: "Kingdom Adventurers Map 2 Testing",
    description: "Review Kingdom Adventurers map testing data for exploration and progression planning.",
  },
  "/terrain-composition-lab": {
    title: "Kingdom Adventurers Terrain Composition Lab",
    description: "Test base terrain and nature or object composition in an isolated lab with offsets, anchors, source modes, and draw order controls.",
  },
  "/guides": {
    title: "Kingdom Adventurers Guides",
    description: "Read Kingdom Adventurers guides, community notes, playthrough help, and strategy resources.",
  },
  "/playthrough-guide": {
    title: "Kingdom Adventurers Playthrough Guide",
    description: "Follow a Kingdom Adventurers playthrough guide with progression advice, planning tips, and strategy notes.",
  },
  "/updates": {
    title: "Kingdom Adventurers Tool Updates",
    description: "See recent updates to the Kingdom Adventurers community tools, databases, and calculators.",
  },
  "/sync-devices": {
    title: "Kingdom Adventurers Sync Devices",
    description: "Sync Kingdom Adventurers tool settings and planning data across your devices.",
  },
};

export function getSeoMeta(pathname: string): SeoMeta {
  const cleanPath = pathname.split("?")[0].replace(/\/$/, "") || "/";

  if (cleanPath.startsWith("/jobs/")) {
    const jobName = decodeURIComponent(cleanPath.replace("/jobs/", ""));
    return {
      title: `${jobName} Job Stats - Kingdom Adventurers`,
      description: `View ${jobName} job stats, rank scaling, skills, ranges, battle type, and equipment access in Kingdom Adventurers.`,
      canonicalPath: cleanPath,
    };
  }

  if (cleanPath.startsWith("/shops/")) {
    const slug = cleanPath.replace("/shops/", "");
    const shop = SHOP_RECORDS.find((record) => record.slug === slug);
    const shopName = shop?.title ?? slug.split("-").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");

    return {
      title: `${shopName} - Kingdom Adventurers Shop Database`,
      description: `Search ${shopName} items, unlocks, costs, and shop data for Kingdom Adventurers.`,
      canonicalPath: cleanPath,
    };
  }

  if (cleanPath.startsWith("/guides/")) {
    const guideName = decodeURIComponent(cleanPath.replace("/guides/", "")).replace(/-/g, " ");
    return {
      title: `${guideName} - Kingdom Adventurers Guide`,
      description: `Read the ${guideName} guide for Kingdom Adventurers strategy, planning, and community tips.`,
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

