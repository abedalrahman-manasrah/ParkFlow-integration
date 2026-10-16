import { z } from 'zod';
import type { Request } from 'express';
import { id, route, text, user } from '../../apiRegistry';
import * as gates from './service';

const staff = (r: Request): gates.Staff => ({ userId: r.auth!.userId, role: r.auth!.role });
const gateStaff = ['ADMIN', 'PARKING_OPERATOR'] as const;
const patrolStaff = ['ADMIN', 'PARKING_OPERATOR', 'ENFORCEMENT_OFFICER'] as const;
const plate = z.string().trim().min(4).max(20);
const scan = z.object({ zoneId: id, plate: plate.optional(), pass: z.string().trim().min(20).max(2000).optional() })
  .strict().refine((b) => Boolean(b.plate) !== Boolean(b.pass), 'Send either a plate or a gate pass');

// Driver: the rotating QR shown at a QR gate.
route('get', '/gate-pass', z.object({ vehicleId: id }).strict(), (r, b) => gates.gatePass(user(r), b.vehicleId));

// Gate mode (operators): scan a driver's pass or type a plate.
route('get', '/gate/zones', z.object({}).strict(), (r) => gates.zones(staff(r)), [...patrolStaff]);
route('get', '/gate/zones/:id/visits', z.object({}).strict(), (r) => gates.visits(staff(r), String(r.params.id)), [...gateStaff]);
route('post', '/gate/entry', scan, (r, b) => gates.staffEnter(staff(r), b), [...gateStaff]);
route('post', '/gate/exit', scan, (r, b) => gates.staffExit(staff(r), b), [...gateStaff]);
route('patch', '/gate/zones/:id/rules', z.object({
  overstayGraceMinutes: z.number().int().min(0).max(240),
  overstayFee: z.number().int().min(0).max(100000),
  overstayRepeatMinutes: z.number().int().min(15).max(1440),
  overstayMaxPerStay: z.number().int().min(0).max(1000000),
}).strict(), (r, b) => gates.rules(staff(r), String(r.params.id), b), [...gateStaff]);
route('post', '/gate/zones/:id/devices', z.object({ name: text, kind: z.enum(['camera', 'qr_scanner']) }).strict(),
  (r, b) => gates.createDevice(staff(r), String(r.params.id), b), [...gateStaff]);

// Plate cameras: no user session, the device key in X-Gate-Key identifies the lot.
route('post', '/gate/camera-events', z.object({ plate, direction: z.enum(['entry', 'exit']), at: z.iso.datetime({ offset: true }).optional() }).strict(),
  (r, b) => gates.cameraEvent(r.get('X-Gate-Key') ?? '', b), false);

// Officer patrol.
route('get', '/enforcement/check', z.object({ zoneId: id, plate }).strict(), (r, b) => gates.patrolCheck(staff(r), b.zoneId, b.plate), [...patrolStaff]);
route('post', '/enforcement/violations', z.object({ zoneId: id, plate }).strict(), (r, b) => gates.patrolIssue(staff(r), b.zoneId, b.plate), [...patrolStaff]);
