import { z } from 'zod';
import { db } from '../../database/client';
import { requireValue } from '../../utils/errors';
import rawConfig from './demoLayouts.json';

const templateId = z.enum(['parallel_rows', 'u_shape', 'angled_parking', 'split_zones']);
const spotCode = z.string().regex(/^[A-D](0[1-9]|10)$/);
const locationConfigSchema = z.object({
  parkingId: z.string().min(1),
  template: templateId,
  entranceLabel: z.string().min(1),
  exitLabel: z.string().min(1),
  occupied: z.array(spotCode),
  outOfService: z.array(spotCode),
  accessible: z.array(spotCode),
  ev: z.array(spotCode),
}).strict().superRefine((value, context) => {
  const stateCodes = [...value.occupied, ...value.outOfService];
  if (new Set(stateCodes).size !== stateCodes.length) {
    context.addIssue({ code: 'custom', message: 'A space cannot be both occupied and out of service' });
  }
  const typeCodes = [...value.accessible, ...value.ev];
  if (new Set(typeCodes).size !== typeCodes.length) {
    context.addIssue({ code: 'custom', message: 'A space cannot be both accessible and EV' });
  }
});
const configSchema = z.object({
  version: z.literal(1),
  lastUpdated: z.iso.datetime(),
  locations: z.array(locationConfigSchema).min(1),
}).strict().superRefine((value, context) => {
  const ids = value.locations.map((item) => item.parkingId);
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', message: 'Parking IDs must be unique' });
  }
});

const config = configSchema.parse(rawConfig);
const locationConfigs = new Map(config.locations.map((item) => [item.parkingId, item]));

export type DemoSpotState = 'available' | 'reserved' | 'occupied' | 'out_of_service';
export type DemoSpotType = 'regular' | 'accessible' | 'ev';
type TemplateId = z.infer<typeof templateId>;

interface GeometrySpot {
  code: string;
  section: 'A' | 'B' | 'C' | 'D';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface TemplateGeometry {
  width: number;
  height: number;
  spots: GeometrySpot[];
  lanes: Array<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    kind: 'driving_lane' | 'one_way_lane';
    direction?: 'left' | 'right';
  }>;
  islands: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  entrance: { x: number; y: number };
  exit: { x: number; y: number };
}

const row = (
  section: GeometrySpot['section'],
  y: number,
  options: { startX?: number; step?: number; width?: number; height?: number; rotation?: number } = {},
): GeometrySpot[] => Array.from({ length: 10 }, (_, index) => ({
  code: `${section}${String(index + 1).padStart(2, '0')}`,
  section,
  x: (options.startX ?? 18) + index * (options.step ?? 32),
  y,
  width: options.width ?? 28,
  height: options.height ?? 54,
  rotation: options.rotation ?? 0,
}));

const column = (section: GeometrySpot['section'], x: number, startY = 174): GeometrySpot[] =>
  Array.from({ length: 10 }, (_, index) => ({
    code: `${section}${String(index + 1).padStart(2, '0')}`,
    section,
    x,
    y: startY + index * 30,
    width: 54,
    height: 26,
    rotation: 0,
  }));

const templates: Record<TemplateId, TemplateGeometry> = {
  parallel_rows: {
    width: 360,
    height: 520,
    spots: [...row('A', 54), ...row('B', 124), ...row('C', 334), ...row('D', 404)],
    lanes: [{ id: 'central', x: 14, y: 202, width: 332, height: 100, rotation: 0, kind: 'driving_lane' }],
    islands: [],
    entrance: { x: 18, y: 492 },
    exit: { x: 342, y: 492 },
  },
  u_shape: {
    width: 360,
    height: 520,
    spots: [
      ...row('A', 38, { startX: 30, step: 30, width: 26, height: 50 }),
      ...row('B', 98, { startX: 30, step: 30, width: 26, height: 50 }),
      ...column('C', 22),
      ...column('D', 284),
    ],
    lanes: [{ id: 'courtyard', x: 90, y: 176, width: 180, height: 280, rotation: 0, kind: 'driving_lane' }],
    islands: [],
    entrance: { x: 142, y: 492 },
    exit: { x: 218, y: 492 },
  },
  angled_parking: {
    width: 360,
    height: 560,
    spots: [
      ...row('A', 54, { startX: 22, step: 32, width: 25, height: 58, rotation: -45 }),
      ...row('B', 154, { startX: 22, step: 32, width: 25, height: 58, rotation: 45 }),
      ...row('C', 342, { startX: 22, step: 32, width: 25, height: 58, rotation: -45 }),
      ...row('D', 442, { startX: 22, step: 32, width: 25, height: 58, rotation: 45 }),
    ],
    lanes: [
      { id: 'eastbound', x: 12, y: 244, width: 336, height: 40, rotation: 0, kind: 'one_way_lane', direction: 'right' },
      { id: 'westbound', x: 12, y: 292, width: 336, height: 40, rotation: 0, kind: 'one_way_lane', direction: 'left' },
    ],
    islands: [],
    entrance: { x: 16, y: 532 },
    exit: { x: 344, y: 28 },
  },
  split_zones: {
    width: 360,
    height: 560,
    spots: [...row('A', 58), ...row('B', 132), ...row('C', 372), ...row('D', 446)],
    lanes: [{ id: 'central', x: 12, y: 252, width: 336, height: 66, rotation: 0, kind: 'driving_lane' }],
    islands: [
      { id: 'island-west', x: 104, y: 240, width: 34, height: 90 },
      { id: 'island-east', x: 222, y: 240, width: 34, height: 90 },
    ],
    entrance: { x: 16, y: 285 },
    exit: { x: 344, y: 285 },
  },
};

