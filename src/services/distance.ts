/**
 * No geocoding provider is wired this phase — this stub never fabricates a
 * distance. It only ever returns what the caller explicitly supplied
 * (nothing does yet, since no UI collects a location), so travel
 * adjustments stay architecturally real but inert until a real provider
 * and a location-collecting UI both exist.
 */

export interface DistanceContext {
  approximateDistanceKm?: number | null;
}

export interface DistanceResult {
  distanceKm: number | null;
}

export function getDistance(context: DistanceContext): DistanceResult {
  return { distanceKm: context.approximateDistanceKm ?? null };
}
