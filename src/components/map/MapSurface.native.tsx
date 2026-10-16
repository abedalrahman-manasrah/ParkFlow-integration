import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
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
import { mapStyleDark, mapStyleLight } from './mapStyle';
import type { RouteTrafficState } from '@/types';
import { isValidGeoPoint } from '@/utils/coordinates';

const TRAFFIC_COLORS: Record<RouteTrafficState, string> = {
  normal: '#16A34A',
  slow: '#F59E0B',
  traffic_jam: '#DC2626',
};
const NEED_DETOUR_COLOR = '#7C3AED';

/**
 * Google Maps on Android; Apple Maps on iOS (custom JSON styling only applies to
 * the Google provider, which is why the style array is passed conditionally).
 */
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
  const { isDark, colors } = useTheme();
  const { t, row, isRTL } = useLocale();
  const mapRef = useRef<MapView>(null);

  useImperativeHandle(ref, () => ({
    animateToRegion: (next, durationMs = 500) => {
      mapRef.current?.animateToRegion(next as Region, durationMs);
    },
    fitToCoordinates: (coordinates, edgePadding = { top: 80, right: 40, bottom: 160, left: 40 }) => {
      mapRef.current?.fitToCoordinates(coordinates, { edgePadding, animated: true });
    },
  }));

  const customMapStyle = useMemo(
    () => (Platform.OS === 'android' ? (isDark ? mapStyleDark : mapStyleLight) : undefined),
    [isDark],
  );

  return (
    <View style={style}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region as Region}
        customMapStyle={customMapStyle}
        showsUserLocation={Boolean(userLocation)}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        onPress={(event) => {
          onPressMap?.(event.nativeEvent.coordinate);
          onPressBackground?.();
        }}
        onRegionChangeComplete={(next) => onRegionChangeComplete?.(next)}
      >
        {route ? (
          <>
            {route.alternatives.map((line, index) => (
              <Polyline
                key={`alt-${index}`}
                coordinates={line}
                strokeColor={colors.textTertiary}
                strokeWidth={4}
                lineDashPattern={[8, 8]}
              />
            ))}
            {route.trafficSegments?.length ? (
              route.trafficSegments.map((segment, index) => (
                <Polyline
                  key={`traffic-${index}-${segment.state}`}
                  coordinates={segment.coordinates}
                  strokeColor={TRAFFIC_COLORS[segment.state]}
                  strokeWidth={5}
                />
              ))
            ) : (
              <Polyline
                coordinates={route.coordinates}
                strokeColor={route.trafficState ? TRAFFIC_COLORS[route.trafficState] : colors.brand}
                strokeWidth={5}
              />
            )}
            {route.detourSegments?.map((line, index) => (
              <Polyline
                key={`need-detour-casing-${index}`}
                coordinates={line}
                strokeColor={colors.surface}
                strokeWidth={route.detourMode === 'comparison' ? 8 : 10}
                lineDashPattern={route.detourMode === 'comparison' ? [6, 8] : undefined}
              />
            ))}
            {route.detourSegments?.map((line, index) => (
              <Polyline
                key={`need-detour-${index}`}
                coordinates={line}
                strokeColor={route.detourMode === 'comparison' ? 'rgba(124,58,237,0.55)' : NEED_DETOUR_COLOR}
                strokeWidth={route.detourMode === 'comparison' ? 4 : 6}
                lineDashPattern={route.detourMode === 'comparison' ? [6, 8] : undefined}
              />
            ))}
          </>
        ) : null}

        {checkpoints?.map((checkpoint) => (
          <Marker
            key={checkpoint.id}
            coordinate={checkpoint.location}
            onPress={(event) => {
              event.stopPropagation();
              onSelectCheckpoint?.(checkpoint.id);
            }}
            anchor={{ x: 0.5, y: 0.5 }}
            accessibilityLabel={`${checkpoint.name}, ${checkpoint.status}`}
          >
            <CheckpointMarker status={checkpoint.status} assumed={checkpoint.assumed} label={checkpoint.name} />
          </Marker>
        ))}

        {evStations?.map((station) => (
          <Marker key={`${station.id}-${station.status}-${station.id === selectedEvStationId}`} coordinate={{ latitude: station.latitude, longitude: station.longitude }} anchor={{ x: 0.5, y: 0.5 }}
            accessibilityLabel={station.name} tracksViewChanges={false} zIndex={station.id === selectedEvStationId ? 60 : 30}
            onPress={(event) => { event.stopPropagation(); onSelectEvStation?.(station); }}>
            <EvStationMarker status={station.status} selected={station.id === selectedEvStationId} />
          </Marker>
        ))}
        {carServices?.map((service) => activeCarServiceCategory && isValidGeoPoint({ latitude: service.latitude, longitude: service.longitude }) ? (
          <Marker key={`${service.id}-${activeCarServiceCategory}-${service.id === selectedCarServiceId}`} coordinate={{ latitude: service.latitude, longitude: service.longitude }} anchor={{ x: 0.5, y: 0.5 }}
            accessibilityLabel={carServiceAccessibilityLabel?.(service) ?? service.nameEn} tracksViewChanges={false} zIndex={service.id === selectedCarServiceId ? 60 : 30}
            onPress={(event) => { event.stopPropagation(); onSelectCarService?.(service); }}>
            <CarServiceMarker category={activeCarServiceCategory} selected={service.id === selectedCarServiceId} />
          </Marker>
        ) : null)}
        {tourismPlaces?.map((place) => isValidGeoPoint({ latitude: place.latitude, longitude: place.longitude }) ? (
          <Marker key={`${place.id}-${place.id === selectedTourismPlaceId}`} coordinate={{ latitude: place.latitude, longitude: place.longitude }} anchor={{ x: 0.5, y: 0.5 }}
            accessibilityLabel={tourismPlaceAccessibilityLabel?.(place) ?? place.nameEn} tracksViewChanges={false} zIndex={place.id === selectedTourismPlaceId ? 60 : 30}
            onPress={(event) => { event.stopPropagation(); onSelectTourismPlace?.(place); }}>
            <TourismPlaceMarker category={tourismPlaceMarkerCategory?.(place) ?? place.primaryCategory} selected={place.id === selectedTourismPlaceId} />
          </Marker>
        ) : null)}
        {roadReports?.map((report) => (
          <Marker
            key={report.id}
            coordinate={{ latitude: report.latitude, longitude: report.longitude }}
            onPress={(event) => { event.stopPropagation(); onSelectRoadReport?.(report); }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={report.id === selectedRoadReportId ? 60 : 40}
            tracksViewChanges
            accessibilityLabel={report.type}
          >
            <RoadReportMarker type={report.type} selected={report.id === selectedRoadReportId} />
          </Marker>
        ))}

        {reportDraft ? <Marker coordinate={reportDraft.location} anchor={{ x: 0.5, y: 1 }} zIndex={80}><RoadReportMarker type={reportDraft.type} selected /></Marker> : null}

        {landmark ? (
          <Marker coordinate={landmark.location} anchor={{ x: 0.5, y: 0.5 }}>
            <LandmarkMarker name={landmark.name} />
          </Marker>
        ) : null}

        {needStops?.map((stop) => (
          <Marker
            key={stop.id}
            coordinate={stop.location}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={70}
            tracksViewChanges
            accessibilityLabel={`${stop.name}, ${stop.category}`}
          >
            <NeedStopMarker name={stop.name} category={stop.category} />
          </Marker>
        ))}

        {testLocation ? (
          <Marker coordinate={testLocation} anchor={{ x: 0.5, y: 0.5 }} accessibilityLabel="Test location">
            <TestLocationMarker />
          </Marker>
        ) : null}

        {parkingLocations?.map((location) => (
          <Marker
            key={location.id}
            coordinate={location.location}
            onPress={(event) => {
              event.stopPropagation();
              onSelectParkingLocation?.(location);
            }}
            anchor={{ x: 0.5, y: 1 }}
            zIndex={location.id === selectedParkingLocationId ? 30 : 20}
            tracksViewChanges
            accessibilityLabel={parkingLocationAccessibilityLabel(location)}
          >
            <ParkingLocationMarker
              location={location}
              selected={location.id === selectedParkingLocationId}
            />
          </Marker>
        ))}

        {zones.map((zone) => (
          <Marker
            key={zone.id}
            coordinate={zone.location}
            onPress={(event) => {
              // Stop the tap also registering as a background press.
              event.stopPropagation();
              onSelectZone(zone);
            }}
            anchor={{ x: 0.5, y: 1 }}
            // Left on so markers restyle when selected; a handful of pins is
            // well within budget. Revisit if zone density grows a lot.
            tracksViewChanges
            accessibilityLabel={`${zone.name}, ${zone.availability}`}
          >
            <ZoneMarker zone={zone} selected={zone.id === selectedZoneId} />
          </Marker>
        ))}
      </MapView>
      {route?.showRouteLegend && route.detourSegments?.length ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 112,
            [isRTL ? 'right' : 'left']: spacing.md,
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
    </View>
  );
});