export function getConfiguredSpot(parkingId: string, requestedSpotId: string) {
  const parkingConfig = locationConfigs.get(parkingId);
  if (!parkingConfig) return undefined;
  const geometry = templates[parkingConfig.template];
  const spot = geometry.spots.find((item) => `${parkingId}:${item.code}` === requestedSpotId);
  if (!spot) return undefined;
  const state: DemoSpotState = (parkingConfig.outOfService as string[]).includes(spot.code)
    ? 'out_of_service'
    : (parkingConfig.occupied as string[]).includes(spot.code) ? 'occupied' : 'available';
  const type: DemoSpotType = (parkingConfig.accessible as string[]).includes(spot.code)
    ? 'accessible'
    : (parkingConfig.ev as string[]).includes(spot.code) ? 'ev' : 'regular';
  return { ...spot, id: requestedSpotId, state, type };
}

export async function getDemoLayout(parkingId: string) {
  const parkingConfig = requireValue(locationConfigs.get(parkingId), 'Demo parking layout not found');
  const parking = requireValue(await db.parkingZone.findFirst({
    where: { id: parkingId, active: true },
    select: { id: true, name: true, nameAr: true, updatedAt: true },
  }), 'Parking location not found');
  const geometry = templates[parkingConfig.template];
  const now = new Date();
  const reservations = await db.parkingReservation.findMany({
    where: {
      parkingZoneId: parkingId,
      spotId: { not: null },
      status: { in: ['confirmed', 'checked_in'] },
      endTime: { gt: now },
    },
    select: { spotId: true, status: true, updatedAt: true },
  });
  const reservationStates = new Map<string, DemoSpotState>();
  for (const reservation of reservations) {
    if (!reservation.spotId) continue;
    const next = reservation.status === 'checked_in' ? 'occupied' : 'reserved';
    if (next === 'occupied' || !reservationStates.has(reservation.spotId)) {
      reservationStates.set(reservation.spotId, next);
    }
  }
  const spots = geometry.spots.map((spot) => {
    const configured = getConfiguredSpot(parkingId, `${parkingId}:${spot.code}`)!;
    return {
      ...configured,
      state: configured.state === 'out_of_service'
        ? configured.state
        : reservationStates.get(configured.id) ?? configured.state,
    };
  });
  const latestReservation = reservations.reduce<Date | undefined>(
    (latest, item) => !latest || item.updatedAt > latest ? item.updatedAt : latest,
    undefined,
  );
  const lastUpdated = [new Date(config.lastUpdated), parking.updatedAt, latestReservation]
    .filter((value): value is Date => Boolean(value))
    .reduce((latest, value) => value > latest ? value : latest)
    .toISOString();

  return {
    parkingId: parking.id,
    parkingName: parking.name,
    parkingNameAr: parking.nameAr,
    template: parkingConfig.template,
    dimensions: { width: geometry.width, height: geometry.height },
    section: { name: 'Demo reservable section', nameAr: 'قسم تجريبي قابل للحجز', spaceCount: 40 },
    entrance: { ...geometry.entrance, label: parkingConfig.entranceLabel },
    exit: { ...geometry.exit, label: parkingConfig.exitLabel },
    lanes: geometry.lanes,
    islands: geometry.islands,
    spots,
    legend: {
      statuses: [
        { id: 'available', label: 'Available', labelAr: 'متاح', color: '#1F5A4A' },
        { id: 'reserved', label: 'Reserved', labelAr: 'محجوز', color: '#C89B5B' },
        { id: 'occupied', label: 'Occupied', labelAr: 'مشغول', color: '#B34F50' },
        { id: 'out_of_service', label: 'Out of service', labelAr: 'خارج الخدمة', color: '#606E67' },
      ],
      types: [
        { id: 'accessible', label: 'Accessible', labelAr: 'مخصص لذوي الإعاقة', marker: '♿' },
        { id: 'ev', label: 'EV', labelAr: 'مركبة كهربائية', marker: 'EV' },
      ],
    },
    isDemo: true as const,
    lastUpdated,
  };
}
