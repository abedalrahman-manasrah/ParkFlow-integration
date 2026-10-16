import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ZoneMarker } from './ZoneMarker';
import { CheckpointMarker } from './CheckpointMarker';
import { LandmarkMarker } from './LandmarkMarker';
import {
  ParkingLocationMarker,
  parkingLocationAccessibilityLabel,
} from './ParkingLocationMarker';
import { TestLocationMarker } from './TestLocationMarker';
import { RoadReportMarker } from './RoadReportMarker';
import { EvStationMarker } from './EvStationMarker';
import { CarServiceMarker } from './CarServiceMarker';
import { TourismPlaceMarker } from './TourismPlaceMarker';
import { NeedStopMarker } from './NeedStopMarker';
import type { MapSurfaceHandle, MapSurfaceProps } from './types';
import { AppText } from '@/components/ui';
import { useLocale } from '@/hooks/useLocale';
import { useTheme } from '@/theme/ThemeProvider';
import { radius } from '@/theme/radius';
import { shadow } from '@/theme/shadows';
import { spacing } from '@/theme/spacing';
import type { GeoPoint, GeoRegion, RouteTrafficState } from '@/types';
import { isValidGeoPoint, isValidGeoRegion, normalizeGeoPoints } from '@/utils/coordinates';
import { DEFAULT_REGION } from '@/data/mapDefaults';

/**
 * Default (web) implementation — react-native-maps has no browser build.
 *
 * A Leaflet map with Esri satellite imagery (the same base the Wusool project
 * uses), plus road and place-name overlays so streets stay readable. No API key.
 * Zone pins are the shared `ZoneMarker` components drawn over the map and
 * re-projected on every move, so they look identical to the native pins.
 *
 * Metro picks `MapSurface.native.tsx` on iOS/Android. This file is also what
 * TypeScript resolves, so both share one contract.
 */

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const SATELLITE = `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`;
const ROADS = `${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`;
const PLACES = `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`;

type EdgePadding = { top: number; right: number; bottom: number; left: number };
type PendingFit = { coordinates: GeoPoint[]; edgePadding: EdgePadding; durationMs: number };

const TRAFFIC_COLORS: Record<RouteTrafficState, string> = {
  normal: '#16A34A',
  slow: '#F59E0B',
  traffic_jam: '#DC2626',
};

const TRAFFIC_LABELS: Record<RouteTrafficState, string> = {
  normal: 'Clear traffic',
  slow: 'Slow traffic',
  traffic_jam: 'Heavy traffic',
};
const NEED_DETOUR_COLOR = '#7C3AED';

const withTrafficTooltip = (line: L.Polyline, state?: RouteTrafficState) => {
  if (!state) return line;
  return line.bindTooltip(TRAFFIC_LABELS[state], {
    direction: 'top',
    opacity: 0.95,
    sticky: true,
  });
};

