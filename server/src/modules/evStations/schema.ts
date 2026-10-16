import { z } from 'zod';
const text = (max: number) => z.string().trim().min(1).max(max);
export const connectorType = z.enum(['type_2', 'ccs_2', 'chademo', 'gb_t', 'type_1', 'other']);
export const stationStatus = z.enum(['operational', 'temporarily_unavailable', 'planned', 'unknown']);
export const sourceUrl = z.string().trim().max(2048).url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
}, 'Use an HTTP(S) source URL without credentials');
export const stationInput = z.object({
  id: text(100), name: text(160), operatorName: text(160).optional(),
  latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180),
  address: text(300).optional(), city: text(100).optional(),
  connectors: z.array(z.object({ type: connectorType, powerKw: z.number().finite().positive().max(1000), quantity: z.number().int().positive().max(10000) }).strict()).max(40),
  status: stationStatus, accessType: z.enum(['public', 'customers_only', 'private', 'unknown']),
  pricingText: text(500).optional(), openingHoursText: text(300).optional(),
  phone: text(32).regex(/^\+?[0-9][0-9 ()-]{4,30}[0-9]$/).refine((value) => {
    const digits = value.replace(/\D/g, '').length;
    return digits >= 7 && digits <= 15;
  }, 'Use 7–15 phone digits').optional(),
  sourceName: text(200), sourceUrl: sourceUrl.optional(),
  lastVerifiedAt: z.iso.datetime({ offset: true }).refine((v) => Date.parse(v) <= Date.now(), 'Verification date cannot be in the future'),
}).strict().refine((v) => v.status !== 'operational' || v.connectors.length > 0, 'Operational stations require connectors');
// Required finite bounds, capped spans: never perform a worldwide query.
const coordinate = (max: number) => z.coerce.number().finite().min(-max).max(max);
export const listInput = z.object({
  north: coordinate(90), south: coordinate(90), east: coordinate(180), west: coordinate(180),
  connectorType: connectorType.optional(), minPowerKw: z.coerce.number().finite().positive().max(1000).optional(), status: stationStatus.optional(),
}).strict().refine((b) => b.north > b.south && b.east > b.west && b.north - b.south <= 2 && b.east - b.west <= 2, 'Use ordered bounds spanning at most 2 degrees per axis');
