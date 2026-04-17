import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Package, Sparkles, Swords, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type EventKind = "jobs" | "facilities" | "weapons" | "items";

type GachaEvent = {
  id: string;
  kind: EventKind;
  title: string;
  poolLabel: string;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
  notes?: string;
};

function namedWeaponPoolTitle(names: string[]): string {
  if (names.length <= 2) return names.join(" + ");
  return `${names[0]} +${names.length - 1} more`;
}

const STAFF_POOL = ["S/ Mystic Staff"];
const CLUB_POOL = ["S/ Golden Club", "S/ Divine Club"];
const SPEAR_POOL = ["S/ Fire Spear", "S/ Black Spear"];
const HAMMER_POOL = ["S/ Fire Hammer", "S/ Golden Hammer"];
const SWORD_POOL = ["S/ Fire Sword", "S/ Blizzard Sword", "S/ Legendary Sword", "S/ Conqueror's Sword", "S/ Yggdrasil Sword"];
const GUN_POOL = ["S/ Golden Gun"];
const BOW_POOL = ["S/ Champion's Bow"];
const AXE_POOL = ["S/ Legendary Axe"];

type ResolvedEvent = GachaEvent & {
  startAt: Date;
  endAt: Date;
  isActive: boolean;
  isUpcoming: boolean;
  durationDays: number;
};