function fitMapToCoordinates(map: L.Map, request: PendingFit): 'applied' | 'deferred' {
  const coordinates = normalizeGeoPoints(request.coordinates);
  if (!coordinates.length) return 'applied';

  if (coordinates.length === 1) {
    const point = coordinates[0]!;
    const zoom = map.getZoom();
    if (!Number.isFinite(zoom)) return 'deferred';
    map.setView([point.latitude, point.longitude], zoom);
    return 'applied';
  }

  const bounds = L.latLngBounds(
    coordinates.map((point) => [point.latitude, point.longitude] as L.LatLngTuple),
  );
  if (!bounds.isValid()) return 'applied';

  const size = map.getSize();
  if (!Number.isFinite(size.x) || !Number.isFinite(size.y) || size.x <= 0 || size.y <= 0) {
    return 'deferred';
  }

  const nonNegativeFinite = (value: number) =>
    Number.isFinite(value) && value >= 0 ? value : 0;
  const requested = {
    top: nonNegativeFinite(request.edgePadding.top),
    right: nonNegativeFinite(request.edgePadding.right),
    bottom: nonNegativeFinite(request.edgePadding.bottom),
    left: nonNegativeFinite(request.edgePadding.left),
  };
  const horizontalPadding = requested.left + requested.right;
  const verticalPadding = requested.top + requested.bottom;
  // Leaflet subtracts combined padding from the container before calculating zoom.
  // Keep the usable size positive while a returning route screen is still resizing.
  const paddingScale = Math.max(
    0,
    Math.min(
      1,
      horizontalPadding > 0 ? (size.x - 1) / horizontalPadding : 1,
      verticalPadding > 0 ? (size.y - 1) / verticalPadding : 1,
    ),
  );
  const padding = {
    top: requested.top * paddingScale,
    right: requested.right * paddingScale,
    bottom: requested.bottom * paddingScale,
    left: requested.left * paddingScale,
  };
  const duration = Number.isFinite(request.durationMs) && request.durationMs >= 0
    ? request.durationMs / 1000
    : 0;
  const center = bounds.getCenter();
  const zoom = map.getBoundsZoom(
    bounds,
    false,
    L.point(padding.left + padding.right, padding.top + padding.bottom),
  );
  if (
    !Number.isFinite(center.lat) ||
    !Number.isFinite(center.lng) ||
    !Number.isFinite(zoom)
  ) {
    return 'applied';
  }

  map.flyToBounds(bounds, {
    paddingTopLeft: [padding.left, padding.top],
    paddingBottomRight: [padding.right, padding.bottom],
    duration,
  });
  return 'applied';
}

function toBounds(region: GeoRegion): L.LatLngBoundsExpression {
  return [
    [region.latitude - region.latitudeDelta / 2, region.longitude - region.longitudeDelta / 2],
    [region.latitude + region.latitudeDelta / 2, region.longitude + region.longitudeDelta / 2],
  ];
}

function regionOf(map: L.Map): GeoRegion {
  const bounds = map.getBounds();
  const center = bounds.getCenter();
  return {
    latitude: center.lat,
    longitude: center.lng,
    latitudeDelta: bounds.getNorth() - bounds.getSouth(),
    longitudeDelta: bounds.getEast() - bounds.getWest(),
  };
}

function sameRegion(a: GeoRegion, b?: GeoRegion): boolean {
  if (!b) return false;
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-7;
  return (
    close(a.latitude, b.latitude) &&
    close(a.longitude, b.longitude) &&
    close(a.latitudeDelta, b.latitudeDelta) &&
    close(a.longitudeDelta, b.longitudeDelta)
  );
}

