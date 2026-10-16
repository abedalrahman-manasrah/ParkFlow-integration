import type { GeoPoint, ParkingZone } from '@/types';
import { distanceMeters } from './geo';
import { isWithinOperatingHours } from './time';
import type { TripNeedCategory, TripNeedPlace } from './tripNeeds';

export interface ParkingRecommendation {
  zone: ParkingZone;
  distanceMeters: number;
  score: number;
  open: boolean;
  restricted: boolean;
  needsWalkingMeters?: number;
  needMatches?: {
    category: TripNeedCategory;
    place?: TripNeedPlace;
    distanceMeters?: number;
  }[];
}

export const PARKING_RECOMMENDATION_WEIGHTS = {
  distance: 1,
  limitedPenalty: 250,
  unknownPenalty: 450,
  fullPenalty: 5_000,
  closedPenalty: 3_000,
  restrictedPenalty: 6_000,
  pricePerIlsPenalty: 60,
  needWalkingDistance: 1.2,
  missingNeedPenalty: 900,
  maxCandidateDistanceMeters: 3_500,
} as const;

export interface ParkingRecommendationOptions {
  needCategories?: TripNeedCategory[];
  needPlaces?: TripNeedPlace[];
}

export function rankParkingForDestination(
  destination: GeoPoint,
  zones: ParkingZone[],
  now = new Date(),
  options: ParkingRecommendationOptions = {},
): ParkingRecommendation[] {
  const deduped = [...new Map(zones.map((zone) => [zone.id, zone])).values()];
  return deduped
    .map((zone): ParkingRecommendation => {
      const distance = distanceMeters(destination, zone.location);
      const open = isWithinOperatingHours(zone.operatingHours, now);
      const restricted = zone.parkingAllowed === false || Boolean(zone.accessRestriction);
      const needMatches = options.needCategories?.map((category) => {
        const places = options.needPlaces?.filter((place) => place.categoryId === category.id) ?? [];
        const best = places
          .map((place) => ({ place, distanceMeters: distanceMeters(zone.location, place.location) }))
          .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
        return { category, place: best?.place, distanceMeters: best?.distanceMeters };
      }) ?? [];
      const needsWalkingMeters = needMatches.reduce((total, match) => total + (match.distanceMeters ?? 0), 0);
      const missingNeeds = needMatches.filter((match) => !match.place).length;
      const availabilityPenalty =
        zone.availability === 'full' ? PARKING_RECOMMENDATION_WEIGHTS.fullPenalty
          : zone.availability === 'limited' ? PARKING_RECOMMENDATION_WEIGHTS.limitedPenalty
            : zone.availability === 'unknown' ? PARKING_RECOMMENDATION_WEIGHTS.unknownPenalty
              : 0;
      const score =
        distance * PARKING_RECOMMENDATION_WEIGHTS.distance +
        availabilityPenalty +
        (open ? 0 : PARKING_RECOMMENDATION_WEIGHTS.closedPenalty) +
        (restricted ? PARKING_RECOMMENDATION_WEIGHTS.restrictedPenalty : 0) +
        zone.tariff.hourlyRate / 100 * PARKING_RECOMMENDATION_WEIGHTS.pricePerIlsPenalty +
        needsWalkingMeters * PARKING_RECOMMENDATION_WEIGHTS.needWalkingDistance +
        missingNeeds * PARKING_RECOMMENDATION_WEIGHTS.missingNeedPenalty;
      return { zone, distanceMeters: distance, score, open, restricted, needsWalkingMeters, needMatches };
    })
    .filter((item) => item.distanceMeters <= PARKING_RECOMMENDATION_WEIGHTS.maxCandidateDistanceMeters)
    .sort((a, b) => a.score - b.score)
    .slice(0, 6);
}