const JOB_EVENTS: GachaEvent[] = [
  { id: "job-01", kind: "jobs", title: "S Rank Samurai", poolLabel: "S Rank Job Event", startMonth: 1, startDay: 2, endMonth: 1, endDay: 5 },
  { id: "job-02", kind: "jobs", title: "S Rank Viking", poolLabel: "S Rank Job Event", startMonth: 1, startDay: 8, endMonth: 1, endDay: 10 },
  { id: "job-03", kind: "jobs", title: "S Rank Pirate", poolLabel: "S Rank Job Event", startMonth: 1, startDay: 15, endMonth: 1, endDay: 17 },
  { id: "job-04", kind: "jobs", title: "S Rank Champion", poolLabel: "S Rank Job Event", startMonth: 1, startDay: 22, endMonth: 1, endDay: 24 },
  { id: "job-05", kind: "jobs", title: "S Rank Wizard", poolLabel: "S Rank Job Event", startMonth: 1, startDay: 28, endMonth: 1, endDay: 30 },
  { id: "job-06", kind: "jobs", title: "S Rank Paladin", poolLabel: "S Rank Job Event", startMonth: 2, startDay: 5, endMonth: 2, endDay: 8 },
  { id: "job-07", kind: "jobs", title: "S Rank Gunner", poolLabel: "S Rank Job Event", startMonth: 2, startDay: 9, endMonth: 2, endDay: 12 },
  { id: "job-08", kind: "jobs", title: "S Rank Archer", poolLabel: "S Rank Job Event", startMonth: 2, startDay: 15, endMonth: 2, endDay: 18 },
  { id: "job-09", kind: "jobs", title: "S Rank Ninja", poolLabel: "S Rank Job Event", startMonth: 3, startDay: 1, endMonth: 3, endDay: 3 },
  { id: "job-10", kind: "jobs", title: "S Rank Samurai", poolLabel: "S Rank Job Event", startMonth: 3, startDay: 8, endMonth: 3, endDay: 10 },
  { id: "job-11", kind: "jobs", title: "S Rank Viking", poolLabel: "S Rank Job Event", startMonth: 3, startDay: 15, endMonth: 3, endDay: 17 },
  { id: "job-12", kind: "jobs", title: "S Rank Pirate", poolLabel: "S Rank Job Event", startMonth: 3, startDay: 22, endMonth: 3, endDay: 24 },
  { id: "job-13", kind: "jobs", title: "S Rank Champion", poolLabel: "S Rank Job Event", startMonth: 3, startDay: 28, endMonth: 3, endDay: 30 },
  { id: "job-14", kind: "jobs", title: "S Rank Wizard", poolLabel: "S Rank Job Event", startMonth: 4, startDay: 1, endMonth: 4, endDay: 3 },
  { id: "job-15", kind: "jobs", title: "S Rank Monk", poolLabel: "S Rank Job Event", startMonth: 4, startDay: 8, endMonth: 4, endDay: 10 },
  { id: "job-16", kind: "jobs", title: "S Rank Samurai", poolLabel: "S Rank Job Event", startMonth: 4, startDay: 15, endMonth: 4, endDay: 17 },
  { id: "job-17", kind: "jobs", title: "S Rank Guard", poolLabel: "S Rank Job Event", startMonth: 4, startDay: 22, endMonth: 4, endDay: 24 },
  { id: "job-18", kind: "jobs", title: "S Rank Knight", poolLabel: "S Rank Job Event", startMonth: 5, startDay: 1, endMonth: 5, endDay: 3 },
  { id: "job-19", kind: "jobs", title: "S Rank Mage", poolLabel: "S Rank Job Event", startMonth: 5, startDay: 8, endMonth: 5, endDay: 10 },
  { id: "job-20", kind: "jobs", title: "S Rank Paladin", poolLabel: "S Rank Job Event", startMonth: 5, startDay: 15, endMonth: 5, endDay: 17 },
  { id: "job-21", kind: "jobs", title: "S Rank Gunner", poolLabel: "S Rank Job Event", startMonth: 5, startDay: 22, endMonth: 5, endDay: 24 },
  { id: "job-22", kind: "jobs", title: "S Rank Archer", poolLabel: "S Rank Job Event", startMonth: 5, startDay: 28, endMonth: 5, endDay: 30 },
  { id: "job-23", kind: "jobs", title: "S Rank Ninja", poolLabel: "S Rank Job Event", startMonth: 6, startDay: 1, endMonth: 6, endDay: 3 },
  { id: "job-24", kind: "jobs", title: "S Rank Samurai", poolLabel: "S Rank Job Event", startMonth: 6, startDay: 8, endMonth: 6, endDay: 10 },
  { id: "job-25", kind: "jobs", title: "S Rank Viking", poolLabel: "S Rank Job Event", startMonth: 6, startDay: 15, endMonth: 6, endDay: 17 },
  { id: "job-26", kind: "jobs", title: "S Rank Pirate", poolLabel: "S Rank Job Event", startMonth: 6, startDay: 22, endMonth: 6, endDay: 24 },
  { id: "job-27", kind: "jobs", title: "S Rank Champion", poolLabel: "S Rank Job Event", startMonth: 7, startDay: 1, endMonth: 7, endDay: 3 },
  { id: "job-28", kind: "jobs", title: "S Rank Wizard", poolLabel: "S Rank Job Event", startMonth: 7, startDay: 8, endMonth: 7, endDay: 10 },
  { id: "job-29", kind: "jobs", title: "S Rank Guard", poolLabel: "S Rank Job Event", startMonth: 7, startDay: 15, endMonth: 7, endDay: 17 },
  { id: "job-30", kind: "jobs", title: "S Rank Knight", poolLabel: "S Rank Job Event", startMonth: 7, startDay: 22, endMonth: 7, endDay: 24 },
  { id: "job-31", kind: "jobs", title: "S Rank Mage", poolLabel: "S Rank Job Event", startMonth: 7, startDay: 28, endMonth: 7, endDay: 30 },
  { id: "job-32", kind: "jobs", title: "S Rank Paladin", poolLabel: "S Rank Job Event", startMonth: 8, startDay: 1, endMonth: 8, endDay: 3 },
  { id: "job-33", kind: "jobs", title: "S Rank Gunner", poolLabel: "S Rank Job Event", startMonth: 8, startDay: 8, endMonth: 8, endDay: 10 },
  { id: "job-34", kind: "jobs", title: "S Rank Archer", poolLabel: "S Rank Job Event", startMonth: 8, startDay: 15, endMonth: 8, endDay: 17 },
  { id: "job-35", kind: "jobs", title: "S Rank Ninja", poolLabel: "S Rank Job Event", startMonth: 8, startDay: 22, endMonth: 8, endDay: 24 },
  { id: "job-36", kind: "jobs", title: "S Rank Samurai", poolLabel: "S Rank Job Event", startMonth: 8, startDay: 28, endMonth: 8, endDay: 30 },
  { id: "job-37", kind: "jobs", title: "S Rank Viking", poolLabel: "S Rank Job Event", startMonth: 9, startDay: 1, endMonth: 9, endDay: 3 },
  { id: "job-38", kind: "jobs", title: "S Rank Pirate", poolLabel: "S Rank Job Event", startMonth: 9, startDay: 8, endMonth: 9, endDay: 10 },
  { id: "job-39", kind: "jobs", title: "S Rank Champion", poolLabel: "S Rank Job Event", startMonth: 9, startDay: 15, endMonth: 9, endDay: 17 },
  { id: "job-40", kind: "jobs", title: "S Rank Wizard", poolLabel: "S Rank Job Event", startMonth: 9, startDay: 22, endMonth: 9, endDay: 24 },
  { id: "job-41", kind: "jobs", title: "S Rank Guard", poolLabel: "S Rank Job Event", startMonth: 10, startDay: 1, endMonth: 10, endDay: 3 },
  { id: "job-42", kind: "jobs", title: "S Rank Knight", poolLabel: "S Rank Job Event", startMonth: 10, startDay: 8, endMonth: 10, endDay: 10 },
  { id: "job-43", kind: "jobs", title: "S Rank Mage", poolLabel: "S Rank Job Event", startMonth: 10, startDay: 13, endMonth: 10, endDay: 16 },
  { id: "job-44", kind: "jobs", title: "S Rank Paladin", poolLabel: "S Rank Job Event", startMonth: 10, startDay: 20, endMonth: 10, endDay: 23 },
  { id: "job-45", kind: "jobs", title: "S Rank Gunner", poolLabel: "S Rank Job Event", startMonth: 10, startDay: 26, endMonth: 10, endDay: 30 },
  { id: "job-46", kind: "jobs", title: "S Rank Archer", poolLabel: "S Rank Job Event", startMonth: 11, startDay: 1, endMonth: 11, endDay: 4 },
  { id: "job-47", kind: "jobs", title: "S Rank Ninja", poolLabel: "S Rank Job Event", startMonth: 11, startDay: 8, endMonth: 11, endDay: 11 },
  { id: "job-48", kind: "jobs", title: "S Rank Samurai", poolLabel: "S Rank Job Event", startMonth: 11, startDay: 16, endMonth: 11, endDay: 18 },
  { id: "job-49", kind: "jobs", title: "S Rank Viking", poolLabel: "S Rank Job Event", startMonth: 11, startDay: 23, endMonth: 11, endDay: 25 },
  { id: "job-50", kind: "jobs", title: "S Rank Pirate", poolLabel: "S Rank Job Event", startMonth: 12, startDay: 2, endMonth: 12, endDay: 4 },
  { id: "job-51", kind: "jobs", title: "S Rank Champion", poolLabel: "S Rank Job Event", startMonth: 12, startDay: 7, endMonth: 12, endDay: 9 },
  { id: "job-52", kind: "jobs", title: "S Rank Wizard", poolLabel: "S Rank Job Event", startMonth: 12, startDay: 14, endMonth: 12, endDay: 16 },
  { id: "job-53", kind: "jobs", title: "S Rank Guard", poolLabel: "S Rank Job Event", startMonth: 12, startDay: 21, endMonth: 12, endDay: 24 },
  { id: "job-54", kind: "jobs", title: "S Rank Santa Claus", poolLabel: "Holiday S Rank Job Event", startMonth: 12, startDay: 25, endMonth: 12, endDay: 25, notes: "One-day holiday S-rank job event with a stronger featured focus than the standard rotation." },
  { id: "job-55", kind: "jobs", title: "S Rank Knight", poolLabel: "S Rank Job Event", startMonth: 12, startDay: 28, endMonth: 12, endDay: 31 },
];

