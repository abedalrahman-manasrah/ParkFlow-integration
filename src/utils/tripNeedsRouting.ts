import type { GeoPoint, RouteResult } from '@/types';
import { services } from '@/services';
import { distanceMeters } from './geo';
import type { TripNeedCategory, TripNeedPlace } from './tripNeeds';

export interface TripNeedRouteStop {
  category: TripNeedCategory;
  place: TripNeedPlace;
  satisfiedCategories: TripNeedCategory[];
  addedDistanceMeters: number;
  addedDurationSeconds: number;
  legDistanceMeters: number;
  legDurationSeconds: number;
}

export interface TripNeedsRoutePlan {
  stops: TripNeedRouteStop[];
  matchedCategories: TripNeedCategory[];
  missingCategories: TripNeedCategory[];
  route: RouteResult;
  baseRoute: RouteResult;
  addedDistanceMeters: number;
  addedDurationSeconds: number;
}

const ROUTE_OPTIONS = { mode: 'fastest', snapDestination: true, maxAlternatives: 0 } as const;
const MAX_CANDIDATES_PER_CATEGORY = 5;
const MAX_CANDIDATE_DISTANCE_METERS = 3_800;
const COMBINED_PLACE_DISTANCE_METERS = 90;

const uniqueCoordinates = (coordinates: GeoPoint[]) =>
  coordinates.filter((point, index) =>
    index === 0 ||
    Math.abs(point.latitude - coordinates[index - 1]!.latitude) > 0.000001 ||
    Math.abs(point.longitude - coordinates[index - 1]!.longitude) > 0.000001,
  );

async function routeLeg(from: GeoPoint, to: GeoPoint) {
  return services.routing.getRoute(from, to, ROUTE_OPTIONS);
}

const needKeyForCategory = (category: TripNeedCategory) => category.needKey ?? category.id;

const placeMatchesCategory = (place: TripNeedPlace, category: TripNeedCategory) =>
  place.categoryId === category.id || (place.needKey !== undefined && place.needKey === category.needKey);

const placesForCategory = (places: TripNeedPlace[], category: TripNeedCategory) =>
  places.filter((place) => placeMatchesCategory(place, category));

const nearbyCategoryMatches = (
  place: TripNeedPlace,
  categories: TripNeedCategory[],
  places: TripNeedPlace[],
  matchedNeedKeys: Pick<Set<string>, 'has'>,
) =>
  categories.filter((category) => {
    const key = String(needKeyForCategory(category));
    if (matchedNeedKeys.has(key)) return false;
    return placesForCategory(places, category).some((candidate) =>
      distanceMeters(place.location, candidate.location) <= COMBINED_PLACE_DISTANCE_METERS
    );
  });

