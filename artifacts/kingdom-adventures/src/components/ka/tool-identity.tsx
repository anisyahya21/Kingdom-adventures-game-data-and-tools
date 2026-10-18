import { HomeToolArtwork, type HomeArtworkStyle, type HomeCombatArtwork } from "./home-tool-artwork";
import { useArtworkPreference } from "@/hooks/use-artwork-preference";
import chaosStoneSpriteUrl from "../../../../../website_icons/facilities_confirmed/facility_191_chaos_stone.png";

// Navigation artwork only; no equipment, facility or job-mechanics relationships.
export const NATIVE_TOOL_ARTWORK: Record<string, string> = {
  "/jobs-marriage": "/website_icons/items/item_007.png",
  "/equipment": "/website_icons/equipment/equip_092.png",
  "/survey": "/website_icons/requested/survey_button_00.png",
  "/skills": "/website_icons/skills/skill_icon_06.png",
  "/combat": "/website_icons/requested/conquest_member_icon.png",
  "/eggs-pets-monsters": "/website_icons/eggs/egg_7.png",
  "/chaos-setup-lab": chaosStoneSpriteUrl,
  "/shops": "/website_icons/menu/menu_shop_cropped.png",
  "/research": "/website_icons/menu/menu_research_cropped.png",
  "/training-facilities": "/website_icons/menu/menu_train_cropped.png",
  "/houses": "/website_icons/menu/menu_build_cropped.png",
  "/timed-events": "/website_icons/requested/campaign_complete.png",
  "/guides": "/website_icons/valuable/know_how_journal.png",
  "/add-friends": "/website_icons/items/item_011.png",
};
// These native assets are UI illustrations, not claims about rewards or equipment access.
Object.assign(NATIVE_TOOL_ARTWORK, {
  "/items-reference": "/website_icons/menu/menu_list_cropped.png",
  "/equipment-stats": "/website_icons/equipment/equip_092.png",
  "/equipment-exchange": "/website_icons/equipment/equip_200.png",
  "/equipment-leveling-optimizer": "/website_icons/equipment/equip_005.png",
  "/match-finder": "/website_icons/requested/child_mark.png",
  "/eggs": "/website_icons/eggs/egg_7.png",
  "/monsters-pets": "/monster-sprites/9.png",
  "/monster-spawns": "/website_icons/requested/explore_mark.png",
  "/monster-pet-stats": "/monster-sprites/9.png",
  "/monster-xp": "/website_icons/requested/rankup_button.png",
  "/combat/character-builder": "/website_icons/requested/assign_button.png",
  "/combat/multi-box": "/treasure-icons/54.png",
  "/combat/formulas": "/website_icons/skills/skill_icon_06.png",
  "/houses/plots": "/website_icons/menu/menu_build_cropped.png",
  "/houses/facilities": "/website_icons/menu/menu_train_cropped.png",
  "/guides/stat-effects": "/website_icons/valuable/know_how_journal.png",
  "/playthrough-guide": "/website_icons/menu/menu_research_cropped.png",
});
const ROUTE_ARTWORK: Record<string, string> = {
  "/jobs": "/jobs-marriage", "/jobs-marriage": "/jobs-marriage", "/match-finder": "/match-finder",
  "/equipment": "/equipment", "/equipment-stats": "/equipment-stats", "/equipment-exchange": "/equipment-exchange", "/equipment-leveling-optimizer": "/equipment-leveling-optimizer",
  "/eggs-pets-monsters": "/eggs-pets-monsters", "/eggs": "/eggs", "/monsters-pets": "/monsters-pets", "/monster-spawns": "/monster-spawns", "/monster-pet-stats": "/monster-pet-stats", "/monster-xp": "/monster-xp",
  "/combat": "/combat", "/combat/character-builder": "/combat/character-builder", "/combat/multi-box": "/combat/multi-box", "/combat/formulas": "/combat/formulas",
  "/shops": "/shops", "/shops/items-reference": "/items-reference", "/items-reference": "/items-reference", "/item-sources": "/items-reference",
  "/guides/stat-effects": "/guides/stat-effects",
  "/houses/plots": "/houses/plots", "/houses/facilities": "/houses/facilities",
  "/skills": "/skills", "/survey": "/survey", "/research": "/research", "/training-facilities": "/training-facilities", "/houses": "/houses", "/chaos-setup-lab": "/chaos-setup-lab",
  "/timed-events": "/timed-events", "/guides": "/guides", "/playthrough-guide": "/playthrough-guide", "/add-guide": "/guides", "/add-friends": "/add-friends",
};
export function getToolArtworkKey(href: string): string | undefined {
  return ROUTE_ARTWORK[href.split(/[?#]/)[0]];
}
export function ToolIdentityArtwork({ artworkKey, size = 40, artworkStyle, combatArtwork }: {
  artworkKey: string; size?: number; artworkStyle?: HomeArtworkStyle; combatArtwork?: HomeCombatArtwork;
}) {
  const [game] = useArtworkPreference();
  return <HomeToolArtwork source={NATIVE_TOOL_ARTWORK[artworkKey] ?? ""} toolKey={artworkKey} size={size} style={artworkStyle ?? (game ? "game" : "mixed")} combatArtwork={combatArtwork} />;
}