const FACILITY_PATTERN: GachaEvent[] = [
  { id: "fac-01", kind: "facilities", title: "S Facility Event", poolLabel: "Featured S facilities", startMonth: 1, startDay: 28, endMonth: 1, endDay: 30, notes: "Featured pool includes High Grade Storage and other top-tier facility rewards." },
  { id: "fac-02", kind: "facilities", title: "S Facility Event", poolLabel: "Featured S facilities", startMonth: 2, startDay: 26, endMonth: 2, endDay: 28, notes: "Featured pool includes High Grade Storage and other top-tier facility rewards." },
  { id: "fac-03", kind: "facilities", title: "S Facility Event", poolLabel: "Featured S facilities", startMonth: 3, startDay: 28, endMonth: 3, endDay: 30, notes: "Featured pool includes High Grade Storage and other top-tier facility rewards." },
  { id: "fac-04", kind: "facilities", title: "S Facility Event", poolLabel: "Featured S facilities", startMonth: 4, startDay: 28, endMonth: 4, endDay: 30, notes: "Featured pool includes High Grade Storage and other top-tier facility rewards." },
  { id: "fac-05", kind: "facilities", title: "S Facility Event", poolLabel: "Featured S facilities", startMonth: 5, startDay: 28, endMonth: 5, endDay: 30, notes: "Featured pool includes High Grade Storage and other top-tier facility rewards." },
  { id: "fac-06", kind: "facilities", title: "S Facility Event", poolLabel: "Featured S facilities", startMonth: 6, startDay: 28, endMonth: 6, endDay: 30, notes: "Featured pool includes High Grade Storage and other top-tier facility rewards." },
  { id: "fac-07", kind: "facilities", title: "S Facility Event", poolLabel: "Featured S facilities", startMonth: 7, startDay: 28, endMonth: 7, endDay: 30, notes: "Featured pool includes High Grade Storage and other top-tier facility rewards." },
  { id: "fac-08", kind: "facilities", title: "S Facility Event", poolLabel: "Featured S facilities", startMonth: 8, startDay: 28, endMonth: 8, endDay: 30, notes: "Featured pool includes High Grade Storage and other top-tier facility rewards." },
  { id: "fac-09", kind: "facilities", title: "S Facility Event", poolLabel: "Featured S facilities", startMonth: 9, startDay: 28, endMonth: 9, endDay: 30, notes: "Featured pool includes High Grade Storage and other top-tier facility rewards." },
  { id: "fac-10", kind: "facilities", title: "S Facility Event", poolLabel: "Featured S facilities", startMonth: 10, startDay: 28, endMonth: 10, endDay: 30, notes: "Featured pool includes High Grade Storage and other top-tier facility rewards." },
  { id: "fac-11", kind: "facilities", title: "S Facility Event", poolLabel: "Featured S facilities", startMonth: 11, startDay: 28, endMonth: 11, endDay: 30, notes: "Featured pool includes High Grade Storage and other top-tier facility rewards." },
  { id: "fac-12", kind: "facilities", title: "S Facility Event", poolLabel: "Featured S facilities", startMonth: 12, startDay: 28, endMonth: 12, endDay: 30, notes: "Featured pool includes High Grade Storage and other top-tier facility rewards." },
];

