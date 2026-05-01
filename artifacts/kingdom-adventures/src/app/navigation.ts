import { SHOP_RECORDS } from "@/lib/shop-utils";

export type NavLink = { href: string; label: string; beta?: boolean };

export type NavSection = {
  title: string;
  primary?: NavLink;
  children?: NavLink[];
  note?: string;
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Browse",
    children: [
      { href: "/", label: "Home" },
      { href: "/jobs", label: "Jobs" },
      { href: "/survey", label: "Survey" },
      { href: "/equipment", label: "Equipment Stats & Exchange" },
      { href: "/skills", label: "Skills" },
      { href: "/loadout", label: "Loadout Builder" },
      { href: "/match-finder", label: "Match Finder" },
      { href: "/town-rank", label: "Town Rank" },
      { href: "/guides", label: "Guides" },
    ],
    note: "Match Finder includes marriage matching and marriage sim tools.",
  },
  {
    title: "Guides",
    primary: { href: "/guides", label: "Guides" },
    children: [
      { href: "/playthrough-guide", label: "Playthrough Guide by Jaza" },
      { href: "/add-guide", label: "Add Guide" },
    ],
  },
  {
    title: "Equipment",
    primary: { href: "/equipment", label: "Equipment Stats & Exchange" },
    children: [
      { href: "/equipment-stats", label: "Equipment Stats" },
      { href: "/equipment-exchange", label: "Equipment Exchange" },
      { href: "/equipment-leveling-optimizer", label: "Equipment Leveling Optimizer" },
    ],
  },
  {
    title: "Eggs, Pets & Monsters",
    primary: { href: "/eggs-pets-monsters", label: "Eggs, Pets & Monsters" },
    children: [
      { href: "/eggs", label: "Eggs & Pets" },
      { href: "/monsters-pets", label: "Monsters & Pets" },
    ],
  },
  {
    title: "Shops",
    primary: { href: "/shops", label: "Shops" },
    children: SHOP_RECORDS.map((shop) => ({
      href: `/shops/${shop.slug}`,
      label: shop.shortTitle,
    })),
  },
  {
    title: "Facilities",
    primary: { href: "/houses", label: "Houses & Facilities" },
  },
  {
    title: "Events",
    primary: { href: "/timed-events", label: "Events" },
    children: [
      { href: "/weekly-conquest", label: "Weekly Conquest" },
      { href: "/gacha-events", label: "Gacha Events" },
      { href: "/wario-dungeon", label: "Wairo Dungeon" },
      { href: "/daily-rank-rewards", label: "Daily Rank Rewards" },
      { href: "/kairo-room", label: "Kairo Room" },
      { href: "/job-center", label: "Job Center" },
    ],
  },
  {
    title: "Maps",
    children: [
      { href: "/world-map", label: "World Map", beta: true },
      { href: "/map-2-testing", label: "Map 2 Testing", beta: true },
    ],
  },
  {
    title: "Device",
    children: [{ href: "/sync-devices", label: "Sync Devices" }],
  },
];
