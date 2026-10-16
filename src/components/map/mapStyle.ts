/**
 * Google Maps style JSON. The goal is a quiet base map: muted land, softened
 * roads and no points of interest competing with our parking pins.
 */
type MapStyleElement = {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string | number>[];
};

export const mapStyleLight: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#F0F2EB' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#63716B' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#F6EEDF' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#EAF4F0' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DCE9E9' }] },
];

export const mapStyleDark: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#293831' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8FA39C' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#202C27' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#3A4D42' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#4A6053' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#2C4034' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#30474B' }] },
];