const ITEM_EVENTS: GachaEvent[] = [
  {
    id: "item-01",
    kind: "items",
    title: "Item Gacha",
    poolLabel: "Default item pool",
    startMonth: 1,
    startDay: 1,
    endMonth: 12,
    endDay: 31,
    notes: "Default item pool. A separate yearly item-event rotation is not shown here yet.",
  },
];

const WEAPON_EVENTS: GachaEvent[] = [
  { id: "kairo-01", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 1, startDay: 5, endMonth: 1, endDay: 10 },
  { id: "kairo-02", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 1, startDay: 20, endMonth: 1, endDay: 25 },
  { id: "kairo-03", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 2, startDay: 5, endMonth: 2, endDay: 10 },
  { id: "kairo-04", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 2, startDay: 20, endMonth: 2, endDay: 25 },
  { id: "kairo-05", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 3, startDay: 5, endMonth: 3, endDay: 10 },
  { id: "kairo-06", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 3, startDay: 20, endMonth: 3, endDay: 25 },
  { id: "kairo-07", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 4, startDay: 5, endMonth: 4, endDay: 10 },
  { id: "kairo-08", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 4, startDay: 20, endMonth: 4, endDay: 25 },
  { id: "kairo-09", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 5, startDay: 5, endMonth: 5, endDay: 10 },
  { id: "kairo-10", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 5, startDay: 20, endMonth: 5, endDay: 25 },
  { id: "kairo-11", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 6, startDay: 5, endMonth: 6, endDay: 10 },
  { id: "kairo-12", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 6, startDay: 20, endMonth: 6, endDay: 25 },
  { id: "kairo-13", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 7, startDay: 5, endMonth: 7, endDay: 10 },
  { id: "kairo-14", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 7, startDay: 20, endMonth: 7, endDay: 25 },
  { id: "kairo-15", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 8, startDay: 5, endMonth: 8, endDay: 10 },
  { id: "kairo-16", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 8, startDay: 20, endMonth: 8, endDay: 25 },
  { id: "kairo-17", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 9, startDay: 5, endMonth: 9, endDay: 10 },
  { id: "kairo-18", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 9, startDay: 20, endMonth: 9, endDay: 25 },
  { id: "kairo-19", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 10, startDay: 5, endMonth: 10, endDay: 10 },
  { id: "kairo-20", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 10, startDay: 20, endMonth: 10, endDay: 25 },
  { id: "kairo-21", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 11, startDay: 5, endMonth: 11, endDay: 10 },
  { id: "kairo-22", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 11, startDay: 20, endMonth: 11, endDay: 25 },
  { id: "kairo-23", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 12, startDay: 5, endMonth: 12, endDay: 10 },
  { id: "kairo-24", kind: "weapons", title: "Kairo Series", poolLabel: "Recurring weapon event", startMonth: 12, startDay: 20, endMonth: 12, endDay: 25 },
  { id: "sweapon-01", kind: "weapons", title: namedWeaponPoolTitle(STAFF_POOL), poolLabel: "One-day S weapon pool", startMonth: 1, startDay: 1, endMonth: 1, endDay: 1, notes: STAFF_POOL.join(" | ") },
  { id: "sweapon-02", kind: "weapons", title: namedWeaponPoolTitle(CLUB_POOL), poolLabel: "One-day S weapon pool", startMonth: 1, startDay: 14, endMonth: 1, endDay: 14, notes: CLUB_POOL.join(" | ") },
  { id: "sweapon-03", kind: "weapons", title: namedWeaponPoolTitle(SPEAR_POOL), poolLabel: "One-day S weapon pool", startMonth: 1, startDay: 28, endMonth: 1, endDay: 28, notes: SPEAR_POOL.join(" | ") },
  { id: "sweapon-04", kind: "weapons", title: namedWeaponPoolTitle(HAMMER_POOL), poolLabel: "One-day S weapon pool", startMonth: 2, startDay: 1, endMonth: 2, endDay: 1, notes: HAMMER_POOL.join(" | ") },
  { id: "sweapon-05", kind: "weapons", title: namedWeaponPoolTitle(SWORD_POOL), poolLabel: "One-day S weapon pool", startMonth: 2, startDay: 14, endMonth: 2, endDay: 14, notes: SWORD_POOL.join(" | ") },
  { id: "sweapon-06", kind: "weapons", title: namedWeaponPoolTitle(GUN_POOL), poolLabel: "One-day S weapon pool", startMonth: 2, startDay: 28, endMonth: 2, endDay: 28, notes: GUN_POOL.join(" | ") },
  { id: "sweapon-07", kind: "weapons", title: namedWeaponPoolTitle(BOW_POOL), poolLabel: "One-day S weapon pool", startMonth: 3, startDay: 1, endMonth: 3, endDay: 1, notes: BOW_POOL.join(" | ") },
  { id: "sweapon-08", kind: "weapons", title: namedWeaponPoolTitle(AXE_POOL), poolLabel: "One-day S weapon pool", startMonth: 3, startDay: 14, endMonth: 3, endDay: 14, notes: AXE_POOL.join(" | ") },
  { id: "sweapon-09", kind: "weapons", title: namedWeaponPoolTitle(STAFF_POOL), poolLabel: "One-day S weapon pool", startMonth: 3, startDay: 28, endMonth: 3, endDay: 28, notes: STAFF_POOL.join(" | ") },
  { id: "sweapon-10", kind: "weapons", title: namedWeaponPoolTitle(CLUB_POOL), poolLabel: "One-day S weapon pool", startMonth: 4, startDay: 1, endMonth: 4, endDay: 1, notes: CLUB_POOL.join(" | ") },
  { id: "sweapon-11", kind: "weapons", title: namedWeaponPoolTitle(SPEAR_POOL), poolLabel: "One-day S weapon pool", startMonth: 4, startDay: 14, endMonth: 4, endDay: 14, notes: SPEAR_POOL.join(" | ") },
  { id: "sweapon-12", kind: "weapons", title: namedWeaponPoolTitle(HAMMER_POOL), poolLabel: "One-day S weapon pool", startMonth: 4, startDay: 28, endMonth: 4, endDay: 28, notes: HAMMER_POOL.join(" | ") },
  { id: "sweapon-13", kind: "weapons", title: namedWeaponPoolTitle(SWORD_POOL), poolLabel: "One-day S weapon pool", startMonth: 5, startDay: 1, endMonth: 5, endDay: 1, notes: SWORD_POOL.join(" | ") },
  { id: "sweapon-14", kind: "weapons", title: namedWeaponPoolTitle(GUN_POOL), poolLabel: "One-day S weapon pool", startMonth: 5, startDay: 14, endMonth: 5, endDay: 14, notes: GUN_POOL.join(" | ") },
  { id: "sweapon-15", kind: "weapons", title: namedWeaponPoolTitle(BOW_POOL), poolLabel: "One-day S weapon pool", startMonth: 5, startDay: 28, endMonth: 5, endDay: 28, notes: BOW_POOL.join(" | ") },
  { id: "sweapon-16", kind: "weapons", title: namedWeaponPoolTitle(AXE_POOL), poolLabel: "One-day S weapon pool", startMonth: 6, startDay: 1, endMonth: 6, endDay: 1, notes: AXE_POOL.join(" | ") },
  { id: "sweapon-17", kind: "weapons", title: namedWeaponPoolTitle(STAFF_POOL), poolLabel: "One-day S weapon pool", startMonth: 6, startDay: 14, endMonth: 6, endDay: 14, notes: STAFF_POOL.join(" | ") },
  { id: "sweapon-18", kind: "weapons", title: namedWeaponPoolTitle(CLUB_POOL), poolLabel: "One-day S weapon pool", startMonth: 6, startDay: 28, endMonth: 6, endDay: 28, notes: CLUB_POOL.join(" | ") },
  { id: "sweapon-19", kind: "weapons", title: namedWeaponPoolTitle(SPEAR_POOL), poolLabel: "One-day S weapon pool", startMonth: 7, startDay: 1, endMonth: 7, endDay: 1, notes: SPEAR_POOL.join(" | ") },
  { id: "sweapon-20", kind: "weapons", title: namedWeaponPoolTitle(HAMMER_POOL), poolLabel: "One-day S weapon pool", startMonth: 7, startDay: 14, endMonth: 7, endDay: 14, notes: HAMMER_POOL.join(" | ") },
  { id: "sweapon-21", kind: "weapons", title: namedWeaponPoolTitle(SWORD_POOL), poolLabel: "One-day S weapon pool", startMonth: 7, startDay: 28, endMonth: 7, endDay: 28, notes: SWORD_POOL.join(" | ") },
  { id: "sweapon-22", kind: "weapons", title: namedWeaponPoolTitle(GUN_POOL), poolLabel: "One-day S weapon pool", startMonth: 8, startDay: 1, endMonth: 8, endDay: 1, notes: GUN_POOL.join(" | ") },
  { id: "sweapon-23", kind: "weapons", title: namedWeaponPoolTitle(BOW_POOL), poolLabel: "One-day S weapon pool", startMonth: 8, startDay: 14, endMonth: 8, endDay: 14, notes: BOW_POOL.join(" | ") },
  { id: "sweapon-24", kind: "weapons", title: namedWeaponPoolTitle(AXE_POOL), poolLabel: "One-day S weapon pool", startMonth: 8, startDay: 28, endMonth: 8, endDay: 28, notes: AXE_POOL.join(" | ") },
  { id: "sweapon-25", kind: "weapons", title: namedWeaponPoolTitle(STAFF_POOL), poolLabel: "One-day S weapon pool", startMonth: 9, startDay: 1, endMonth: 9, endDay: 1, notes: STAFF_POOL.join(" | ") },
  { id: "sweapon-26", kind: "weapons", title: namedWeaponPoolTitle(CLUB_POOL), poolLabel: "One-day S weapon pool", startMonth: 9, startDay: 14, endMonth: 9, endDay: 14, notes: CLUB_POOL.join(" | ") },
  { id: "sweapon-27", kind: "weapons", title: namedWeaponPoolTitle(SPEAR_POOL), poolLabel: "One-day S weapon pool", startMonth: 9, startDay: 28, endMonth: 9, endDay: 28, notes: SPEAR_POOL.join(" | ") },
  { id: "sweapon-28", kind: "weapons", title: namedWeaponPoolTitle(HAMMER_POOL), poolLabel: "One-day S weapon pool", startMonth: 10, startDay: 1, endMonth: 10, endDay: 1, notes: HAMMER_POOL.join(" | ") },
  { id: "sweapon-29", kind: "weapons", title: namedWeaponPoolTitle(SWORD_POOL), poolLabel: "One-day S weapon pool", startMonth: 10, startDay: 14, endMonth: 10, endDay: 14, notes: SWORD_POOL.join(" | ") },
  { id: "sweapon-30", kind: "weapons", title: namedWeaponPoolTitle(GUN_POOL), poolLabel: "One-day S weapon pool", startMonth: 10, startDay: 28, endMonth: 10, endDay: 28, notes: GUN_POOL.join(" | ") },
  { id: "sweapon-31", kind: "weapons", title: namedWeaponPoolTitle(BOW_POOL), poolLabel: "One-day S weapon pool", startMonth: 11, startDay: 1, endMonth: 11, endDay: 1, notes: BOW_POOL.join(" | ") },
  { id: "sweapon-32", kind: "weapons", title: namedWeaponPoolTitle(AXE_POOL), poolLabel: "One-day S weapon pool", startMonth: 11, startDay: 14, endMonth: 11, endDay: 14, notes: AXE_POOL.join(" | ") },
  { id: "sweapon-33", kind: "weapons", title: namedWeaponPoolTitle(STAFF_POOL), poolLabel: "One-day S weapon pool", startMonth: 11, startDay: 28, endMonth: 11, endDay: 28, notes: STAFF_POOL.join(" | ") },
  { id: "sweapon-34", kind: "weapons", title: namedWeaponPoolTitle(CLUB_POOL), poolLabel: "One-day S weapon pool", startMonth: 12, startDay: 1, endMonth: 12, endDay: 1, notes: CLUB_POOL.join(" | ") },
  { id: "sweapon-35", kind: "weapons", title: namedWeaponPoolTitle(HAMMER_POOL), poolLabel: "One-day S weapon pool", startMonth: 12, startDay: 14, endMonth: 12, endDay: 14, notes: HAMMER_POOL.join(" | ") },
  { id: "sweapon-36", kind: "weapons", title: namedWeaponPoolTitle(SWORD_POOL), poolLabel: "One-day S weapon pool", startMonth: 12, startDay: 28, endMonth: 12, endDay: 28, notes: SWORD_POOL.join(" | ") },
];

