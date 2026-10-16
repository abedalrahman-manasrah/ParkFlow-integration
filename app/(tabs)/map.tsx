import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Reveal } from '@/components/ui';
import { MapSurface } from '@/components/map/MapSurface';
import type { MapCheckpoint, MapRoute, MapSurfaceHandle } from '@/components/map/types';
import { MapTopBar } from '@/components/map/MapTopBar';
import { MapControlRail } from '@/components/map/MapControlRail';
import { NearbyParkingPanel } from '@/components/map/NearbyParkingPanel';
import type { NearbyZone } from '@/components/map/CompactZoneCard';
import { CompactRoutePanel } from '@/components/map/CompactRoutePanel';
import { TestLocationControl } from '@/components/map/TestLocationControl';
import { VehicleSelectorSheet } from '@/components/domain/VehicleSelectorSheet';
import { ZoneSheet } from '@/components/domain/ZoneSheet';
import { ActiveSessionBanner } from '@/components/domain/ActiveSessionBanner';
import { ZoneCodeSheet } from '@/components/domain/ZoneCodeSheet';
import { RoadReportLocationPanel } from '@/components/map/RoadReportLocationPanel';
import { RoadReportCreationSheet, type ReportCreationStep } from '@/components/map/RoadReportCreationSheet';
import { RoadReportDetailsSheet } from '@/components/map/RoadReportDetailsSheet';
import { MapLayersSheet } from '@/components/map/MapLayersSheet';
import { EvStationDetailsSheet } from '@/components/map/EvStationDetailsSheet';
import { EvFiltersSheet } from '@/components/map/EvFiltersSheet';
import { EvMapStatus } from '@/components/map/EvMapStatus';
import { CarServiceDetailsSheet } from '@/components/map/CarServiceDetailsSheet';
import { CarServiceMapStatus } from '@/components/map/CarServiceMapStatus';
import { useWarningServiceNavigationStore } from '@/store/warningServiceNavigationStore';
import { useCarServicesStore } from '@/store/carServicesStore';
import { TourismPlaceDetailsSheet } from '@/components/map/TourismPlaceDetailsSheet';
import { TourismPlaceMapStatus } from '@/components/map/TourismPlaceMapStatus';
import { DestinationSearchBox } from '@/components/map/DestinationSearchBox';
import { DestinationParkingPanel } from '@/components/map/DestinationParkingPanel';
import { useEvStations } from '@/hooks/useEvStations';
import { useCarServices } from '@/hooks/useCarServices';
import { useTourismPlaces } from '@/hooks/useTourismPlaces';
import { carServiceDestination, evDestination, parkingDestination, placeDestination, tourismPlaceDestination, type CarServiceBusiness, type EvChargingStation, type RouteDestination, type TourismPlace, type TourismPlaceCategory } from '@/types';

import { useTheme } from '@/theme/ThemeProvider';
import { spacing, screenPadding } from '@/theme/spacing';
import { useLocale } from '@/hooks/useLocale';
import { useSelectedVehicle } from '@/hooks/useVehicles';
import { useActiveSessions, useZones } from '@/hooks/useParking';
import { useCheckpoints, useRoute } from '@/hooks/useCommunity';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useCreateRoadReport, useRoadReports } from '@/hooks/useRoadReports';
import { DEFAULT_REGION, services } from '@/services';
import type { CreateRoadReportInput, GeoPoint, GeoRegion, ParkingZone, RamallahParkingLocation, RoadReport, RoadReportType, RouteResult } from '@/types';
import { distanceMeters, distanceToPolyline } from '@/utils/geo';
import { assessRouteAlternatives } from '@/utils/routeImpact';
import { haptics } from '@/utils/haptics';
import { isValidGeoPoint, normalizeGeoPoint, normalizeGeoPoints } from '@/utils/coordinates';
import { searchPlaces, type PlaceSuggestion } from '@/services/placeSearchService';
import { rankParkingForDestination } from '@/utils/parkingRecommendation';
import { formatNeedLabels, freeTextNeedCategories, parseTripNeedSemanticText, parseTripNeeds, tripNeedCategoryMatchesTerm, type TripNeedCategory, type TripNeedFreeText, type TripNeedPlace } from '@/utils/tripNeeds';
import { planRouteWithNeeds, type TripNeedsRoutePlan } from '@/utils/tripNeedsRouting';
import { useMapLayersStore } from '@/store/mapLayersStore';
import { useReservationRouteStore } from '@/store/reservationRouteStore';
import {
  ramallahParkingLocations,
  ramallahParkingZoneIds,
  ramallahParkingZones,
} from '@/data/ramallahParking';

/** Clears the custom floating tab bar, including the native bottom safe area. */
const TAB_BAR_CLEARANCE = 72;
/** The control rail starts just below the compact vehicle row. */
const CONTROL_RAIL_TOP = 64;

const FASTEST_PARKING_ROUTE = {
  mode: 'fastest',
  snapDestination: true,
  maxAlternatives: 2,
} as const;

type TripNeedsMode = 'idle' | 'choosing' | 'parking' | 'route';
type RouteNeedsDisplayMode = 'needs' | 'shortest';

/** ~10 m precision keeps GPS jitter from producing new route queries. */
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
const ROUTE_SHARED_TOLERANCE_METERS = 25;
const MIN_DETOUR_SEGMENT_METERS = 45;
const NEED_STOP_DETOUR_RADIUS_METERS = 90;

function routeLength(points: GeoPoint[]) {
  return points.reduce((total, point, index) =>
    index === 0 ? 0 : total + distanceMeters(points[index - 1]!, point), 0);
}

function routeDetourSegments(
  needAware: GeoPoint[],
  shortest: GeoPoint[],
  needStops: GeoPoint[] = [],
) {
  if (needAware.length < 2 || shortest.length < 2) return [];
  const offShortestNeedStops = needStops.filter((stop) =>
    distanceToPolyline(stop, shortest) > ROUTE_SHARED_TOLERANCE_METERS
  );
  const groups: GeoPoint[][] = [];
  let current: GeoPoint[] = [];

  for (let index = 1; index < needAware.length; index += 1) {
    const start = needAware[index - 1]!;
    const end = needAware[index]!;
    const midpoint = {
      latitude: (start.latitude + end.latitude) / 2,
      longitude: (start.longitude + end.longitude) / 2,
    };
    const shared = [start, midpoint, end].every((point) =>
      distanceToPolyline(point, shortest) <= ROUTE_SHARED_TOLERANCE_METERS
    );
    const servesOffRouteNeed = offShortestNeedStops.some((stop) =>
      [start, midpoint, end].some((point) => distanceMeters(point, stop) <= NEED_STOP_DETOUR_RADIUS_METERS)
    );

    if (shared && !servesOffRouteNeed) {
      if (current.length >= 2 && routeLength(current) >= MIN_DETOUR_SEGMENT_METERS) {
        groups.push(current);
      }
      current = [];
    } else {
      if (!current.length) current = [start];
      current.push(end);
    }
  }

  if (current.length >= 2 && routeLength(current) >= MIN_DETOUR_SEGMENT_METERS) {
    groups.push(current);
  }
  return groups;
}

