import 'dotenv/config';
import { debugRamallahTraffic } from '../src/modules/routing/traffic';

const formatPoint = (point: { latitude: number; longitude: number }) =>
  `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;

const formatKm = (meters?: number) =>
  meters === undefined ? 'n/a' : `${(meters / 1000).toFixed(1)} km`;

const formatMinutes = (seconds?: number) =>
  seconds === undefined
    ? 'n/a'
    : `${seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0} min (${seconds}s)`;

const formatDelay = (seconds?: number) =>
  seconds === undefined ? 'n/a' : `+${formatMinutes(seconds)}`;

async function main() {
  if (!process.env.GOOGLE_ROUTES_API_KEY) {
    console.log('Traffic data test: GOOGLE_ROUTES_API_KEY is not set. Live traffic test skipped.');
    return;
  }

  const results = await debugRamallahTraffic();
  console.log('Traffic data test:');
  for (const result of results) {
    console.log(`Route: ${result.name}`);
    console.log(`Origin: ${formatPoint(result.origin)}`);
    console.log(`Destination: ${formatPoint(result.destination)}`);
    console.log(`Route returned successfully: ${result.routeReturned ? 'yes' : 'no'}`);
    console.log(`Distance: ${formatKm(result.distanceMeters)}`);
    console.log(`Static duration: ${formatMinutes(result.staticDurationSeconds)}`);
    console.log(`Traffic-aware duration: ${formatMinutes(result.durationSeconds)}`);
    console.log(`Delay: ${formatDelay(result.delaySeconds)}`);
    console.log(`Delay percentage: ${result.delayPercent === undefined ? 'n/a' : `${result.delayPercent.toFixed(1)}%`}`);
    console.log(`Traffic intervals: ${result.trafficIntervals}`);
    console.log(`NORMAL: ${result.normal}`);
    console.log(`SLOW: ${result.slow}`);
    console.log(`TRAFFIC_JAM: ${result.trafficJam}`);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