const ALL_EVENTS: GachaEvent[] = [...JOB_EVENTS, ...FACILITY_PATTERN, ...WEAPON_EVENTS, ...ITEM_EVENTS];

function buildEventWindow(event: GachaEvent, year: number) {
  return {
    startAt: new Date(year, event.startMonth - 1, event.startDay, 0, 0, 0, 0),
    endAt: new Date(year, event.endMonth - 1, event.endDay, 23, 59, 59, 999),
  };
}

function resolveEvent(event: GachaEvent, now: Date): ResolvedEvent {
  const year = now.getFullYear();
  const windows = [buildEventWindow(event, year - 1), buildEventWindow(event, year), buildEventWindow(event, year + 1)];
  const activeWindow = windows.find((window) => window.startAt.getTime() <= now.getTime() && window.endAt.getTime() >= now.getTime());
  const upcomingWindow = windows
    .filter((window) => window.startAt.getTime() > now.getTime())
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
  const chosen = activeWindow ?? upcomingWindow ?? windows[1];
  return {
    ...event,
    startAt: chosen.startAt,
    endAt: chosen.endAt,
    durationDays: Math.floor((chosen.endAt.getTime() - chosen.startAt.getTime()) / 86400000) + 1,
    isActive: chosen.startAt.getTime() <= now.getTime() && chosen.endAt.getTime() >= now.getTime(),
    isUpcoming: chosen.startAt.getTime() > now.getTime(),
  };
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", weekday: "short" }).format(date);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0m";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function eventKindClass(kind: EventKind): string {
  if (kind === "jobs") return "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300";
  if (kind === "facilities") return "bg-lime-500/10 text-lime-700 border-lime-500/30 dark:text-lime-300";
  if (kind === "items") return "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300";
  return "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300";
}

function eventKindLabel(kind: EventKind): string {
  if (kind === "jobs") return "Gacha Job";
  if (kind === "facilities") return "S Facility Event";
  if (kind === "items") return "Gacha Items";
  return "Gacha Weapons";
}

function eventKindIcon(kind: EventKind) {
  if (kind === "jobs") return <Sparkles className="w-4 h-4 text-rose-500" />;
  if (kind === "facilities") return <Wand2 className="w-4 h-4 text-lime-500" />;
  if (kind === "items") return <Package className="w-4 h-4 text-sky-500" />;
  return <Swords className="w-4 h-4 text-amber-500" />;
}

function SectionHeader({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function EventRow({ event, now }: { event: ResolvedEvent; now: Date }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border px-3 py-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={eventKindClass(event.kind)}>
            {event.poolLabel}
          </Badge>
          {event.isActive && (
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300">
              Active now
            </Badge>
          )}
        </div>
        <div className="mt-1 font-medium">{event.title}</div>
        <div className="text-xs text-muted-foreground">
          {formatDate(event.startAt)} to {formatDate(event.endAt)} · {event.durationDays} day{event.durationDays === 1 ? "" : "s"}
        </div>
        {event.notes && <div className="mt-1 text-xs text-muted-foreground max-w-2xl">{event.notes}</div>}
      </div>
      <div className="text-sm font-medium md:text-right">
        {event.isActive ? `Ends in ${formatCountdown(event.endAt.getTime() - now.getTime())}` : `Starts in ${formatCountdown(event.startAt.getTime() - now.getTime())}`}
      </div>
    </div>
  );
}

function CompactEventRow({ event, now }: { event: ResolvedEvent; now: Date }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{event.title}</div>
          <div className="text-xs text-muted-foreground">
            {formatDate(event.startAt)} to {formatDate(event.endAt)} · {event.durationDays} day{event.durationDays === 1 ? "" : "s"}
          </div>
        </div>
        <div className="text-xs font-medium whitespace-nowrap">
          {event.isActive ? `Ends in ${formatCountdown(event.endAt.getTime() - now.getTime())}` : `Starts in ${formatCountdown(event.startAt.getTime() - now.getTime())}`}
        </div>
      </div>
    </div>
  );
}

function PlainEventRow({ event, now }: { event: ResolvedEvent; now: Date }) {
  return (
    <div className="rounded-lg border border-border px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{event.title}</div>
          <div className="text-xs text-muted-foreground">
            {formatDate(event.startAt)} to {formatDate(event.endAt)} · {event.durationDays} day{event.durationDays === 1 ? "" : "s"}
          </div>
          {event.notes && <div className="mt-1 text-xs text-muted-foreground max-w-2xl">{event.notes}</div>}
        </div>
        <div className="text-xs font-medium whitespace-nowrap">
          {event.isActive ? `Ends in ${formatCountdown(event.endAt.getTime() - now.getTime())}` : `Starts in ${formatCountdown(event.startAt.getTime() - now.getTime())}`}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  kind,
  active,
  upcoming,
  now,
}: {
  kind: EventKind;
  active: ResolvedEvent | null;
  upcoming: ResolvedEvent | null;
  now: Date;
}) {
  const focus = active ?? upcoming;
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          {eventKindIcon(kind)}
          <CardTitle className="text-base">{eventKindLabel(kind)}</CardTitle>
        </div>
        <CardDescription>
          {active ? "Active now" : upcoming ? "Upcoming" : "No event shown"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {focus ? (
          <>
            <div className="font-medium">{focus.title}</div>
            <div className="text-xs text-muted-foreground">{focus.poolLabel}</div>
            <div className="text-xs text-muted-foreground">
              {formatDate(focus.startAt)} to {formatDate(focus.endAt)}
            </div>
            <div className="text-xs">
              <span className="font-medium">{active ? "Active now" : "Upcoming"}</span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Starts in:</span>{" "}
              <span className="font-medium">
                {active ? "Already live" : formatCountdown(focus.startAt.getTime() - now.getTime())}
              </span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Time remaining:</span>{" "}
              <span className="font-medium">
                {active ? formatCountdown(focus.endAt.getTime() - now.getTime()) : "Not live yet"}
              </span>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Duration:</span>{" "}
              <span className="font-medium">
                {focus.durationDays} day{focus.durationDays === 1 ? "" : "s"}
              </span>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">No schedule shown yet.</div>
        )}
      </CardContent>
    </Card>
  );
}

export default function GachaEventsPage() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const resolved = useMemo(() => ALL_EVENTS.map((event) => resolveEvent(event, now)), [now]);
  const activeEvents = useMemo(() => resolved.filter((event) => event.isActive), [resolved]);
  const nextOverall = useMemo(
    () =>
      resolved
        .filter((event) => event.isUpcoming)
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0] ?? null,
    [resolved]
  );

  const upcomingJobs = useMemo(
    () => resolved.filter((event) => event.kind === "jobs").sort((a, b) => a.startAt.getTime() - b.startAt.getTime()).slice(0, 12),
    [resolved]
  );
  const facilityEvents = useMemo(
    () => resolved.filter((event) => event.kind === "facilities").sort((a, b) => a.startAt.getTime() - b.startAt.getTime()),
    [resolved]
  );
  const upcomingSWeapons = useMemo(
    () =>
      resolved
        .filter((event) => event.kind === "weapons" && event.poolLabel === "One-day S weapon pool")
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .slice(0, 10),
    [resolved]
  );
  const upcomingKairo = useMemo(
    () =>
      resolved
        .filter((event) => event.kind === "weapons" && event.title === "Kairo Series")
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .slice(0, 4),
    [resolved]
  );
  const summaryByKind = useMemo(() => {
    const kinds: EventKind[] = ["jobs", "weapons", "facilities", "items"];
    return kinds.map((kind) => {
      const scoped = resolved.filter((event) => event.kind === kind).sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
      return {
        kind,
        active: scoped.find((event) => event.isActive) ?? null,
        upcoming: scoped.find((event) => event.isUpcoming) ?? null,
      };
    });
  }, [resolved]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-xl font-bold tracking-tight">Gacha Events</h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Focused event tracker for the parts of gacha that matter most: S-rank jobs, repeating S facility events, and S-weapon days.
        </p>
        <p className="text-xs text-muted-foreground max-w-3xl">
          This page is being kept lightweight on purpose so it can later absorb Weekly Conquest, Job Center, more Wairo Dungeon tracking, Kairo Room, and similar schedule tools without another redesign.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryByKind.map((summary) => (
          <SummaryCard
            key={summary.kind}
            kind={summary.kind}
            active={summary.active}
            upcoming={summary.upcoming}
            now={now}
          />
        ))}
      </div>

      <section className="space-y-3">
        <SectionHeader
          icon={<Sparkles className="w-5 h-5 text-rose-500" />}
          title="S Rank Jobs"
          description="The next featured S-rank job windows from the current yearly rotation."
        />
        <div className="grid gap-2 lg:grid-cols-2">
          {upcomingJobs.map((event) => (
            <CompactEventRow key={event.id} event={event} now={now} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          icon={<Wand2 className="w-5 h-5 text-lime-500" />}
          title="S Facility Event"
          description="Full monthly S facility schedule, including High Grade Storage as one grouped entry plus the other top-tier facility rewards."
        />
        <div className="grid gap-2 md:grid-cols-2">
          {facilityEvents.map((event) => (
            <PlainEventRow key={event.id} event={event} now={now} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <SectionHeader
          icon={<Swords className="w-5 h-5 text-amber-500" />}
          title="S Weapon Events"
          description="One-day S-weapon bonus rows plus the recurring Kairo weapon windows from the equipment gacha."
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Next S Weapon Days</CardTitle>
              <CardDescription>Upcoming one-day featured S weapon pools</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingSWeapons.map((event) => (
                <PlainEventRow key={event.id} event={event} now={now} />
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Kairo Windows</CardTitle>
              <CardDescription>Recurring multi-day weapon banner windows</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingKairo.map((event) => (
                <PlainEventRow key={event.id} event={event} now={now} />
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scope note</CardTitle>
          <CardDescription>What this page is and is not trying to do</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div>This page tracks schedules, durations, and featured pools for the major events.</div>
          <div>It is not trying to be a full odds explorer yet.</div>
        </CardContent>
      </Card>
    </div>
  );
}
