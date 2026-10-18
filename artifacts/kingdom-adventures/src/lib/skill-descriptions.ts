import catalog from "@/game-data/native-skill-descriptions.json";
import { SKILL_EFFECT_DETAILS } from "@/game-data/skill-effect-details";

// Normalize typography only; do not guess aliases between different skills.
const key = (name: string) => name.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
const descriptions = new Map<string, string>();
// Recovered consumers supplement misleading or vague original wording. Addresses,
// conditions and native-fixture limits: docs/reverse-engineering/wagon-and-fog.md.
const mechanics = new Map<string, string>();
const evidence = new Map<string, string>();
for (const skill of catalog.skills) {
  if (skill.description) descriptions.set(key(skill.name), skill.description);
  const detail = SKILL_EFFECT_DETAILS[skill.id];
  if (detail) mechanics.set(key(skill.name), detail.description);
  evidence.set(key(skill.name), detail?.evidence ?? "native");
}

/** Original in-game English wording, independent of editable community notes. */
export function getNativeSkillDescription(name: string): string | undefined {
  return descriptions.get(key(name));
}

/** Prefer a traced effect where available; retain original wording for reference. */
export function getSkillDescription(name: string): string | undefined {
  return mechanics.get(key(name)) ?? getNativeSkillDescription(name);
}

export function getSkillDescriptionEvidence(name: string): string {
  return evidence.get(key(name)) ?? "unknown";
}
