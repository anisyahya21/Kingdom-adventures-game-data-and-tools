// Add a short entry here with each player-facing release. Use the release date
// when known. Group related changes and link to the tool players can open.
type ReleaseNote = {
  date: string;
  title: string;
  changes: ReadonlyArray<{ label: string; href: string; description: string }>;
};

export const releaseNotes: ReadonlyArray<ReleaseNote> = [
  {
    date: "2026-11-11",
    title: "Easier lookups for jobs, marriage, monsters, and eggs",
    changes: [
      { label: "World Map", href: "/world-map-v2", description: "See the Peace Level, Town Hall, and collection requirements for opening new areas." },
      { label: "Monster Database", href: "/monsters", description: "Look up spawns, loot, XP per kill, and stats by level in one place. Expand Hatching to see the egg colour, required stat, and point ranges. You can also check the monster’s innate skill and which item unlocks its second skill slot." },
      { label: "Job Database", href: "/jobs", description: "Use the simpler reference table to check job stats, EXP requirements, equipment access, and deployment cost. The Advanced Job Table and Advanced Compare are available from the same page." },
      { label: "Marriage Compatibility", href: "/match-finder", description: "Browse the colour-coded table or switch to the interactive view. Filter by parent jobs and affinity. The table uses the available width on desktop and scrolls sideways on phones while the first parent column stays visible." },
      { label: "Eggs & Pets", href: "/eggs", description: "Use the reference table to compare hatch thresholds, starting skills, and second-skill items. The Feeding Planner shows how many items to feed to reach each band." },
    ],
  },
  {
    date: "2026-10",
    title: "Combat Hub, profile builds, and equipment tools",
    changes: [
      { label: "Combat Hub", href: "/combat", description: "Set up battles, build characters, and browse farming strategies. Multi-Box Farming can search for equipment based on your profile and shows which results have been tested." },
      { label: "Player Profile", href: "/player-profile", description: "Manage multiple game accounts and link sign-in methods. Your saved collections can follow your website account across devices." },
      { label: "Equipment", href: "/equipment", description: "Use the Shooting Range to compare equipment options and browse crafting information in more compact columns." },
      { label: "Chaos Setup Lab", href: "/chaos-setup-lab", description: "Use either placement mode and keep placing stones without reselecting the tool after each placement." },
      { label: "Resident Stat Guide", href: "/guides/stat-effects", description: "See what resident stats do in and out of battle." },
      { label: "Timed Events", href: "/timed-events", description: "Kairo Room and Wairo Dungeon loot is easier to browse by difficulty." },
    ],
  },
  {
    date: "2026-09",
    title: "World Builder, player profiles, and more ways to look things up",
    changes: [
      { label: "World Builder", href: "/world-builder", description: "Plan town layouts on the world map and place facilities, pets, and dungeons." },
      { label: "Item & Skill Sources", href: "/item-sources", description: "Look up where items and skills come from, including monster treasure boxes, cave rewards, and shops." },
      { label: "Monster XP per Kill", href: "/monster-xp", description: "Compare XP by area level and terrain, including the effect of XP Up skills." },
      { label: "Add Friends", href: "/add-friends", description: "Share your game friend code and browse other players’ listings." },
      { label: "Player Profile", href: "/player-profile", description: "Track your characters and equipment for use in planners." },
      { label: "Training Facilities", href: "/training-facilities", description: "Check training XP and valid surround layouts." },
      { label: "Briefing Room", href: "/briefing-room", description: "Check the mission schedule." },
      { label: "Shops", href: "/shops", description: "Browse copper and silver shops, including the Zoo and Orchard." },
    ],
  },
  {
    date: "2026-06",
    title: "Event reminders and clearer game data",
    changes: [
      { label: "Timed Events", href: "/timed-events", description: "Set up Telegram or Discord reminders for game events." },
      { label: "Guides", href: "/guides", description: "Guides gained more game icons for jobs, skills, items, and facilities." },
      { label: "Research", href: "/research", description: "Research and Training Facilities gained stat icons and stat filtering." },
    ],
  },
  {
    date: "2026-05",
    title: "Survey Planner and Weekly Conquest",
    changes: [
      { label: "Survey Planner", href: "/survey", description: "Enter progress by time, check your surveyed count, and use a layout designed for phones." },
      { label: "Weekly Conquest", href: "/weekly-conquest", description: "Choose a campaign manually and see its monster target counts." },
    ],
  },
];