export default function MapScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, locale } = useLocale();
  const insets = useSafeAreaInsets();

  const mapRef = useRef<MapSurfaceHandle>(null);
  const routeStartInFlightRef = useRef(false);
  const [mapFocused, setMapFocused] = useState(false);
  const [region, setRegion] = useState<GeoRegion>(DEFAULT_REGION);
  const [selectedZoneId, setSelectedZoneId] = useState<string>();
  const [routeTarget, setRouteTarget] = useState<RouteDestination>();
  const routeZone = routeTarget?.type === 'parking' ? routeTarget.zone : undefined;
  const [evFiltersOpen, setEvFiltersOpen] = useState(false);
  const [routeOriginOverride, setRouteOriginOverride] = useState<GeoPoint>();
  const [testLocationMode, setTestLocationMode] = useState(
    () => useReservationRouteStore.getState().originMode === 'test',
  );
  const [testLocation, setTestLocation] = useState<GeoPoint | undefined>(() => {
    const state = useReservationRouteStore.getState();
    return state.originMode === 'test' ? normalizeGeoPoint(state.origin) : undefined;
  });
  const [vehicleSheetOpen, setVehicleSheetOpen] = useState(false);
  const [codeSheetOpen, setCodeSheetOpen] = useState(false);
  const [entryMenuOpen, setEntryMenuOpen] = useState(false);
  const [nearbyExpanded, setNearbyExpanded] = useState(false);
  const [routeDetailsExpanded, setRouteDetailsExpanded] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState('current');
  const [alternativeDismissed, setAlternativeDismissed] = useState(false);
  const [locationMessage, setLocationMessage] = useState<string>();
  const [reportStep, setReportStep] = useState<ReportCreationStep>();
  const [reportLocationPicking, setReportLocationPicking] = useState(false);
  const [reportDraft, setReportDraft] = useState<Partial<CreateRoadReportInput>>({});
  const [selectedReport, setSelectedReport] = useState<RoadReport>();
  const [layersSheetOpen, setLayersSheetOpen] = useState(false);
  const [destinationQuery, setDestinationQuery] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState<PlaceSuggestion[]>([]);
  const [placeSearchLoading, setPlaceSearchLoading] = useState(false);
  const [placeSearchError, setPlaceSearchError] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<PlaceSuggestion>();
  const [tripNeedsExpanded, setTripNeedsExpanded] = useState(false);
  const [tripNeedsAppliedText, setTripNeedsAppliedText] = useState('');
  const [tripNeedsMode, setTripNeedsMode] = useState<TripNeedsMode>('idle');
  const [tripNeedCategories, setTripNeedCategories] = useState<TripNeedCategory[]>([]);
  const [tripNeedFreeText, setTripNeedFreeText] = useState<TripNeedFreeText[]>([]);
  const [tripNeedPlaces, setTripNeedPlaces] = useState<TripNeedPlace[]>([]);
  const [tripNeedsLoading, setTripNeedsLoading] = useState(false);
  const [tripNeedsError, setTripNeedsError] = useState(false);
  const [routeNeedsPlan, setRouteNeedsPlan] = useState<TripNeedsRoutePlan>();
  const [activeRouteNeedsPlan, setActiveRouteNeedsPlan] = useState<TripNeedsRoutePlan>();
  const [routeNeedsDisplayMode, setRouteNeedsDisplayMode] = useState<RouteNeedsDisplayMode>('needs');
  const [routeNeedsLoading, setRouteNeedsLoading] = useState(false);
  const [routeNeedsError, setRouteNeedsError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setMapFocused(true);
      const navigation = useWarningServiceNavigationStore.getState();
      if (navigation.pending) {
        const service = navigation.pending;
        const next = { latitude: service.latitude, longitude: service.longitude, latitudeDelta: 0.025, longitudeDelta: 0.025 };
        setRegion(next);
        mapRef.current?.animateToRegion(next, 450);
        useCarServicesStore.getState().select(service);
        setSelectedZoneId(undefined);
        setSelectedReport(undefined);
        setRouteTarget(undefined);
        setReportStep(undefined);
        setReportLocationPicking(false);
        setLayersSheetOpen(false);
        setVehicleSheetOpen(false);
        setCodeSheetOpen(false);
        setEvFiltersOpen(false);
        setEntryMenuOpen(false);
        navigation.clear();
      }
      return () => setMapFocused(false);
    }, []),
  );

  const primaryMapCategory = useMapLayersStore((state) => state.primaryCategory);
  const carServiceCategory = useMapLayersStore((state) => state.carServiceCategory);
  const tourismPlaceCategories = useMapLayersStore((state) => state.tourismPlaceCategories);
  const pendingReservationRouteZoneId = useReservationRouteStore((state) => state.pendingZoneId);
  const storedRouteOrigin = useReservationRouteStore((state) => state.origin);
  const storedRouteOriginMode = useReservationRouteStore((state) => state.originMode);
  const evActive = primaryMapCategory === 'ev_charging';
  const ev = useEvStations(evActive, region);
  const carServicesActive = primaryMapCategory === 'car_services';
  const carServices = useCarServices(carServicesActive, region, carServiceCategory);
  const tourismPlacesActive = primaryMapCategory === 'tourism_places';
  const tourismPlaces = useTourismPlaces(tourismPlacesActive, region, tourismPlaceCategories);
  useEffect(() => { if (!evActive) setEvFiltersOpen(false); }, [evActive]);
  const roadReportsEnabled = useMapLayersStore((state) => state.roadReportsEnabled);
  const businessOffersEnabled = useMapLayersStore((state) => state.businessOffersEnabled);
  const accessibleParkingOnly = useMapLayersStore((state) => state.accessibleParkingOnly);
  const enabledLayerCount = 1 + Number(roadReportsEnabled) + Number(businessOffersEnabled);

  const { vehicles, selected, select } = useSelectedVehicle();
  const { data: zones = [], isPending: zonesPending, isError: zonesError, refetch: refetchZones } = useZones();
  const { data: activeSessions = [] } = useActiveSessions();
  const { data: checkpoints = [] } = useCheckpoints();
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  // Location is deliberately opt-in: Ramallah remains the opening view until locate is pressed.
  const { location, status: locationStatus, request: requestLocation } = useUserLocation(false);
  const reportBounds = useMemo(() => ({
    north: round4(Math.min(90, region.latitude + region.latitudeDelta / 2)),
    south: round4(Math.max(-90, region.latitude - region.latitudeDelta / 2)),
    east: round4(Math.min(180, region.longitude + region.longitudeDelta / 2)),
    west: round4(Math.max(-180, region.longitude - region.longitudeDelta / 2)),
  }), [region]);
  const { data: roadReports = [] } = useRoadReports(reportBounds);
  const createReport = useCreateRoadReport();
  const selectedZone = useMemo(
    () =>
      zones.find((zone) => zone.id === selectedZoneId) ??
      ramallahParkingZones.find((zone) => zone.id === selectedZoneId),
    [selectedZoneId, zones],
  );

  useEffect(() => {
    setSelectedZoneId(undefined);
  }, [primaryMapCategory]);

  useEffect(() => {
    if (!roadReportsEnabled) setSelectedReport(undefined);
  }, [roadReportsEnabled]);

  const bannerSession = useMemo(
    () => activeSessions.find((session) => session.vehicleId === selected?.id) ?? activeSessions[0],
    [activeSessions, selected?.id],
  );
  const bannerVehicle = vehicles.find((vehicle) => vehicle.id === bannerSession?.vehicleId);
  const activeVehicleIds = activeSessions.map((session) => session.vehicleId);

  const nearbyOrigin = useMemo<GeoPoint>(
    () =>
      testLocation ??
      location ?? { latitude: region.latitude, longitude: region.longitude },
    [testLocation, location, region.latitude, region.longitude],
  );
  const nearbyZones = useMemo<NearbyZone[]>(
    () =>
      zones
        .filter((zone) => !accessibleParkingOnly || (zone.accessibleSpots ?? 0) > 0)
        .map((zone) => ({ zone, distanceMeters: distanceMeters(nearbyOrigin, zone.location) }))
        .sort((a, b) => a.distanceMeters - b.distanceMeters),
    [zones, nearbyOrigin, accessibleParkingOnly],
  );
  const mapZones = useMemo(
    () => nearbyZones.filter(({ zone }) => !ramallahParkingZoneIds.has(zone.id)),
    [nearbyZones],
  );
  const allTripNeedCategories = useMemo(
    () => {
      const freeTextCategories = freeTextNeedCategories(tripNeedFreeText);
      const semanticTerms = tripNeedFreeText.map((term) => term.normalized);
      const mappedCategories = tripNeedCategories.filter((category) =>
        !semanticTerms.some((term) => tripNeedCategoryMatchesTerm(category, term))
      );
      return [...mappedCategories, ...freeTextCategories];
    },
    [tripNeedCategories, tripNeedFreeText],
  );
  const destinationRecommendations = useMemo(
    () => selectedDestination
      ? rankParkingForDestination(
        selectedDestination.location,
        [...zones, ...ramallahParkingZones],
        new Date(),
        {
          needCategories: tripNeedsMode === 'parking' ? allTripNeedCategories : [],
          needPlaces: tripNeedsMode === 'parking' ? tripNeedPlaces : [],
        },
      )
      : [],
    [allTripNeedCategories, selectedDestination, tripNeedPlaces, tripNeedsMode, zones],
  );
  const tripNeedsNoMatches = Boolean(
    tripNeedsAppliedText &&
    allTripNeedCategories.length > 0 &&
    !tripNeedsLoading &&
    !tripNeedsError &&
    tripNeedPlaces.length === 0,
  );

  useEffect(() => {
    if (!selectedDestination || allTripNeedCategories.length === 0) {
      setTripNeedPlaces([]);
      setTripNeedsLoading(false);
      setTripNeedsError(false);
      return;
    }
    let cancelled = false;
    const center = selectedDestination.location;
    const radiusMeters = 2_800;
    const latDelta = radiusMeters / 111_320;
    const lonDelta = radiusMeters / (111_320 * Math.max(0.25, Math.cos(center.latitude * Math.PI / 180)));
    const bounds = {
      north: Math.min(90, center.latitude + latDelta),
      south: Math.max(-90, center.latitude - latDelta),
      east: Math.min(180, center.longitude + lonDelta),
      west: Math.max(-180, center.longitude - lonDelta),
    };
    setTripNeedsLoading(true);
    setTripNeedsError(false);
    Promise.all(allTripNeedCategories.flatMap((category) => {
      const placeSearches = category.searchQueries.map((query) =>
        searchPlaces(query, { center, radiusMeters, limit: 5 })
          .then((places): TripNeedPlace[] => places.map((place) => ({
            id: `${category.id}:${place.id}`,
            categoryId: category.id,
            needKey: category.needKey,
            labelAr: category.labelAr,
            labelEn: category.labelEn,
            name: place.name,
            nameAr: place.nameAr,
            nameEn: place.nameEn,
            location: place.location,
            source: 'place',
          }))),
      );
      const serviceSearch = category.carServiceCategory
        ? services.carServices.list(bounds, { category: category.carServiceCategory })
          .then((result): TripNeedPlace[] => result.services
            .filter((service) => isValidGeoPoint({ latitude: service.latitude, longitude: service.longitude }))
            .map((service) => ({
              id: `${category.id}:car-service:${service.id}`,
              categoryId: category.id,
              needKey: category.needKey,
              labelAr: category.labelAr,
              labelEn: category.labelEn,
              name: locale === 'ar' ? service.nameAr : service.nameEn,
              nameAr: service.nameAr,
              nameEn: service.nameEn,
              location: { latitude: service.latitude, longitude: service.longitude },
              source: 'car_service',
            })))
        : Promise.resolve<TripNeedPlace[]>([]);
      return [...placeSearches, serviceSearch];
    }))
      .then((groups) => {
        if (cancelled) return;
        const unique = new Map<string, TripNeedPlace>();
        for (const place of groups.flat()) {
          const key = `${place.categoryId}:${place.location.latitude.toFixed(5)},${place.location.longitude.toFixed(5)}`;
          if (!unique.has(key)) unique.set(key, place);
        }
        setTripNeedPlaces([...unique.values()]);
      })
      .catch(() => {
        if (!cancelled) {
          setTripNeedPlaces([]);
          setTripNeedsError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setTripNeedsLoading(false);
      });
    return () => { cancelled = true; };
  }, [allTripNeedCategories, locale, selectedDestination]);

  useEffect(() => {
    const query = destinationQuery.trim();
    if (query.length < 2 || selectedDestination?.name === destinationQuery) {
      setPlaceSuggestions([]);
      setPlaceSearchLoading(false);
      setPlaceSearchError(false);
      return;
    }
    let cancelled = false;
    setPlaceSearchLoading(true);
    setPlaceSearchError(false);
    const timeout = setTimeout(() => {
      searchPlaces(query, { center: { latitude: region.latitude, longitude: region.longitude } })
        .then((results) => {
          if (!cancelled) setPlaceSuggestions(results);
        })
        .catch(() => {
          if (!cancelled) {
            setPlaceSuggestions([]);
            setPlaceSearchError(true);
          }
        })
        .finally(() => {
          if (!cancelled) setPlaceSearchLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [destinationQuery, region.latitude, region.longitude, selectedDestination?.name]);

  const alerts = useMemo(
    () =>
      checkpoints
        .filter((checkpoint) => !checkpoint.assumed && checkpoint.status !== 'open')
        .sort(
          (a, b) =>
            Number(b.status === 'closed') - Number(a.status === 'closed') ||
            (a.minutesSinceReport ?? 0) - (b.minutesSinceReport ?? 0),
        ),
    [checkpoints],
  );

  const mapCheckpoints = useMemo<MapCheckpoint[]>(
    () =>
      alerts.filter((checkpoint) => !roadReports.some((report) => report.type === 'checkpoint' && distanceMeters(report, checkpoint.location) < 80)).map((checkpoint) => ({
        id: checkpoint.id,
        name: locale === 'ar' ? checkpoint.nameAr : checkpoint.nameEn,
        location: checkpoint.location,
        status: checkpoint.status,
        assumed: checkpoint.assumed,
      })),
    [alerts, locale, roadReports],
  );

  const routeOrigin = useMemo<GeoPoint | undefined>(
    () => {
      const normalizedTestLocation = normalizeGeoPoint(testLocation);
      if (normalizedTestLocation) return normalizedTestLocation;
      const normalizedLocation = normalizeGeoPoint(location);
      if (normalizedLocation) {
        return {
          latitude: round4(normalizedLocation.latitude),
          longitude: round4(normalizedLocation.longitude),
        };
      }
      return normalizeGeoPoint(routeOriginOverride) ?? normalizeGeoPoint(storedRouteOrigin);
    },
    [testLocation, location, routeOriginOverride, storedRouteOrigin],
  );
  const routeDestination = useMemo(
    () => normalizeGeoPoint(routeTarget?.location),
    [routeTarget],
  );
  const { data: route, isFetching: routeLoading, isError: routeError } = useRoute(
    !activeRouteNeedsPlan && routeDestination ? routeOrigin : undefined,
    !activeRouteNeedsPlan ? routeDestination : undefined,
    !activeRouteNeedsPlan && routeTarget ? FASTEST_PARKING_ROUTE : undefined,
  );
  useEffect(() => {
    setRouteNeedsPlan(undefined);
    setRouteNeedsError(false);
    setRouteNeedsDisplayMode('needs');
    if (tripNeedsMode !== 'route') {
      setActiveRouteNeedsPlan(undefined);
    }
    if (!selectedDestination || !routeOrigin || allTripNeedCategories.length === 0 || tripNeedsLoading) {
      setRouteNeedsLoading(false);
      return;
    }
    let cancelled = false;
    setRouteNeedsLoading(true);
    planRouteWithNeeds(routeOrigin, selectedDestination.location, allTripNeedCategories, tripNeedPlaces)
      .then((plan) => {
        if (!cancelled) {
          setRouteNeedsPlan(plan);
          if (tripNeedsMode === 'route') setActiveRouteNeedsPlan(plan);
        }
      })
      .catch(() => {
        if (!cancelled) setRouteNeedsError(true);
      })
      .finally(() => {
        if (!cancelled) setRouteNeedsLoading(false);
      });
    return () => { cancelled = true; };
  }, [allTripNeedCategories, routeOrigin, selectedDestination, tripNeedPlaces, tripNeedsLoading, tripNeedsMode]);
  useEffect(() => {
    setSelectedRouteId('current');
    setAlternativeDismissed(false);
  }, [routeTarget?.type, routeTarget?.id, routeOrigin?.latitude, routeOrigin?.longitude]);
  useEffect(() => {
    if (routeError) setLocationMessage(t('ramallahParking.routeUnavailable'));
  }, [routeError, t]);
  useEffect(() => {
    if (selectedRouteId !== 'current' && route && !route.alternatives.some((alternative) => alternative.id === selectedRouteId)) {
      setSelectedRouteId('current');
      setAlternativeDismissed(false);
    }
  }, [route, selectedRouteId]);
  const routeAssessment = useMemo(
    () => !activeRouteNeedsPlan && route?.source === 'osrm'
      ? assessRouteAlternatives(route, roadReports, routeOrigin)
      : undefined,
    [activeRouteNeedsPlan, roadReports, route, routeOrigin],
  );
  const selectedAlternative = useMemo(
    () => route?.alternatives.find((alternative) => alternative.id === selectedRouteId),
    [route, selectedRouteId],
  );
  const displayedRoute = useMemo<RouteResult | undefined>(() => {
    if (activeRouteNeedsPlan) {
      return routeNeedsDisplayMode === 'shortest'
        ? activeRouteNeedsPlan.baseRoute
        : activeRouteNeedsPlan.route;
    }
    if (!route || !selectedAlternative) return route;
    return {
      ...route,
      coordinates: selectedAlternative.coordinates,
      distanceMeters: selectedAlternative.distanceMeters,
      durationSeconds: selectedAlternative.durationSeconds,
      penaltySeconds: 0,
      closuresOnRoute: [],
      trafficSegments: undefined,
      trafficSummary: undefined,
    };
  }, [activeRouteNeedsPlan, route, routeNeedsDisplayMode, selectedAlternative]);
  const routeNeedsComparison = useMemo(() => {
    if (!activeRouteNeedsPlan) return undefined;
    const needAware = activeRouteNeedsPlan.route;
    const shortest = activeRouteNeedsPlan.baseRoute;
    const extraDurationSeconds = Math.max(0, needAware.durationSeconds - shortest.durationSeconds);
    const extraDistanceMeters = Math.max(0, needAware.distanceMeters - shortest.distanceMeters);
    const extraPercent = shortest.durationSeconds > 0
      ? Math.round((extraDurationSeconds / shortest.durationSeconds) * 100)
      : 0;
    return {
      mode: routeNeedsDisplayMode,
      needAware,
      shortest,
      extraDurationSeconds,
      extraDistanceMeters,
      extraPercent,
      significant: (extraDurationSeconds >= 5 * 60 && extraPercent >= 15) || extraDurationSeconds >= 10 * 60,
    };
  }, [activeRouteNeedsPlan, routeNeedsDisplayMode]);
  const activeRouteAssessment = selectedRouteId === 'current'
    ? routeAssessment?.current
    : routeAssessment?.alternatives.find((alternative) => alternative.id === selectedRouteId);
  const mapRoute = useMemo<MapRoute | undefined>(
    () => {
      if (!routeDestination || displayedRoute?.source !== 'osrm') return undefined;
      const coordinates = normalizeGeoPoints(displayedRoute.coordinates);
      if (coordinates.length < 2) return undefined;
      const detourSegments = activeRouteNeedsPlan
        ? routeDetourSegments(
            normalizeGeoPoints(activeRouteNeedsPlan.route.coordinates),
            normalizeGeoPoints(activeRouteNeedsPlan.baseRoute.coordinates),
            normalizeGeoPoints(activeRouteNeedsPlan.stops.map((stop) => stop.place.location)),
          )
        : [];
      const alternativeLines = selectedRouteId === 'current'
        ? displayedRoute.alternatives.map((item) => item.coordinates)
        : [
            route!.coordinates,
            ...route!.alternatives
              .filter((item) => item.id !== selectedRouteId)
              .map((item) => item.coordinates),
          ];
      return {
        coordinates,
        trafficState: displayedRoute.trafficSummary?.state,
        trafficSegments: displayedRoute.trafficSegments
          ?.map((segment) => ({
            ...segment,
            coordinates: normalizeGeoPoints(segment.coordinates),
          }))
          .filter((segment) => segment.coordinates.length >= 2),
        detourSegments,
        detourMode: activeRouteNeedsPlan
          ? routeNeedsDisplayMode === 'shortest' ? 'comparison' : 'primary'
          : undefined,
        showRouteLegend: detourSegments.length > 0,
        alternatives: alternativeLines
          .map(normalizeGeoPoints)
          .filter((line) => line.length >= 2),
      };
    },
    [activeRouteNeedsPlan, displayedRoute, route, routeDestination, routeNeedsDisplayMode, selectedRouteId],
  );
  const routeNeedsVisible = tripNeedsMode === 'route' && Boolean(routeTarget);
  const visibleNeedStops = useMemo(
    () => routeNeedsVisible && routeNeedsDisplayMode === 'needs'
      ? tripNeedPlaces.map((place) => ({
        id: place.id,
        name: locale === 'ar' ? place.nameAr ?? place.name : place.nameEn ?? place.name,
        category: locale === 'ar' ? place.labelAr : place.labelEn,
        location: place.location,
      }))
      : undefined,
    [locale, routeNeedsDisplayMode, routeNeedsVisible, tripNeedPlaces],
  );
  const routeNeedsNotice = useMemo(() => {
    if (!routeNeedsVisible) return undefined;
    const missingCategories = (activeRouteNeedsPlan ?? routeNeedsPlan)?.missingCategories ?? [];
    if (!missingCategories.length) return undefined;
    return t('tripNeeds.missingRouteNeeds', {
      needs: formatNeedLabels(missingCategories, locale).join(locale === 'ar' ? '\u060c ' : ', '),
    });
  }, [activeRouteNeedsPlan, locale, routeNeedsPlan, routeNeedsVisible, t]);

  useEffect(() => {
    if (!mapRoute) return;
    mapRef.current?.fitToCoordinates(
      mapRoute.coordinates,
      { top: 156, right: 36, bottom: 196, left: 36 },
      500,
    );
  }, [mapRoute]);

  useEffect(() => {
    if (!locationMessage) return;
    const timeout = setTimeout(() => setLocationMessage(undefined), 3600);
    return () => clearTimeout(timeout);
  }, [locationMessage]);

  const recenter = useCallback(async () => {
    setEntryMenuOpen(false);
    setLocationMessage(undefined);
    haptics.light();
    if (testLocationMode) {
      if (!testLocation) {
        setLocationMessage(t('ramallahParking.testLocationPrompt'));
        return;
      }
      const next: GeoRegion = { ...testLocation, latitudeDelta: 0.014, longitudeDelta: 0.014 };
      setRegion(next);
      mapRef.current?.animateToRegion(next, 450);
      return;
    }
    const point = location ?? (await requestLocation());
    if (!point) {
      setLocationMessage(t('map.locationDeniedBody'));
      return;
    }
    useReservationRouteStore.getState().setOrigin(point, 'gps');
    const next: GeoRegion = { ...point, latitudeDelta: 0.014, longitudeDelta: 0.014 };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 450);
  }, [testLocationMode, testLocation, location, requestLocation, t]);

  const openZone = useCallback((zone: ParkingZone) => {
    haptics.select();
    setEntryMenuOpen(false);
    setNearbyExpanded(false);
    setRouteTarget(undefined);
    setActiveRouteNeedsPlan(undefined);
    setRouteNeedsDisplayMode('needs');
    setSelectedDestination(undefined);
    setRouteDetailsExpanded(false);
    setSelectedZoneId(zone.id);
    setSelectedReport(undefined);
  }, []);

  const focusZone = useCallback(
    (item: NearbyZone) => {
      const next: GeoRegion = { ...item.zone.location, latitudeDelta: 0.01, longitudeDelta: 0.01 };
      setRegion(next);
      mapRef.current?.animateToRegion(next, 400);
      openZone(item.zone);
    },
    [openZone],
  );

  const startParking = useCallback(
    (zone: ParkingZone) => {
      setSelectedZoneId(undefined);
      setRouteTarget(undefined);
      setActiveRouteNeedsPlan(undefined);
      setRouteNeedsDisplayMode('needs');
      setRouteDetailsExpanded(false);
      router.push({ pathname: '/parking/start', params: { zoneId: zone.id } });
    },
    [router],
  );

  const reserveParking = useCallback(
    (zone: ParkingZone) => {
      useReservationRouteStore.getState().setOrigin(
        routeOrigin,
        testLocation ? 'test' : 'gps',
      );
      setSelectedZoneId(undefined);
      router.push({ pathname: '/parking/layout/[zoneId]', params: { zoneId: zone.id } });
    },
    [routeOrigin, router, testLocation],
  );

  const viewParkingMap = useCallback(
    (zone: ParkingZone) => {
      useReservationRouteStore.getState().setOrigin(
        routeOrigin,
        testLocation ? 'test' : 'gps',
      );
      setSelectedZoneId(undefined);
      router.push({ pathname: '/parking/layout/[zoneId]', params: { zoneId: zone.id } });
    },
    [routeOrigin, router, testLocation],
  );

  const startRoute = useCallback(
    async (destination: RouteDestination) => {
      if (routeStartInFlightRef.current) return false;
      routeStartInFlightRef.current = true;
      try {
        setLocationMessage(undefined);
        const normalizedDestination = normalizeGeoPoint(destination.location);
        if (!normalizedDestination) {
          setLocationMessage(t('ramallahParking.routeUnavailable'));
          return false;
        }
        let origin = testLocation;
        if (!origin && testLocationMode) {
          setLocationMessage(t('ramallahParking.testLocationPrompt'));
          return false;
        }
        origin ??= location ?? storedRouteOrigin ?? (await requestLocation());
        if (!origin) {
          setLocationMessage(t('map.locationDeniedBody'));
          return false;
        }
        const normalizedOrigin = normalizeGeoPoint(origin);
        if (!normalizedOrigin) {
          setLocationMessage(t('map.locationDeniedBody'));
          return false;
        }
        haptics.select();
        const originMode = testLocation || storedRouteOriginMode === 'test' ? 'test' : 'gps';
        useReservationRouteStore.getState().setOrigin(normalizedOrigin, originMode);
        setRouteOriginOverride(normalizedOrigin);
        setSelectedZoneId(undefined);
        setNearbyExpanded(false);
        setRouteDetailsExpanded(false);
        setSelectedRouteId('current');
        setAlternativeDismissed(false);
        setRouteNeedsDisplayMode('needs');
        setRouteTarget({ ...destination, location: normalizedDestination });
        setActiveRouteNeedsPlan(undefined);
        useReservationRouteStore.getState().consume();
        ev.select(undefined);
        carServices.select(undefined);
        tourismPlaces.select(undefined);
        return true;
      } finally {
        routeStartInFlightRef.current = false;
      }
    },
    [location, requestLocation, storedRouteOrigin, storedRouteOriginMode, t, testLocation, testLocationMode, ev.select, carServices.select, tourismPlaces.select],
  );

  const changeDestinationQuery = useCallback((value: string) => {
    setDestinationQuery(value);
    setSuggestionsOpen(true);
    if (!value.trim()) {
      setSelectedDestination(undefined);
      setPlaceSuggestions([]);
      setPlaceSearchError(false);
      setTripNeedsExpanded(false);
      setTripNeedsAppliedText('');
      setTripNeedsMode('idle');
      setTripNeedCategories([]);
      setTripNeedFreeText([]);
      setTripNeedPlaces([]);
      setRouteNeedsPlan(undefined);
      setActiveRouteNeedsPlan(undefined);
      setRouteNeedsDisplayMode('needs');
      setRouteNeedsError(false);
    }
  }, []);

  const selectDestination = useCallback((suggestion: PlaceSuggestion) => {
    haptics.select();
    setSelectedDestination(suggestion);
    setDestinationQuery(locale === 'ar' ? suggestion.nameAr ?? suggestion.name : suggestion.nameEn ?? suggestion.name);
    setSuggestionsOpen(false);
    setPlaceSuggestions([]);
    setSelectedZoneId(undefined);
    setSelectedReport(undefined);
    setRouteTarget(undefined);
    setActiveRouteNeedsPlan(undefined);
    setRouteNeedsDisplayMode('needs');
    setRouteDetailsExpanded(false);
    setNearbyExpanded(false);
    setTripNeedsExpanded(false);
    setTripNeedsAppliedText('');
    setTripNeedsMode('idle');
    setTripNeedCategories([]);
    setTripNeedFreeText([]);
    setTripNeedPlaces([]);
    setTripNeedsError(false);
    setRouteNeedsPlan(undefined);
    setActiveRouteNeedsPlan(undefined);
    setRouteNeedsDisplayMode('needs');
    setRouteNeedsError(false);
    const next: GeoRegion = {
      ...suggestion.location,
      latitudeDelta: 0.012,
      longitudeDelta: 0.012,
    };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 450);
  }, [locale]);

  const applyTripNeeds = useCallback((value: string) => {
    const categories = parseTripNeeds(value);
    const freeText = parseTripNeedSemanticText(value, categories);
    setTripNeedsAppliedText(value.trim());
    setTripNeedsMode('choosing');
    setTripNeedCategories(categories);
    setTripNeedFreeText(freeText);
    setTripNeedPlaces([]);
    setTripNeedsError(false);
    setRouteNeedsPlan(undefined);
    setActiveRouteNeedsPlan(undefined);
    setRouteNeedsDisplayMode('needs');
    setRouteNeedsError(false);
  }, []);

  const startRouteWithNeeds = useCallback(async () => {
    if (!selectedDestination) return;
    setTripNeedsMode('route');
    setSelectedZoneId(undefined);
    setNearbyExpanded(false);
    setRouteDetailsExpanded(false);
    setSelectedRouteId('current');
    setAlternativeDismissed(false);
    setRouteNeedsDisplayMode('needs');
    const started = await startRoute(placeDestination(selectedDestination));
    if (!started) {
      setTripNeedsMode('choosing');
      return;
    }
    setActiveRouteNeedsPlan(routeNeedsPlan);
  }, [routeNeedsPlan, selectedDestination, startRoute]);

  const showBestParkingForNeeds = useCallback(() => {
    haptics.select();
    setTripNeedsMode('parking');
    setActiveRouteNeedsPlan(undefined);
    setRouteNeedsDisplayMode('needs');
    setRouteTarget(undefined);
    setSelectedZoneId(undefined);
    setNearbyExpanded(false);
  }, []);

  const clearTripNeeds = useCallback(() => {
    setTripNeedsAppliedText('');
    setTripNeedsMode('idle');
    setTripNeedCategories([]);
    setTripNeedFreeText([]);
    setTripNeedPlaces([]);
    setTripNeedsError(false);
    setRouteNeedsPlan(undefined);
    setActiveRouteNeedsPlan(undefined);
    setRouteNeedsDisplayMode('needs');
    setRouteNeedsError(false);
  }, []);

  useEffect(() => {
    if (!mapFocused || !pendingReservationRouteZoneId) return;
    const zone = zones.find((item) => item.id === pendingReservationRouteZoneId)
      ?? ramallahParkingZones.find((item) => item.id === pendingReservationRouteZoneId);
    if (!zone) {
      if (!zonesPending) {
        setLocationMessage(t('ramallahParking.routeUnavailable'));
        useReservationRouteStore.getState().consume();
      }
      return;
    }
    void startRoute(parkingDestination(zone));
  }, [mapFocused, pendingReservationRouteZoneId, startRoute, t, zones, zonesPending]);

  const openParkingLocation = useCallback((parkingLocation: RamallahParkingLocation) => {
    const zone =
      zones.find((item) => item.id === parkingLocation.id) ??
      ramallahParkingZones.find((item) => item.id === parkingLocation.id);
    if (zone) openZone(zone);
  }, [openZone, zones]);

  const selectCarService = useCallback((service: CarServiceBusiness) => {
    haptics.select();
    setSelectedZoneId(undefined);
    setSelectedReport(undefined);
    setEntryMenuOpen(false);
    setReportStep(undefined);
    setReportLocationPicking(false);
    carServices.select(service);
  }, [carServices.select]);

  const carServiceAccessibilityLabel = useCallback((service: CarServiceBusiness) => {
    const name = locale === 'ar' ? service.nameAr : service.nameEn;
    return `${name}, ${t(`carServices.category.${carServiceCategory}`)}`;
  }, [carServiceCategory, locale, t]);

  const selectTourismPlace = useCallback((place: TourismPlace) => {
    haptics.select();
    setSelectedZoneId(undefined);
    setSelectedReport(undefined);
    setEntryMenuOpen(false);
    setReportStep(undefined);
    setReportLocationPicking(false);
    tourismPlaces.select(place);
  }, [tourismPlaces.select]);

  const tourismPlaceMarkerCategory = useCallback((place: TourismPlace): TourismPlaceCategory => (
    tourismPlaceCategories.find((category) => place.categories.includes(category)) ?? place.primaryCategory
  ), [tourismPlaceCategories]);

  const tourismPlaceAccessibilityLabel = useCallback((place: TourismPlace) => {
    const name = locale === 'ar' ? place.nameAr : place.nameEn;
    return `${name}, ${place.categories.map((category) => t(`tourism.category.${category}`)).join(', ')}`;
  }, [locale, t]);

  const closeRoute = useCallback(() => {
    setRouteTarget(undefined);
    setActiveRouteNeedsPlan(undefined);
    setRouteNeedsDisplayMode('needs');
    setTripNeedsMode((mode) => mode === 'route' ? 'choosing' : mode);
    setRouteDetailsExpanded(false);
    setSelectedRouteId('current');
    setAlternativeDismissed(false);
  }, []);

  const openRouteReport = useCallback((report: RoadReport) => {
    setSelectedZoneId(undefined);
    setReportStep(undefined);
    setReportLocationPicking(false);
    setSelectedReport(report);
    const next: GeoRegion = {
      latitude: report.latitude,
      longitude: report.longitude,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 400);
  }, []);

  const toggleTestLocation = useCallback(() => {
    setLocationMessage(undefined);
    setTestLocationMode((enabled) => {
      if (enabled) {
        setTestLocation(undefined);
        setRouteOriginOverride(undefined);
        useReservationRouteStore.getState().setOrigin(undefined);
      } else {
        setEntryMenuOpen(false);
      }
      return !enabled;
    });
  }, []);

  const handleMapPress = useCallback(
    (coordinate: GeoPoint) => {
      if (reportLocationPicking) {
        setReportDraft((current) => ({ ...current, ...coordinate }));
        return;
      }
      if (!testLocationMode) return;
      if (!isValidGeoPoint(coordinate)) return;
      setTestLocation(coordinate);
      useReservationRouteStore.getState().setOrigin(coordinate, 'test');
      setLocationMessage(undefined);
    },
    [reportLocationPicking, testLocationMode],
  );

  const beginReportLocation = useCallback((type: RoadReportType) => {
    const initial = testLocation ?? location ?? { latitude: region.latitude, longitude: region.longitude };
    setSelectedZoneId(undefined);
    setSelectedReport(undefined);
    setEntryMenuOpen(false);
    setReportDraft({ type, ...initial });
    setReportStep(undefined);
    setReportLocationPicking(true);
  }, [location, region.latitude, region.longitude, testLocation]);

  const cancelReport = useCallback(() => {
    setReportStep(undefined);
    setReportLocationPicking(false);
    setReportDraft({});
    createReport.reset();
  }, [createReport]);

  const submitReport = useCallback(() => {
    if (!reportDraft.type || reportDraft.latitude === undefined || reportDraft.longitude === undefined) return;
    createReport.mutate(reportDraft as CreateRoadReportInput, {
      onSuccess: (result) => {
        const report = result.report;
        setReportStep(undefined);
        setReportLocationPicking(false);
        setReportDraft({});
        setSelectedReport(undefined);
        setSelectedReport(report);
        if (result.duplicate) {
          const next: GeoRegion = {
            latitude: report.latitude,
            longitude: report.longitude,
            latitudeDelta: Math.min(region.latitudeDelta, 0.012),
            longitudeDelta: Math.min(region.longitudeDelta, 0.012),
          };
          setRegion(next);
          mapRef.current?.animateToRegion(next, 450);
          setLocationMessage(t(result.confirmationAdded
            ? 'roadReports.duplicateConfirmed'
            : 'roadReports.duplicateActive'));
        } else {
          setLocationMessage(t('roadReports.created'));
        }
        createReport.reset();
      },
    });
  }, [createReport, region.latitudeDelta, region.longitudeDelta, reportDraft, t]);

  const openInMaps = useCallback((destination: RouteDestination) => {
    const { latitude, longitude } = destination.location;
    const url = Platform.select({
      ios: `maps://?daddr=${latitude},${longitude}`,
      android: `geo:${latitude},${longitude}?q=${latitude},${longitude}(${encodeURIComponent(destination.name)})`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });
    void Linking.openURL(url).catch(() => undefined);
  }, []);

  const selectEvStation = useCallback((station: EvChargingStation) => {
    setSelectedZoneId(undefined);
    setSelectedReport(undefined);
    setReportStep(undefined);
    setReportLocationPicking(false);
    setEntryMenuOpen(false);
    ev.select(station);
  }, [ev.select]);

  const focusEvStation = useCallback((station: EvChargingStation) => {
    const next: GeoRegion = {
      latitude: station.latitude,
      longitude: station.longitude,
      latitudeDelta: Math.min(region.latitudeDelta, 0.01),
      longitudeDelta: Math.min(region.longitudeDelta, 0.01),
    };
    setRegion(next);
    mapRef.current?.animateToRegion(next, 450);
    selectEvStation(station);
  }, [region.latitudeDelta, region.longitudeDelta, selectEvStation]);

  // Never stack place detail modals with the existing map sheets.
  useEffect(() => {
    if (selectedZoneId || selectedReport || reportStep || reportLocationPicking || layersSheetOpen || vehicleSheetOpen || codeSheetOpen || evFiltersOpen) {
      ev.select(undefined);
      carServices.select(undefined);
      tourismPlaces.select(undefined);
    }
  }, [selectedZoneId, selectedReport, reportStep, reportLocationPicking, layersSheetOpen, vehicleSheetOpen, codeSheetOpen, evFiltersOpen, ev.select, carServices.select, tourismPlaces.select]);

  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: colors.background }}>
      <StatusBar style="dark" />

      <MapSurface
        ref={mapRef}
        region={region}
        evStations={!routeNeedsVisible && evActive ? ev.stations : []}
        selectedEvStationId={!routeNeedsVisible && evActive ? ev.selectedStationId : undefined}
        onSelectEvStation={selectEvStation}
        carServices={!routeNeedsVisible && carServicesActive ? carServices.services : []}
        activeCarServiceCategory={!routeNeedsVisible && carServicesActive ? carServiceCategory : undefined}
        selectedCarServiceId={!routeNeedsVisible && carServicesActive ? carServices.selectedServiceId : undefined}
        onSelectCarService={selectCarService}
        carServiceAccessibilityLabel={carServiceAccessibilityLabel}
        tourismPlaces={!routeNeedsVisible && tourismPlacesActive ? tourismPlaces.places : []}
        selectedTourismPlaceId={!routeNeedsVisible && tourismPlacesActive ? tourismPlaces.selectedPlaceId : undefined}
        onSelectTourismPlace={selectTourismPlace}
        tourismPlaceMarkerCategory={tourismPlaceMarkerCategory}
        tourismPlaceAccessibilityLabel={tourismPlaceAccessibilityLabel}
        zones={!routeNeedsVisible && primaryMapCategory === 'parking' ? mapZones.map((item) => item.zone) : []}
        selectedZoneId={!routeNeedsVisible && primaryMapCategory === 'parking' ? selectedZoneId ?? routeZone?.id : undefined}
        parkingLocations={!routeNeedsVisible && primaryMapCategory === 'parking' ? ramallahParkingLocations : []}
        selectedParkingLocationId={!routeNeedsVisible && primaryMapCategory === 'parking' ? selectedZoneId ?? routeZone?.id : undefined}
        onSelectParkingLocation={openParkingLocation}
        onSelectZone={openZone}
        onPressMap={handleMapPress}
        onPressBackground={() => {
          ev.select(undefined);
          carServices.select(undefined);
          tourismPlaces.select(undefined);
          setSelectedZoneId(undefined);
          setSelectedReport(undefined);
          setEntryMenuOpen(false);
        }}
        userLocation={testLocationMode ? undefined : location}
        testLocation={testLocation}
        onRegionChangeComplete={setRegion}
        checkpoints={routeNeedsVisible ? [] : mapCheckpoints}
        onSelectCheckpoint={() => router.push('/roads')}
        roadReports={!routeNeedsVisible && roadReportsEnabled ? roadReports : []}
        selectedRoadReportId={!routeNeedsVisible && roadReportsEnabled ? selectedReport?.id : undefined}
        onSelectRoadReport={(report) => {
          setSelectedZoneId(undefined);
          if (routeTarget?.type !== 'ev_station' && routeTarget?.type !== 'car_service' && routeTarget?.type !== 'tourism_place') {
            setRouteTarget(undefined);
            setActiveRouteNeedsPlan(undefined);
          }
          setReportStep(undefined);
          setReportLocationPicking(false);
          setSelectedReport(report);
        }}
        reportDraft={reportLocationPicking && reportDraft.type && reportDraft.latitude !== undefined && reportDraft.longitude !== undefined ? { type: reportDraft.type, location: { latitude: reportDraft.latitude, longitude: reportDraft.longitude } } : undefined}
        route={mapRoute}
        landmark={selectedDestination ? { name: selectedDestination.name, location: selectedDestination.location } : undefined}
        needStops={visibleNeedStops}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />

      <View
        pointerEvents="box-none"
        style={{
          paddingTop: insets.top + spacing.sm,
          paddingHorizontal: screenPadding,
          gap: spacing.sm,
        }}
      >
        <Reveal offset={8}>
          <MapTopBar
            vehicle={selected}
            unreadCount={unreadCount}
            onOpenVehicles={() => setVehicleSheetOpen(true)}
            onOpenNotifications={() => router.push('/notifications')}
            onOpenReport={!reportLocationPicking && !reportStep ? () => {
              setSelectedZoneId(undefined);
              setSelectedReport(undefined);
              setEntryMenuOpen(false);
              setReportDraft({});
              createReport.reset();
              setReportStep('type');
            } : undefined}
          />
        </Reveal>
        {!reportLocationPicking && !reportStep && !selectedReport ? (
          <DestinationSearchBox
            value={destinationQuery}
            suggestions={placeSuggestions}
            loading={placeSearchLoading}
            error={placeSearchError}
            showSuggestions={suggestionsOpen && !routeTarget}
            onChange={changeDestinationQuery}
            onSelect={selectDestination}
          />
        ) : null}
      </View>

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: insets.top + CONTROL_RAIL_TOP,
          [locale === 'ar' ? 'left' : 'right']: screenPadding,
        }}
      >
        <MapControlRail
          locationStatus={locationStatus}
          locationMessage={locationMessage}
          roadAlertCount={alerts.length}
          entryOpen={entryMenuOpen}
          onLocate={() => void recenter()}
          onToggleEntry={() => setEntryMenuOpen((open) => !open)}
          onScanQr={() => {
            setEntryMenuOpen(false);
            router.push('/scan');
          }}
          onEnterCode={() => {
            setEntryMenuOpen(false);
            setCodeSheetOpen(true);
          }}
          onOpenRoads={() => router.push('/roads')}
          enabledLayerCount={enabledLayerCount}
          onOpenLayers={() => {
            setEntryMenuOpen(false);
            setSelectedZoneId(undefined);
            setSelectedReport(undefined);
            setLayersSheetOpen(true);
          }}
        />
      </View>

      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          right: 0,
          bottom: TAB_BAR_CLEARANCE + insets.bottom,
          left: 0,
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
        }}
      >
        {!reportLocationPicking && !reportStep && !selectedReport && bannerSession ? (
          <Reveal offset={10}>
            <ActiveSessionBanner
              session={bannerSession}
              vehicle={bannerVehicle}
              extraCount={activeSessions.length - 1}
              onPress={() => router.push(`/parking/active/${bannerSession.id}`)}
            />
          </Reveal>
        ) : null}

        {!reportLocationPicking && !reportStep && !selectedReport && __DEV__ && process.env.EXPO_PUBLIC_SHOW_TEST_LOCATION === 'true' ? (
          <Reveal offset={10} style={{ alignItems: 'flex-end' }}>
            <TestLocationControl
              enabled={testLocationMode}
              hasLocation={Boolean(testLocation)}
              onToggle={toggleTestLocation}
            />
          </Reveal>
        ) : null}

        {reportLocationPicking ? (
          <Reveal key="rp-location" offset={12}>
            <RoadReportLocationPanel onCancel={cancelReport} onContinue={() => { setReportLocationPicking(false); setReportStep('details'); }} />
          </Reveal>
        ) : !reportStep && !selectedReport && routeTarget ? (
          <Reveal key="rp-route" offset={12}>
          <CompactRoutePanel
            destination={routeTarget}
            route={displayedRoute}
            loading={activeRouteNeedsPlan ? false : routeLoading}
            needsNotice={routeNeedsNotice}
            routeNeedsComparison={routeNeedsComparison}
            detailsExpanded={routeDetailsExpanded}
            onDetailsExpandedChange={setRouteDetailsExpanded}
            onClose={closeRoute}
            onOpenMaps={() => openInMaps(routeTarget)}
            onStartParking={routeZone ? () => startParking(routeZone) : undefined}
            onOpenDestination={routeTarget.type === 'ev_station' ? () => {
              useMapLayersStore.getState().setPrimaryCategory('ev_charging');
              selectEvStation(routeTarget.station);
            } : routeTarget.type === 'car_service' ? () => {
              useMapLayersStore.getState().setPrimaryCategory('car_services');
              carServices.select(routeTarget.service);
            } : routeTarget.type === 'tourism_place' ? () => {
              useMapLayersStore.getState().setPrimaryCategory('tourism_places');
              tourismPlaces.select(routeTarget.place);
            } : undefined}
            startDisabled={routeZone?.parkingAllowed === false}
            impacts={activeRouteAssessment?.impacts}
            suggestedAlternative={routeAssessment?.recommended}
            originalDurationSeconds={activeRouteNeedsPlan ? undefined : route?.durationSeconds}
            usingAlternative={selectedRouteId !== 'current'}
            alternativeDismissed={alternativeDismissed}
            onSelectImpact={(impact) => openRouteReport(impact.report)}
            onKeepCurrent={() => setAlternativeDismissed(true)}
            onUseAlternative={() => {
              if (routeAssessment?.recommended) {
                setSelectedRouteId(routeAssessment.recommended.id);
                setAlternativeDismissed(false);
              }
            }}
            onUseOriginal={() => {
              setSelectedRouteId('current');
              setAlternativeDismissed(true);
            }}
            onShowShortestRoute={() => {
              setRouteNeedsDisplayMode('shortest');
              setSelectedRouteId('current');
              setAlternativeDismissed(true);
            }}
            onShowNeedAwareRoute={() => {
              setRouteNeedsDisplayMode('needs');
              setSelectedRouteId('current');
              setAlternativeDismissed(false);
            }}
            showNoAlternative={Boolean(route?.source === 'osrm' && activeRouteAssessment?.impacts.length && !routeAssessment?.recommended && selectedRouteId === 'current')}
          />
          </Reveal>
        ) : !reportStep && !selectedReport && selectedDestination && primaryMapCategory === 'parking' ? (
          <Reveal key="rp-destination" offset={12}>
          <DestinationParkingPanel
            destinationName={selectedDestination.name}
            recommendations={destinationRecommendations}
            tripNeedsExpanded={tripNeedsExpanded}
            tripNeedsAppliedText={tripNeedsAppliedText}
            tripNeedsMode={tripNeedsMode}
            tripNeedCategories={allTripNeedCategories}
            tripNeedsNoMatches={tripNeedsNoMatches}
            tripNeedsLoading={tripNeedsLoading}
            tripNeedsError={tripNeedsError}
            routeNeedsPlan={routeNeedsPlan}
            routeNeedsLoading={routeNeedsLoading}
            routeNeedsError={routeNeedsError}
            onTripNeedsExpandedChange={setTripNeedsExpanded}
            onApplyTripNeeds={applyTripNeeds}
            onClearTripNeeds={clearTripNeeds}
            onRouteWithNeeds={() => void startRouteWithNeeds()}
            onBestParkingForNeeds={showBestParkingForNeeds}
            onSelect={(item) => void startRoute(parkingDestination(item.zone))}
          />
          </Reveal>
        ) : !reportStep && !selectedReport && primaryMapCategory === 'parking' ? (
          <Reveal key="rp-nearby" offset={12}>
          <NearbyParkingPanel
            zones={nearbyZones}
            loading={zonesPending}
            error={zonesError}
            onRetry={() => void refetchZones()}
            expanded={nearbyExpanded}
            onExpandedChange={setNearbyExpanded}
            onSelectZone={focusZone}
          />
          </Reveal>
        ) : null}
        {evActive && !reportStep && !reportLocationPicking && !selectedReport && !ev.selectedStationId ? (
          <Reveal offset={12}>
          <EvMapStatus loading={ev.loading} error={ev.error} count={ev.stations.length} truncated={ev.truncated} filters={ev.filters}
            stations={ev.stations} retry={ev.retry} onFilters={() => setEvFiltersOpen(true)} onSelectStation={focusEvStation} compact={Boolean(routeTarget)} />
          </Reveal>
        ) : null}
        {carServicesActive && !reportStep && !reportLocationPicking && !selectedReport && !carServices.selectedServiceId ? (
          <Reveal offset={12}>
          <CarServiceMapStatus
            loading={carServices.loading}
            error={carServices.error}
            errorMessage={carServices.errorMessage}
            count={carServices.services.length}
            services={carServices.services}
            truncated={carServices.truncated}
            category={carServiceCategory}
            retry={carServices.retry}
            compact={Boolean(routeTarget)}
          />
          </Reveal>
        ) : null}
        {tourismPlacesActive && !reportStep && !reportLocationPicking && !selectedReport && !tourismPlaces.selectedPlaceId ? (
          <Reveal offset={12}>
          <TourismPlaceMapStatus
            loading={tourismPlaces.loading}
            error={tourismPlaces.error}
            errorMessage={tourismPlaces.errorMessage}
            count={tourismPlaces.places.length}
            places={tourismPlaces.places}
            truncated={tourismPlaces.truncated}
            categories={tourismPlaceCategories}
            retry={tourismPlaces.retry}
            compact={Boolean(routeTarget)}
          />
          </Reveal>
        ) : null}
      </View>

      <VehicleSelectorSheet
        visible={vehicleSheetOpen}
        onClose={() => setVehicleSheetOpen(false)}
        vehicles={vehicles}
        selectedId={selected?.id}
        activeVehicleIds={activeVehicleIds}
        onSelect={(vehicle) => {
          select(vehicle.id);
          setVehicleSheetOpen(false);
        }}
        onAddVehicle={() => {
          setVehicleSheetOpen(false);
          router.push('/vehicles/add');
        }}
      />

      <ZoneSheet
        zone={selectedZone}
        visible={Boolean(selectedZone)}
        onClose={() => setSelectedZoneId(undefined)}
        distanceMeters={
          selectedZone && (testLocation ?? location)
            ? distanceMeters((testLocation ?? location)!, selectedZone.location)
            : undefined
        }
        onNavigate={(zone) => void startRoute(parkingDestination(zone))}
        onStartParking={startParking}
        onReserve={reserveParking}
        onViewParkingMap={viewParkingMap}
        startDisabled={selectedZone?.parkingAllowed === false}
      />

      <ZoneCodeSheet
        visible={codeSheetOpen}
        onClose={() => setCodeSheetOpen(false)}
        onResolved={(zone) => {
          setCodeSheetOpen(false);
          openZone(zone);
        }}
        onScanQr={() => {
          setCodeSheetOpen(false);
          router.push('/scan');
        }}
      />

      <RoadReportCreationSheet
        visible={Boolean(reportStep)}
        step={reportStep ?? 'type'}
        draft={reportDraft}
        onChange={(next) => setReportDraft((current) => ({ ...current, ...next }))}
        onChooseType={beginReportLocation}
        onStepChange={setReportStep}
        onClose={cancelReport}
        onSubmit={submitReport}
        loading={createReport.isPending}
        error={createReport.error ? t('roadReports.createFailed') : undefined}
      />

      <RoadReportDetailsSheet
        key={selectedReport?.id ?? 'closed-road-report'}
        report={selectedReport}
        visible={Boolean(selectedReport)}
        onClose={() => setSelectedReport(undefined)}
        onUpdated={setSelectedReport}
      />

      <MapLayersSheet visible={layersSheetOpen} onClose={() => setLayersSheetOpen(false)} />
      <EvStationDetailsSheet key={ev.selectedStationId ?? 'closed-ev'} station={evActive ? ev.selectedStation : undefined}
        onClose={() => ev.select(undefined)} onRoute={(station) => void startRoute(evDestination(station))} />
      <CarServiceDetailsSheet key={carServices.selectedServiceId ?? 'closed-car-service'} service={carServicesActive ? carServices.selectedService : undefined}
        onClose={() => carServices.select(undefined)} onRoute={(service) => void startRoute(carServiceDestination(service))} />
      <TourismPlaceDetailsSheet key={tourismPlaces.selectedPlaceId ?? 'closed-tourism-place'} place={tourismPlacesActive ? tourismPlaces.selectedPlace : undefined}
        onClose={() => tourismPlaces.select(undefined)} onRoute={(place) => void startRoute(tourismPlaceDestination(place))} />
      <EvFiltersSheet visible={evActive && evFiltersOpen} onClose={() => setEvFiltersOpen(false)} />
    </View>
  );
}
