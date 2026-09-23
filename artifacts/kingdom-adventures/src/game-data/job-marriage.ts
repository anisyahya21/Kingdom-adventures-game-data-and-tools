export { normJob, pairKey } from "./job-normalization";

export type MarriageRank = "S" | "A" | "B" | "C" | "D";

export const MARRIAGE_RANKS: MarriageRank[] = ["S", "A", "B", "C", "D"];

// The bundled catalog protects readers from an empty or partially seeded shared state.
export function completeMarriagePairs<T>(candidate: T[] | undefined, bundled: T[]): T[] {
  return candidate && candidate.length >= bundled.length * 0.8 ? candidate : bundled;
}
