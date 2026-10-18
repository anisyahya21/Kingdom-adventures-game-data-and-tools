export type ResearchStats = [number, number, number, number];

export interface ResearchBankGroup {
  id: string;
  encounter: number;
  stats: ResearchStats;
  profileId: string | null;
  cohortId: string | null;
  finishPolicy: string | null;
  formationId: string | null;
  rewardMeasurementMethod: string | null;
  provenanceHash: string;
  seedRange?: string | null;
  n: number;
  mean: number;
  highest: number;
  median: number;
  low: number;
  defeats: number;
  meanDpsMp: number | null;
  meanHealerMp: number | null;
}

interface ResearchBankFile {
  schema: string;
  encounter: number;
  inputManifestSha256: string;
  groups: ResearchBankGroup[];
}

const cache = new Map<number, Promise<ResearchBankGroup[]>>();
const loadedGroups = new Map<number, ResearchBankGroup[]>();
const exactIndex = new Map<number, Map<string, ResearchBankGroup>>();

export function loadResearchBank(encounter: number): Promise<ResearchBankGroup[]> {
  const existing = cache.get(encounter);
  if (existing) return existing;
  const url = `${import.meta.env?.BASE_URL ?? "/"}research-strategy-bank/encounter-${String(encounter).padStart(2, "0")}.json`;
  const request = fetch(url).then(async (response) => {
    if (!response.ok) throw new Error(`Measured results are unavailable for encounter ${encounter} (HTTP ${response.status}).`);
    const data = await response.json() as ResearchBankFile;
    if (data.schema !== "ka-full-combat-hub-encounter-catalog-v1" || data.encounter !== encounter || !Array.isArray(data.groups)) {
      throw new Error("The measured-results file has an unsupported or invalid format.");
    }
    if (!data.groups.every((group) => isValidGroup(group, encounter)) || new Set(data.groups.map(group => group.id)).size !== data.groups.length) {
      throw new Error("The measured-results file contains an invalid cohort record.");
    }
    loadedGroups.set(encounter, data.groups);
    const index = new Map<string, ResearchBankGroup>();
    for (const group of data.groups) {
      const key = group.stats.join(":"), prior = index.get(key);
      if (!prior || group.n > prior.n || group.n === prior.n && group.id.localeCompare(prior.id) < 0) index.set(key, group);
    }
    exactIndex.set(encounter, index);
    return data.groups;
  }).catch((error: unknown) => {
    cache.delete(encounter);
    loadedGroups.delete(encounter);
    exactIndex.delete(encounter);
    throw error;
  });
  cache.set(encounter, request);
  return request;
}

export async function getResearchGroup(encounter: number, id: string): Promise<ResearchBankGroup | null> {
  return (await loadResearchBank(encounter)).find((group) => group.id === id) ?? null;
}

export function findResearchMeasurement(encounter: number, statsRecord: number[] | Record<string, number>): ResearchBankGroup | null {
  const loaded = exactIndex.get(encounter);
  if (!loaded) return null;
  const stats: number[] = Array.isArray(statsRecord)
    ? statsRecord
    : [statsRecord.atk ?? statsRecord.att, statsRecord.spd, statsRecord.lck ?? statsRecord.luck, statsRecord.dex];
  if (stats.length !== 4 || stats.some((value) => !Number.isFinite(value))) return null;
  // Exact stat tuple only; repeated independent cohorts remain separate. Prefer
  // the largest single sample, then stable ID order, never the largest mean.
  return loaded.get(stats.join(":")) ?? null;
}

function isValidGroup(value: unknown, encounter: number): value is ResearchBankGroup {
  if (!value || typeof value !== "object") return false;
  const group = value as Partial<ResearchBankGroup>;
  return (group.encounter === undefined || group.encounter === encounter)
    && typeof group.id === "string" && group.id.length > 0
    && Array.isArray(group.stats) && group.stats.length === 4
    && group.stats.every((stat) => Number.isFinite(stat) && Number.isInteger(stat) && stat >= 0)
    && Number.isInteger(group.n) && Number(group.n) >= 1
    && [group.mean, group.highest, group.median, group.low, group.defeats].every(Number.isFinite)
    && Number(group.low) >= 0 && Number(group.low) <= Number(group.n)
    && Number(group.defeats) >= 0 && Number(group.defeats) <= Number(group.n)
    && (group.meanDpsMp === null || Number.isFinite(group.meanDpsMp))
    && (group.meanHealerMp === null || Number.isFinite(group.meanHealerMp))
    && typeof group.provenanceHash === "string";
}