export const MapSurface = forwardRef<MapSurfaceHandle, MapSurfaceProps>(function MapSurface(
  {
    region,
    zones,
    selectedZoneId,
    onSelectZone,
    onPressBackground,
    onPressMap,
    userLocation,
    testLocation,
    parkingLocations,
    selectedParkingLocationId,
    onSelectParkingLocation,
    onRegionChangeComplete,
    checkpoints,
    onSelectCheckpoint,
    evStations, selectedEvStationId, onSelectEvStation,
    carServices, activeCarServiceCategory, selectedCarServiceId, onSelectCarService, carServiceAccessibilityLabel,
    tourismPlaces, selectedTourismPlaceId, onSelectTourismPlace, tourismPlaceMarkerCategory, tourismPlaceAccessibilityLabel,
    roadReports,
    selectedRoadReportId,
    onSelectRoadReport,
    reportDraft,
    route,
    landmark,
    needStops,
    style,
  },
  ref,
) {
  const { colors } = useTheme();
  const { t, row, isRTL } = useLocale();
  const hostRef = useRef<View>(null);
  const mapRef = useRef<L.Map | null>(null);
  const pendingFitRef = useRef<PendingFit | undefined>(undefined);
  // The last region we reported upward. The screen feeds it straight back in
  // as `region`, and re-fitting to our own echo would nudge the map in a loop.
  const emitted = useRef<GeoRegion | undefined>(undefined);
  // Bumped on every pan/zoom frame so the pin overlay re-projects.
  const [, setFrame] = useState(0);

  // Listeners are bound once; read the latest callbacks through a ref.
  const handlers = useRef({ onPressBackground, onPressMap, onRegionChangeComplete });
  handlers.current = { onPressBackground, onPressMap, onRegionChangeComplete };

  useEffect(() => {
    // On web a View ref is the underlying DOM element.
    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;

    // Zoom animation is off so the pin overlay moves in lockstep with the tiles.
    const map = L.map(host, { zoomControl: false, zoomAnimation: false, zoomSnap: 0.25 });
    map.attributionControl.setPrefix(false);
    L.tileLayer(SATELLITE, { maxZoom: 19, attribution: 'Imagery © Esri' }).addTo(map);
    L.tileLayer(ROADS, { maxZoom: 19 }).addTo(map);
    L.tileLayer(PLACES, { maxZoom: 19 }).addTo(map);
    const initialRegion = isValidGeoRegion(region) ? region : DEFAULT_REGION;
    map.setView([initialRegion.latitude, initialRegion.longitude], 15);

    const redraw = () => setFrame((n) => n + 1);
    map.on('move zoom', redraw);
    map.on('moveend', () => {
      const next = regionOf(map);
      emitted.current = next;
      handlers.current.onRegionChangeComplete?.(next);
      redraw();
    });
    map.on('click', (event) => {
      handlers.current.onPressMap?.({ latitude: event.latlng.lat, longitude: event.latlng.lng });
      handlers.current.onPressBackground?.();
    });
    mapRef.current = map;

    // The host may get its real size after mount; fit the region once it has one.
    let fitted = false;
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      if (!fitted && host.clientWidth > 0 && host.clientHeight > 0) {
        fitted = true;
        map.fitBounds(toBounds(initialRegion));
      }
      const pendingFit = pendingFitRef.current;
      if (pendingFit && fitMapToCoordinates(map, pendingFit) === 'applied') {
        pendingFitRef.current = undefined;
      }
      redraw();
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // Mount once — later regions are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow regions the screen asks for (first GPS fix, search result).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isValidGeoRegion(region) || sameRegion(region, emitted.current)) return;
    map.fitBounds(toBounds(region));
  }, [region]);

  // Routes are Leaflet polylines — they belong to the map, not the pin overlay.
  useEffect(() => {
    if (!route) {
      pendingFitRef.current = undefined;
      return;
    }
    const map = mapRef.current;
    if (!map) return;
    const toLatLngs = (line: GeoPoint[]) =>
      line.map((point) => [point.latitude, point.longitude] as L.LatLngTuple);

    const mainLine = route.coordinates.filter(isValidGeoPoint);
    if (mainLine.length !== route.coordinates.length || mainLine.length < 2) return;

    const trafficSegments = route.trafficSegments
      ?.filter((segment) => segment.coordinates.length >= 2 && segment.coordinates.every(isValidGeoPoint));
    const hasTrafficSegments = Boolean(trafficSegments?.length);
    const detourSegments = route.detourSegments
      ?.filter((line) => line.length >= 2 && line.every(isValidGeoPoint)) ?? [];
    const detourOpacity = route.detourMode === 'comparison' ? 0.52 : 1;
    const detourDash = route.detourMode === 'comparison' ? '6 8' : undefined;
    const layers = [
      ...route.alternatives
        .filter((line) => line.length >= 2 && line.every(isValidGeoPoint))
        .map((line) =>
          L.polyline(toLatLngs(line), {
            color: colors.textTertiary,
            weight: 4,
            opacity: 0.85,
            dashArray: '8 8',
          }),
        ),
      // A light casing under the route keeps it readable on satellite imagery.
      L.polyline(toLatLngs(mainLine), { color: colors.surface, weight: 9, opacity: 0.9 }),
      ...(hasTrafficSegments
        ? trafficSegments!.map((segment) =>
            withTrafficTooltip(
              L.polyline(toLatLngs(segment.coordinates), {
                color: TRAFFIC_COLORS[segment.state],
                weight: 5,
              }),
              segment.state,
            ),
          )
        : [
            withTrafficTooltip(
              L.polyline(toLatLngs(mainLine), {
                color: route.trafficState ? TRAFFIC_COLORS[route.trafficState] : colors.brand,
                weight: 5,
              }),
              route.trafficState,
            ),
          ]),
      ...detourSegments.flatMap((line, index) => [
        L.polyline(toLatLngs(line), {
          color: colors.surface,
          weight: route.detourMode === 'comparison' ? 8 : 10,
          opacity: 0.86,
          dashArray: detourDash,
        }),
        L.polyline(toLatLngs(line), {
          color: NEED_DETOUR_COLOR,
          weight: route.detourMode === 'comparison' ? 4 : 6,
          opacity: detourOpacity,
          dashArray: detourDash,
        }).bindTooltip(t('route.needDetourLegend'), {
          direction: 'top',
          opacity: 0.95,
          sticky: true,
        }),
      ]),
    ];
    layers.forEach((layer) => layer.addTo(map));
    return () => layers.forEach((layer) => layer.remove());
  }, [route, colors, t]);

  useImperativeHandle(ref, () => ({
    animateToRegion: (next, durationMs = 600) => {
      if (!isValidGeoRegion(next)) return;
      mapRef.current?.flyToBounds(toBounds(next), { duration: durationMs / 1000 });
    },
    fitToCoordinates: (
      coordinates,
      edgePadding = { top: 80, right: 40, bottom: 160, left: 40 },
      durationMs = 600,
    ) => {
      const validCoordinates = normalizeGeoPoints(coordinates);
      if (!validCoordinates.length) {
        pendingFitRef.current = undefined;
        return;
      }
      const request = { coordinates: validCoordinates, edgePadding, durationMs };
      const map = mapRef.current;
      if (!map || fitMapToCoordinates(map, request) === 'deferred') {
        pendingFitRef.current = request;
      } else {
        pendingFitRef.current = undefined;
      }
    },
  }));

  const map = mapRef.current;
  const project = (latitude: number, longitude: number) =>
    map!.latLngToContainerPoint([latitude, longitude]);
  const size = map?.getSize();
  const userPoint =
    map && isValidGeoPoint(userLocation)
      ? project(userLocation.latitude, userLocation.longitude)
      : null;
  const testPoint =
    map && isValidGeoPoint(testLocation)
      ? project(testLocation.latitude, testLocation.longitude)
      : null;

  return (
    <View style={[{ backgroundColor: colors.mapLand, overflow: 'hidden' }, style]}>
      <View ref={hostRef} style={[StyleSheet.absoluteFill, { zIndex: 0 }]} />

      {route?.showRouteLegend && route.detourSegments?.length ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 112,
            [isRTL ? 'right' : 'left']: spacing.md,
            zIndex: 2,
            gap: spacing.xs,
            padding: spacing.sm,
            borderRadius: radius.md,
            backgroundColor: colors.glass,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.glassBorder,
            ...shadow.xs,
          }}
        >
          <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.xs }}>
            <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: colors.brand }} />
            <AppText variant="caption" color="textSecondary">{t('route.standardLegend')}</AppText>
          </View>
          <View style={{ flexDirection: row, alignItems: 'center', gap: spacing.xs }}>
            <View style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: NEED_DETOUR_COLOR }} />
            <AppText variant="caption" color="textSecondary">{t('route.needDetourLegend')}</AppText>
          </View>
        </View>
      ) : null}

      {map && size ? (
        <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 1 }]}>
          {userPoint ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: userPoint.x - 26,
                top: userPoint.y - 26,
                width: 52,
                height: 52,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  borderRadius: 26,
                  backgroundColor: colors.info,
                  opacity: 0.18,
                }}
              />
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: colors.info,
                  borderWidth: 3,
                  borderColor: colors.surface,
                }}
              />
            </View>
          ) : null}

          {testPoint ? (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: testPoint.x - 17,
                top: testPoint.y - 17,
                width: 34,
                height: 34,
              }}
            >
              <TestLocationMarker />
            </View>
          ) : null}

          {checkpoints?.map((checkpoint) => {
            if (!isValidGeoPoint(checkpoint.location)) return null;
            const { x, y } = project(checkpoint.location.latitude, checkpoint.location.longitude);
            if (x < -80 || y < -40 || x > size.x + 80 || y > size.y + 40) return null;

            return (
              <Pressable
                key={checkpoint.id}
                onPress={() => onSelectCheckpoint?.(checkpoint.id)}
                accessibilityRole="button"
                accessibilityLabel={`${checkpoint.name}, ${checkpoint.status}`}
                style={{ position: 'absolute', left: x - 75, top: y - 15, width: 150, alignItems: 'center' }}
              >
                <CheckpointMarker
                  status={checkpoint.status}
                  assumed={checkpoint.assumed}
                  label={checkpoint.name}
                />
              </Pressable>
            );
          })}

          {evStations?.map((station) => {
            if (!isValidGeoPoint(station)) return null;
            const { x, y } = project(station.latitude, station.longitude);
            if (x < -50 || y < -50 || x > size.x + 50 || y > size.y + 50) return null;
            return <Pressable key={station.id} accessibilityRole="button" accessibilityLabel={station.name} accessibilityState={{ selected: station.id === selectedEvStationId }}
              onPress={() => onSelectEvStation?.(station)}
              style={{ position: 'absolute', left: x - 24, top: y - 24, width: 48, height: 48, zIndex: station.id === selectedEvStationId ? 6 : 3 }}>
              <EvStationMarker status={station.status} selected={station.id === selectedEvStationId} />
            </Pressable>;
          })}
          {carServices?.map((service) => {
            if (!activeCarServiceCategory || !isValidGeoPoint({ latitude: service.latitude, longitude: service.longitude })) return null;
            const { x, y } = project(service.latitude, service.longitude);
            if (x < -50 || y < -50 || x > size.x + 50 || y > size.y + 50) return null;
            return <Pressable key={service.id} accessibilityRole="button" accessibilityLabel={carServiceAccessibilityLabel?.(service) ?? service.nameEn} accessibilityState={{ selected: service.id === selectedCarServiceId }}
              onPress={() => onSelectCarService?.(service)}
              style={{ position: 'absolute', left: x - 24, top: y - 24, width: 48, height: 48, zIndex: service.id === selectedCarServiceId ? 6 : 3 }}>
              <CarServiceMarker category={activeCarServiceCategory} selected={service.id === selectedCarServiceId} />
            </Pressable>;
          })}
          {tourismPlaces?.map((place) => {
            if (!isValidGeoPoint({ latitude: place.latitude, longitude: place.longitude })) return null;
            const { x, y } = project(place.latitude, place.longitude);
            if (x < -50 || y < -50 || x > size.x + 50 || y > size.y + 50) return null;
            const category = tourismPlaceMarkerCategory?.(place) ?? place.primaryCategory;
            return <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={tourismPlaceAccessibilityLabel?.(place) ?? place.nameEn} accessibilityState={{ selected: place.id === selectedTourismPlaceId }}
              onPress={() => onSelectTourismPlace?.(place)}
              style={{ position: 'absolute', left: x - 24, top: y - 24, width: 48, height: 48, zIndex: place.id === selectedTourismPlaceId ? 6 : 3 }}>
              <TourismPlaceMarker category={category} selected={place.id === selectedTourismPlaceId} />
            </Pressable>;
          })}
          {roadReports?.map((report) => {
            if (!isValidGeoPoint(report)) return null;
            const { x, y } = project(report.latitude, report.longitude);
            if (x < -50 || y < -50 || x > size.x + 50 || y > size.y + 50) return null;
            return (
              <Pressable
                key={report.id}
                onPress={() => onSelectRoadReport?.(report)}
                accessibilityRole="button"
                accessibilityLabel={report.type}
                style={{ position: 'absolute', left: x - 24, top: y - 40, width: 48, alignItems: 'center', zIndex: report.id === selectedRoadReportId ? 6 : 4 }}
              >
                <RoadReportMarker type={report.type} selected={report.id === selectedRoadReportId} />
              </Pressable>
            );
          })}

          {reportDraft ? (() => {
            if (!isValidGeoPoint(reportDraft.location)) return null;
            const { x, y } = project(reportDraft.location.latitude, reportDraft.location.longitude);
            return <View pointerEvents="none" style={{ position: 'absolute', left: x - 24, top: y - 40, width: 48, alignItems: 'center', zIndex: 8 }}><RoadReportMarker type={reportDraft.type} selected /></View>;
          })() : null}

          {landmark
            ? (() => {
                if (!isValidGeoPoint(landmark.location)) return null;
                const { x, y } = project(landmark.location.latitude, landmark.location.longitude);
                return (
                  <View
                    pointerEvents="none"
                    style={{ position: 'absolute', left: x - 95, top: y - 16, width: 190, alignItems: 'center' }}
                  >
                    <LandmarkMarker name={landmark.name} />
                  </View>
                );
              })()
            : null}

          {needStops?.map((stop) => {
            if (!isValidGeoPoint(stop.location)) return null;
            const { x, y } = project(stop.location.latitude, stop.location.longitude);
            if (x < -110 || y < -60 || x > size.x + 110 || y > size.y + 60) return null;
            return (
              <View
                key={stop.id}
                pointerEvents="none"
                style={{ position: 'absolute', left: x - 90, top: y - 44, width: 180, alignItems: 'center', zIndex: 7 }}
              >
                <NeedStopMarker name={stop.name} category={stop.category} />
              </View>
            );
          })}

          {parkingLocations?.map((location) => {
            if (!isValidGeoPoint(location.location)) return null;
            const { x, y } = project(location.location.latitude, location.location.longitude);
            if (x < -60 || y < -60 || x > size.x + 60 || y > size.y + 60) return null;

            return (
              <Pressable
                key={location.id}
                onPress={() => onSelectParkingLocation?.(location)}
                accessibilityRole="button"
                accessibilityLabel={parkingLocationAccessibilityLabel(location)}
                style={{
                  position: 'absolute',
                  left: x - 44,
                  top: y - 50,
                  width: 88,
                  alignItems: 'center',
                  zIndex: location.id === selectedParkingLocationId ? 3 : 2,
                }}
              >
                <ParkingLocationMarker
                  location={location}
                  selected={location.id === selectedParkingLocationId}
                />
              </Pressable>
            );
          })}

          {zones.map((zone) => {
            if (!isValidGeoPoint(zone.location)) return null;
            const { x, y } = project(zone.location.latitude, zone.location.longitude);
            // Skip pins that fall outside the visible surface.
            if (x < -60 || y < -60 || x > size.x + 60 || y > size.y + 60) return null;

            return (
              <Pressable
                key={zone.id}
                onPress={() => onSelectZone(zone)}
                accessibilityRole="button"
                accessibilityLabel={`${zone.name}, ${zone.availability}`}
                style={{
                  position: 'absolute',
                  left: x - 44,
                  top: y - 52,
                  width: 88,
                  alignItems: 'center',
                }}
              >
                <ZoneMarker zone={zone} selected={zone.id === selectedZoneId} />
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
});
