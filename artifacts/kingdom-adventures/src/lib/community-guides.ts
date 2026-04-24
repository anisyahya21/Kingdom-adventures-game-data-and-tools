import { apiUrl } from "@/lib/api";

export type CommunityGuide = {
  id: string;
  slug: string;
  title: string;
  author: string;
  docUrl: string;
  docId: string;
  createdAt: number;
  updatedAt: number;
};

const OWNER_KEY = "ka_community_guide_owner_tokens";

export function getGuideOwnerTokens(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(OWNER_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function setGuideOwnerToken(guideId: string, token: string) {
  const current = getGuideOwnerTokens();
  current[guideId] = token;
  localStorage.setItem(OWNER_KEY, JSON.stringify(current));
}

export function removeGuideOwnerToken(guideId: string) {
  const current = getGuideOwnerTokens();
  delete current[guideId];
  localStorage.setItem(OWNER_KEY, JSON.stringify(current));
}

export function extractGoogleDocId(url: string) {
  return url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? "";
}

export async function fetchCommunityGuides() {
  const response = await fetch(apiUrl("/guides"));
  if (!response.ok) throw new Error("Could not load guides.");
  return await response.json() as { guides: CommunityGuide[] };
}
