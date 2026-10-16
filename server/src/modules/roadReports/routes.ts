import { z } from 'zod';
import { empty, geo, param, route, user } from '../../apiRegistry';
import * as reports from './service';

const reportType = z.enum(['accident', 'traffic_congestion', 'closed_road', 'checkpoint', 'road_hazard', 'construction', 'police', 'other']);
const direction = z.enum(['northbound', 'southbound', 'eastbound', 'westbound', 'both']);
const severity = z.enum(['low', 'moderate', 'high', 'critical']);
route('post', '/road-reports', z.object({
  type: reportType,
  ...geo.shape,
  direction: direction.optional(),
  severity: severity.optional(),
  description: z.string().trim().max(280).optional(),
}).strict(), (r, body) => reports.create(user(r), body));

route('get', '/road-reports', z.object({
  north: z.coerce.number().finite().min(-90).max(90),
  south: z.coerce.number().finite().min(-90).max(90),
  east: z.coerce.number().finite().min(-180).max(180),
  west: z.coerce.number().finite().min(-180).max(180),
}).strict(), (r, bounds) => reports.active(user(r), bounds));

route('get', '/road-reports/:id', empty, (r) => reports.get(user(r), param(r)));
route('post', '/road-reports/:id/confirm', empty, (r) => reports.vote(user(r), param(r), 'still_there'));
route('post', '/road-reports/:id/not-there', empty, (r) => reports.vote(user(r), param(r), 'not_there'));
