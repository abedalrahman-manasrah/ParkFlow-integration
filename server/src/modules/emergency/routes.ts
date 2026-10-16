import { z } from 'zod';
import { empty, route, user } from '../../apiRegistry';
import * as emergency from './service';

route('get', '/emergency/config', empty, async () => emergency.config());

route('post', '/emergency/crash-events', z.object({
  detectedAt: z.iso.datetime(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  speedKmh: z.number().min(0).max(400).optional(),
  peakG: z.number().min(0).max(100),
  rotationDeg: z.number().min(0).max(180).optional(),
  outcome: z.enum(['cancelled', 'called', 'call_failed', 'no_number']),
}).strict(), (r, body) => emergency.recordCrash(user(r), body));

route('get', '/emergency/crash-events', empty, (r) => emergency.recentCrashes(user(r)));