export async function planRouteWithNeeds(
  origin: GeoPoint,
  destination: GeoPoint,
  categories: TripNeedCategory[],
  places: TripNeedPlace[],
): Promise<TripNeedsRoutePlan | undefined> {
  if (!categories.length) return undefined;
  const baseRoute = await routeLeg(origin, destination);
  let current = origin;
  let remainingRoute = baseRoute;
  const stops: TripNeedRouteStop[] = [];
  const selectedIds = new Set<string>();
  const matchedByNeedKey = new Map<string, TripNeedCategory>();
  const legRoutes: RouteResult[] = [];

  for (const category of categories) {
    const categoryNeedKey = String(needKeyForCategory(category));
    if (matchedByNeedKey.has(categoryNeedKey)) continue;

    const coveredByExistingStop = stops
      .flatMap((stop) => nearbyCategoryMatches(stop.place, [category], places, matchedByNeedKey))
      [0];
    if (coveredByExistingStop) {
      matchedByNeedKey.set(categoryNeedKey, coveredByExistingStop);
      const existingStop = stops.find((stop) => nearbyCategoryMatches(stop.place, [category], places, new Set()).length > 0);
      existingStop?.satisfiedCategories.push(coveredByExistingStop);
      continue;
    }

    const candidates = places
      .filter((place) => placeMatchesCategory(place, category) && !selectedIds.has(place.id))
      .map((place) => ({
        place,
        distanceFromCurrent: distanceMeters(current, place.location),
        destinationDistance: distanceMeters(place.location, destination),
        coverageCount: nearbyCategoryMatches(place, categories, places, matchedByNeedKey).length,
      }))
      .filter((item) =>
        item.distanceFromCurrent <= MAX_CANDIDATE_DISTANCE_METERS ||
        item.destinationDistance <= MAX_CANDIDATE_DISTANCE_METERS
      )
      .sort((a, b) =>
        b.coverageCount - a.coverageCount ||
        a.distanceFromCurrent + a.destinationDistance -
          (b.distanceFromCurrent + b.destinationDistance)
      )
      .slice(0, MAX_CANDIDATES_PER_CATEGORY);

    let best:
      | {
        place: TripNeedPlace;
        legToStop: RouteResult;
        legToDestination: RouteResult;
        addedDistanceMeters: number;
        addedDurationSeconds: number;
        coverageCount: number;
      }
      | undefined;

    for (const candidate of candidates) {
      const [legToStop, legToDestination] = await Promise.all([
        routeLeg(current, candidate.place.location),
        routeLeg(candidate.place.location, destination),
      ]);
      const addedDistanceMeters = legToStop.distanceMeters + legToDestination.distanceMeters - remainingRoute.distanceMeters;
      const addedDurationSeconds = legToStop.durationSeconds + legToDestination.durationSeconds - remainingRoute.durationSeconds;
      const betterCoverage = candidate.coverageCount > (best?.coverageCount ?? -1);
      const sameCoverage = candidate.coverageCount === best?.coverageCount;
      if (
        !best ||
        betterCoverage ||
        (sameCoverage && (
          addedDurationSeconds < best.addedDurationSeconds ||
          (addedDurationSeconds === best.addedDurationSeconds && addedDistanceMeters < best.addedDistanceMeters)
        ))
      ) {
        best = { place: candidate.place, legToStop, legToDestination, addedDistanceMeters, addedDurationSeconds, coverageCount: candidate.coverageCount };
      }
    }

    if (!best) continue;
    selectedIds.add(best.place.id);
    const satisfiedCategories = nearbyCategoryMatches(best.place, categories, places, matchedByNeedKey);
    if (!satisfiedCategories.some((match) => needKeyForCategory(match) === categoryNeedKey)) {
      satisfiedCategories.unshift(category);
    }
    for (const matchedCategory of satisfiedCategories) {
      matchedByNeedKey.set(String(needKeyForCategory(matchedCategory)), matchedCategory);
    }
    stops.push({
      category,
      place: best.place,
      satisfiedCategories,
      addedDistanceMeters: Math.max(0, best.addedDistanceMeters),
      addedDurationSeconds: Math.max(0, best.addedDurationSeconds),
      legDistanceMeters: best.legToStop.distanceMeters,
      legDurationSeconds: best.legToStop.durationSeconds,
    });
    legRoutes.push(best.legToStop);
    current = best.place.location;
    remainingRoute = best.legToDestination;
  }
  const matchedCategories = [...matchedByNeedKey.values()];
  const missingCategories = categories.filter((category) => !matchedByNeedKey.has(String(needKeyForCategory(category))));

  if (!stops.length) {
    return {
      stops,
      matchedCategories,
      missingCategories,
      baseRoute,
      route: { ...baseRoute, alternatives: [], rejected: [] },
      addedDistanceMeters: 0,
      addedDurationSeconds: 0,
    };
  }
  const finalLeg = await routeLeg(current, destination);
  const routeCoordinates = uniqueCoordinates(legRoutes.flatMap((leg, index) =>
    index === 0 ? leg.coordinates : leg.coordinates.slice(1)
  ).concat(finalLeg.coordinates.slice(1)));
  const totalDistanceMeters = legRoutes.reduce((total, leg) => total + leg.distanceMeters, 0) + finalLeg.distanceMeters;
  const totalDurationSeconds = legRoutes.reduce((total, leg) => total + leg.durationSeconds, 0) + finalLeg.durationSeconds;
  return {
    stops,
    matchedCategories,
    missingCategories,
    baseRoute,
    addedDistanceMeters: Math.max(0, totalDistanceMeters - baseRoute.distanceMeters),
    addedDurationSeconds: Math.max(0, totalDurationSeconds - baseRoute.durationSeconds),
    route: {
      ...finalLeg,
      coordinates: routeCoordinates.length >= 2 ? routeCoordinates : [origin, ...stops.map((stop) => stop.place.location), destination],
      distanceMeters: Math.round(totalDistanceMeters),
      durationSeconds: Math.round(totalDurationSeconds),
      alternatives: [],
      rejected: [],
      closuresOnRoute: legRoutes.flatMap((leg) => leg.closuresOnRoute).concat(finalLeg.closuresOnRoute),
      penaltySeconds: legRoutes.reduce((total, leg) => total + leg.penaltySeconds, 0) + finalLeg.penaltySeconds,
      trafficSegments: undefined,
      trafficSummary: undefined,
    },
  };
}
