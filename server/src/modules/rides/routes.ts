import { z } from 'zod';
import { empty, id, key, money, param, route, text, user } from '../../apiRegistry';
import * as rides from './service';

const city = z.string().trim().min(2).max(60);
const createRideInput = z.object({
  fromCity: city,
  toCity: city,
  meetingPoint: text,
  departAt: z.iso.datetime({ offset: true }),
  seatsTotal: z.number().int().min(1).max(8),
  // Ignored: rides are free. Still accepted so older app builds that send it keep working.
  pricePerSeat: money.optional(),
  vehicleId: id,
  womenOnly: z.boolean().optional(),
  notes: z.string().trim().max(300).optional(),
}).strict();
const searchInput = z.object({
  from: city.optional(),
  to: city.optional(),
  after: z.iso.datetime({ offset: true }).optional(),
  before: z.iso.datetime({ offset: true }).optional(),
}).strict();
const rating = z.object({ rating: z.number().int().min(1).max(5) }).strict();

route('get', '/rides', searchInput, (r, b) => rides.search(user(r), b));
route('get', '/rides/mine', empty, (r) => rides.mine(user(r)));
route('post', '/rides', createRideInput, (r, b) => rides.create(user(r), b, key(r)));
route('get', '/rides/:id', empty, (r) => rides.get(user(r), param(r)));
route('post', '/rides/:id/book', z.object({ seats: z.number().int().min(1).max(8) }).strict(), (r, b) => rides.book(user(r), param(r), b, key(r)));
route('post', '/rides/:id/cancel', empty, (r) => rides.cancelRide(user(r), param(r)));
route('post', '/rides/:id/complete', empty, (r) => rides.complete(user(r), param(r)));
route('post', '/ride-bookings/:id/accept', empty, (r) => rides.respond(user(r), param(r), true));
route('post', '/ride-bookings/:id/decline', empty, (r) => rides.respond(user(r), param(r), false));
route('post', '/ride-bookings/:id/cancel', empty, (r) => rides.cancelBooking(user(r), param(r)));
route('post', '/ride-bookings/:id/rate', rating, (r, b) => rides.rate(user(r), param(r), b.rating));
