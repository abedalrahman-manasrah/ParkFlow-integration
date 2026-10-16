import { z } from 'zod';
import { empty, key, money, param, route, text, user } from '../../apiRegistry';
import * as spots from './service';

const clock = z.string().regex(/^([01]\d|2[0-3]):[03]0$/, 'Use HH:00 or HH:30');
const createSpotInput = z.object({
  title: text,
  description: z.string().trim().max(500).optional(),
  city: z.string().trim().min(2).max(60),
  areaHint: text,
  fullAddress: z.string().trim().min(3).max(300),
  latitude: z.number().min(29).max(34),
  longitude: z.number().min(34).max(36),
  vehicleSize: z.enum(['car', 'van']),
  covered: z.boolean(),
  hourlyRate: money.min(100).max(spots.MAX_HOURLY_RATE),
  dailyRate: money.min(100).max(spots.MAX_DAILY_RATE).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  availableFrom: clock,
  availableTo: clock,
  instantBook: z.boolean(),
}).strict();
const nearby = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().min(1).max(100).optional(),
}).strict();
const bookInput = z.object({
  startTime: z.iso.datetime({ offset: true }),
  hours: z.number().int().min(1).max(spots.MAX_BOOKING_HOURS),
}).strict();

route('get', '/spots', nearby, (r, b) => spots.list(user(r), b));
route('get', '/spots/mine', empty, (r) => spots.mine(user(r)));
route('post', '/spots', createSpotInput, (r, b) => spots.create(user(r), b, key(r)));
route('get', '/spots/:id', empty, (r) => spots.get(user(r), param(r)));
route('patch', '/spots/:id', z.object({ active: z.boolean() }).strict(), (r, b) => spots.setActive(user(r), param(r), b.active));
route('post', '/spots/:id/book', bookInput, (r, b) => spots.book(user(r), param(r), b, key(r)));
route('post', '/spot-bookings/:id/accept', empty, (r) => spots.respond(user(r), param(r), true));
route('post', '/spot-bookings/:id/decline', empty, (r) => spots.respond(user(r), param(r), false));
route('post', '/spot-bookings/:id/cancel', empty, (r) => spots.cancel(user(r), param(r)));
route('post', '/spot-bookings/:id/check-in', empty, (r) => spots.checkIn(user(r), param(r)));
route('post', '/spot-bookings/:id/complete', empty, (r) => spots.complete(user(r), param(r)));
route('post', '/spot-bookings/:id/rate', z.object({ rating: z.number().int().min(1).max(5) }).strict(), (r, b) => spots.rate(user(r), param(r), b.rating));
