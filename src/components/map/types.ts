import type { StyleProp, ViewStyle } from 'react-native';
import type {
  CheckpointStatus,
  GeoPoint,
  GeoRegion,
  ParkingZone,
  RamallahParkingLocation,
  RoadReport,
  RoadReportType,
  RouteTrafficSegment,
  CarServiceBusiness,
  CarServiceCategory,
  TourismPlace,
  TourismPlaceCategory,
} from '@/types';

export interface MapCheckpoint {
  id: string;
  name: string;
  location: GeoPoint;
  status: CheckpointStatus;
  assumed: boolean;
}

export interface MapRoute {
  coordinates: GeoPoint[];
  trafficState?: RouteTrafficSegment['state'];
  trafficSegments?: RouteTrafficSegment[];
  /** Need-aware route portions that diverge from the shortest route. */
  detourSegments?: GeoPoint[][];
  detourMode?: 'primary' | 'comparison';
  showRouteLegend?: boolean;
  /** Alternatives that were not taken — drawn dashed. */
  alternatives: GeoPoint[][];
}

export interface MapLandmark {
  name: string;
  location: GeoPoint;
}

export interface MapNeedStop {
  id: string;
  name: string;
  category: string;
  location: GeoPoint;
}

/**
 * Platform-agnostic map contract. The native implementation renders
 * react-native-maps; the web implementation renders Leaflet with satellite tiles
 * so the app is fully previewable in a browser. Screens only ever see this interface.
 */
export interface MapSurfaceProps {
  carServices?: CarServiceBusiness[];
  activeCarServiceCategory?: CarServiceCategory;
  selectedCarServiceId?: string;
  onSelectCarService?: (service: CarServiceBusiness) => void;
  carServiceAccessibilityLabel?: (service: CarServiceBusiness) => string;
  tourismPlaces?: TourismPlace[];
  selectedTourismPlaceId?: string;
  onSelectTourismPlace?: (place: TourismPlace) => void;
  tourismPlaceMarkerCategory?: (place: TourismPlace) => TourismPlaceCategory;
  tourismPlaceAccessibilityLabel?: (place: TourismPlace) => string;
  evStations?: import('@/types').EvChargingStation[];
  selectedEvStationId?: string;
  onSelectEvStation?: (station: import('@/types').EvChargingStation) => void;
  region: GeoRegion;
  zones: ParkingZone[];
  selectedZoneId?: string;
  onSelectZone: (zone: ParkingZone) => void;
  onPressBackground?: () => void;
  onPressMap?: (coordinate: GeoPoint) => void;
  userLocation?: GeoPoint;
  testLocation?: GeoPoint;
  parkingLocations?: RamallahParkingLocation[];
  selectedParkingLocationId?: string;
  onSelectParkingLocation?: (location: RamallahParkingLocation) => void;
  /** Fired after the user finishes moving the map. */
  onRegionChangeComplete?: (region: GeoRegion) => void;
  checkpoints?: MapCheckpoint[];
  onSelectCheckpoint?: (checkpointId: string) => void;
  roadReports?: RoadReport[];
  selectedRoadReportId?: string;
  onSelectRoadReport?: (report: RoadReport) => void;
  reportDraft?: { location: GeoPoint; type: RoadReportType };
  route?: MapRoute;
  /** The place a landmark search resolved to. */
  landmark?: MapLandmark;
  needStops?: MapNeedStop[];
  style?: StyleProp<ViewStyle>;
}

export interface MapSurfaceHandle {
  animateToRegion: (region: GeoRegion, durationMs?: number) => void;
  fitToCoordinates: (
    coordinates: GeoPoint[],
    edgePadding?: { top: number; right: number; bottom: number; left: number },
    durationMs?: number,
  ) => void;
}
