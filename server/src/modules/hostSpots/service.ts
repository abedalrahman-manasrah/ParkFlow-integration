import type { Prisma } from '@prisma/client';
import { db, atomic, lock, type Tx } from '../../database/client';
import { assert, requireValue } from '../../utils/errors';
import { idempotent } from '../../utils/idempotency';
import { post } from '../wallet/ledger';
import { notify } from '../notifications/service';

/** Ceilings keep a typo from listing a driveway at ₪5,000 an hour (minor units). */
export const MAX_HOURLY_RATE = 5000;
export const MAX_DAILY_RATE = 30000;
export const MAX_BOOKING_HOURS = 7 * 24;
const SLOT_MS = 30 * 60_000;
const TIME_ZONE = 'Asia/Hebron';
const HELD = ['pending', 'confirmed', 'active'] as const;

const include = { host: { select: { id: true, fullName: true } } } as const;
type SpotRow = Prisma.HostSpotGetPayload<{ include: typeof include }>;
type BookingRow = Prisma.SpotBookingGetPayload<{ include: { spot: { include: typeof include } } }>;

const firstName = (user: { fullName: string }) => user.fullName.trim().split(/\s+/)[0] || '—';
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};
/** "00:00" as a closing time means midnight at the end of the day. */
const closingMinutes = (hhmm: string) => (hhmm === '00:00' ? 1440 : minutesOf(hhmm));

const localFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function localParts(date: Date) {
  const parts = Object.fromEntries(localFormat.formatToParts(date).map((p) => [p.type, p.value]));
  return { weekday: WEEKDAYS.indexOf(parts.weekday!), minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** True when every half hour of [start, end) falls inside the host's weekly window. */
export function withinAvailability(spot: { weekdays: number[]; availableFrom: string; availableTo: string }, start: Date, end: Date) {
  const open = minutesOf(spot.availableFrom), close = closingMinutes(spot.availableTo);
  for (let t = start.getTime(); t < end.getTime(); t += SLOT_MS) {
    const { weekday, minutes } = localParts(new Date(t));
    if (!spot.weekdays.includes(weekday) || minutes < open || minutes + 30 > close) return false;
  }
  return true;
}

/** Hourly price, but a full day never costs more than the daily rate. */
export function priceFor(spot: { hourlyRate: number; dailyRate: number | null }, hours: number) {
  const hourly = spot.hourlyRate * hours;
  if (!spot.dailyRate) return hourly;
  const days = Math.floor(hours / 24);
  return Math.min(hourly, days * spot.dailyRate + Math.min((hours % 24) * spot.hourlyRate, spot.dailyRate));
}

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180, dLat = (b.latitude - a.latitude) * rad, dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

async function ratingOf(spotId: string) {
  const result = await db.spotBooking.aggregate({
    where: { spotId, hostRating: { not: null } }, _avg: { hostRating: true }, _count: { hostRating: true },
  });
  return { rating: result._avg.hostRating ?? undefined, ratingCount: result._count.hostRating };
}

/**
 * Everyone sees the neighbourhood and a location rounded to ~150 m. The exact
 * pin and street address are only for the host and drivers with a live booking.
 */
async function spotDto(row: SpotRow, viewerId: string, exact = false, from?: { latitude: number; longitude: number }) {
  const isHost = row.hostId === viewerId;
  const showExact = isHost || exact;
  const location = showExact
    ? { latitude: row.latitude, longitude: row.longitude }
    : { latitude: Math.round(row.latitude * 700) / 700, longitude: Math.round(row.longitude * 700) / 700 };
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    city: row.city,
    areaHint: row.areaHint,
    fullAddress: showExact ? row.fullAddress : undefined,
    location,
    locationIsApproximate: !showExact,
    distanceKm: from ? Math.round(distanceKm(from, row) * 10) / 10 : undefined,
    vehicleSize: row.vehicleSize,
    covered: row.covered,
    hourlyRate: row.hourlyRate,
    dailyRate: row.dailyRate ?? undefined,
    weekdays: row.weekdays,
    availableFrom: row.availableFrom,
    availableTo: row.availableTo,
    instantBook: row.instantBook,
    active: row.active,
    isHost,
    host: { id: row.host.id, firstName: firstName(row.host) },
    ...(await ratingOf(row.id)),
  };
}

function bookingDto(row: BookingRow, viewerId: string, spot: Awaited<ReturnType<typeof spotDto>>) {
  return {
    id: row.id,
    spotId: row.spotId,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    amount: row.amount,
    status: row.status,
    isHost: row.spot.hostId === viewerId,
    hostRating: row.hostRating ?? undefined,
    driverRating: row.driverRating ?? undefined,
    spot,
    createdAt: row.createdAt.toISOString(),
  };
}

async function bookingView(row: BookingRow, viewerId: string) {
  const exact = row.driverId === viewerId && ['confirmed', 'active', 'completed'].includes(row.status);
  return bookingDto(row, viewerId, await spotDto(row.spot, viewerId, exact));
}

async function refund(tx: Tx, booking: { id: string; driverId: string; amount: number }, title: string) {
  await post(tx, booking.driverId, {
    amount: booking.amount, type: 'refund', title: 'Parking spot refund', titleAr: 'استرداد موقف خاص',
    subtitle: title, subtitleAr: title, reference: `spot-refund:${booking.id}`,
  });
}

async function payHost(tx: Tx, booking: { id: string; amount: number; spot: { hostId: string; title: string } }) {
  await post(tx, booking.spot.hostId, {
    amount: booking.amount, type: 'earning', title: 'Parking spot earnings', titleAr: 'أرباح الموقف الخاص',
    subtitle: booking.spot.title, subtitleAr: booking.spot.title, reference: `spot-earning:${booking.id}`,
  });
}

/** Ends bookings whose time has passed: pay out finished ones, refund unanswered ones. */
async function settleDue() {
  const now = new Date();
  const due = await db.spotBooking.findMany({
    where: { OR: [{ status: { in: ['confirmed', 'active'] }, endTime: { lte: now } }, { status: 'pending', startTime: { lte: now } }] },
    select: { id: true }, take: 100,
  });
  for (const { id } of due) {
    await atomic(async (tx) => {
      await lock(tx, `spot-booking:${id}`);
      const b = requireValue(await tx.spotBooking.findUnique({ where: { id }, include: { spot: true } }));
      if (b.status === 'pending' && b.startTime <= now) {
        await tx.spotBooking.update({ where: { id }, data: { status: 'declined' } });
        await refund(tx, b, b.spot.title);
        await notify(tx, b.driverId, 'spot_expired', 'Booking not answered', 'لم يتم الرد على الحجز',
          'The host did not answer in time. Your money is back in your wallet.', 'لم يرد المضيف في الوقت المحدد. أُعيد المبلغ إلى محفظتك.', `/spots/${b.spotId}`, `spot-expired:${id}`);
      } else if ((b.status === 'confirmed' || b.status === 'active') && b.endTime <= now) {
        await tx.spotBooking.update({ where: { id }, data: { status: 'completed' } });
        await payHost(tx, b);
      }
    });
  }
}

export async function list(userId: string, input: { latitude?: number; longitude?: number; radiusKm?: number }) {
  await settleDue();
  const from = input.latitude != null && input.longitude != null ? { latitude: input.latitude, longitude: input.longitude } : undefined;
  const rows = await db.hostSpot.findMany({ where: { active: true, hostId: { not: userId } }, include, take: 500 });
  const views = await Promise.all(rows.map((row) => spotDto(row, userId, false, from)));
  return views
    .filter((spot) => !from || spot.distanceKm! <= (input.radiusKm ?? 25))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

export async function get(userId: string, id: string) {
  await settleDue();
  const row = requireValue(await db.hostSpot.findUnique({ where: { id }, include }), 'Parking spot not found');
  const live = await db.spotBooking.findFirst({ where: { spotId: id, driverId: userId, status: { in: ['confirmed', 'active'] } } });
  const spot = await spotDto(row, userId, Boolean(live));
  assert(row.active || spot.isHost, 'NOT_FOUND', 'Parking spot not found', 404);
  const bookingRows = await db.spotBooking.findMany({
    where: { spotId: id, ...(spot.isHost ? {} : { driverId: userId }) },
    include: { spot: { include } }, orderBy: { startTime: 'desc' }, take: 100,
  });
  const bookings = await Promise.all(bookingRows.map((b) => bookingView(b, userId)));
  // Busy windows let the booking screen grey out taken times without exposing who booked them.
  const busy = await db.spotBooking.findMany({
    where: { spotId: id, status: { in: [...HELD] }, endTime: { gt: new Date() } },
    select: { startTime: true, endTime: true }, orderBy: { startTime: 'asc' },
  });
  return {
    ...spot,
    bookings,
    busy: busy.map((b) => ({ startTime: b.startTime.toISOString(), endTime: b.endTime.toISOString() })),
  };
}

export async function mine(userId: string) {
  await settleDue();
  const [spots, bookings, requests] = await Promise.all([
    db.hostSpot.findMany({ where: { hostId: userId }, include, orderBy: { createdAt: 'desc' } }),
    db.spotBooking.findMany({ where: { driverId: userId }, include: { spot: { include } }, orderBy: { startTime: 'desc' }, take: 100 }),
    db.spotBooking.findMany({ where: { spot: { hostId: userId } }, include: { spot: { include } }, orderBy: { startTime: 'desc' }, take: 100 }),
  ]);
  return {
    spots: await Promise.all(spots.map((row) => spotDto(row, userId))),
    bookings: await Promise.all(bookings.map((b) => bookingView(b, userId))),
    requests: await Promise.all(requests.map((b) => bookingView(b, userId))),
  };
}

export interface SpotInput {
  title: string; description?: string; city: string; areaHint: string; fullAddress: string;
  latitude: number; longitude: number; vehicleSize: 'car' | 'van'; covered: boolean;
  hourlyRate: number; dailyRate?: number; weekdays: number[]; availableFrom: string; availableTo: string; instantBook: boolean;
}

function assertSpot(input: SpotInput) {
  assert(input.weekdays.length > 0, 'NO_DAYS', 'Choose at least one day');
  assert(closingMinutes(input.availableTo) > minutesOf(input.availableFrom), 'INVALID_HOURS', 'Closing time must be after opening time');
}

export async function create(userId: string, input: SpotInput, key: string) {
  assertSpot(input);
  const id = await idempotent(userId, 'spot:create', key, input, async (tx) => {
    const user = requireValue(await tx.user.findUnique({ where: { id: userId } }));
    assert(user.fullName.trim().length >= 2, 'PROFILE_INCOMPLETE', 'Add your name to your profile first', 409);
    const spot = await tx.hostSpot.create({
      data: { ...input, hostId: userId, weekdays: [...new Set(input.weekdays)].sort(), dailyRate: input.dailyRate ?? null, description: input.description?.trim() || null },
    });
    return spot.id;
  });
  return get(userId, id);
}

export async function setActive(userId: string, id: string, active: boolean) {
  requireValue(await db.hostSpot.findFirst({ where: { id, hostId: userId } }), 'Parking spot not found');
  await db.hostSpot.update({ where: { id }, data: { active } });
  return get(userId, id);
}

export async function book(userId: string, spotId: string, input: { startTime: string; hours: number }, key: string) {
  const bookingId = await idempotent(userId, `spot:book:${spotId}`, key, input, async (tx) => {
    await lock(tx, `host-spot:${spotId}`);
    const spot = requireValue(await tx.hostSpot.findUnique({ where: { id: spotId } }), 'Parking spot not found');
    assert(spot.active, 'SPOT_UNAVAILABLE', 'This parking spot is not taking bookings', 409);
    assert(spot.hostId !== userId, 'OWN_SPOT', 'You cannot book your own spot', 409);
    const start = new Date(input.startTime), end = new Date(start.getTime() + input.hours * 3_600_000);
    assert(start.getTime() % SLOT_MS === 0, 'INVALID_TIME', 'Start on the hour or half hour');
    assert(start.getTime() >= Date.now() - 5 * 60_000, 'BOOKING_IN_PAST', 'Start time cannot be in the past');
    assert(start.getTime() <= Date.now() + 30 * 86_400_000, 'BOOKING_TOO_FAR', 'Book within the next 30 days');
    assert(withinAvailability(spot, start, end), 'OUTSIDE_HOURS', 'The host does not offer the spot for all of that time', 409);
    const overlap = await tx.spotBooking.findFirst({
      where: { spotId, status: { in: [...HELD] }, startTime: { lt: end }, endTime: { gt: start } }, select: { id: true },
    });
    assert(!overlap, 'SPOT_TAKEN', 'Someone already booked part of that time', 409);
    const amount = priceFor(spot, input.hours);
    const booking = await tx.spotBooking.create({
      data: { spotId, driverId: userId, startTime: start, endTime: end, amount, status: spot.instantBook ? 'confirmed' : 'pending' },
    });
    // Held from the wallet now; the host is paid when the booking ends.
    await post(tx, userId, {
      amount: -amount, type: 'spot_payment', title: 'Private parking booking', titleAr: 'حجز موقف خاص',
      subtitle: spot.title, subtitleAr: spot.title, reference: `spot-payment:${booking.id}`,
    });
    await notify(tx, spot.hostId, 'spot_request', spot.instantBook ? 'New booking' : 'New booking request', spot.instantBook ? 'حجز جديد' : 'طلب حجز جديد',
      spot.instantBook ? `Someone booked "${spot.title}".` : `Someone wants to book "${spot.title}". Accept or decline.`,
      spot.instantBook ? `قام شخص بحجز "${spot.title}".` : `يريد شخص حجز "${spot.title}". اقبل أو ارفض.`,
      `/spots/${spot.id}`, `spot-request:${booking.id}`);
    return booking.id;
  });
  return bookingFor(userId, bookingId);
}

async function bookingFor(userId: string, id: string) {
  const row = requireValue(await db.spotBooking.findUnique({ where: { id }, include: { spot: { include } } }), 'Booking not found');
  assert(row.driverId === userId || row.spot.hostId === userId, 'NOT_FOUND', 'Booking not found', 404);
  return bookingView(row, userId);
}

async function locked(tx: Tx, id: string) {
  await lock(tx, `spot-booking:${id}`);
  return requireValue(await tx.spotBooking.findUnique({ where: { id }, include: { spot: true } }), 'Booking not found');
}

export async function respond(userId: string, id: string, accept: boolean) {
  await atomic(async (tx) => {
    const b = await locked(tx, id);
    assert(b.spot.hostId === userId, 'NOT_FOUND', 'Booking not found', 404);
    assert(b.status === 'pending', 'BOOKING_NOT_PENDING', 'This request was already answered', 409);
    await tx.spotBooking.update({ where: { id }, data: { status: accept ? 'confirmed' : 'declined' } });
    if (!accept) await refund(tx, b, b.spot.title);
    await notify(tx, b.driverId, accept ? 'spot_confirmed' : 'spot_declined',
      accept ? 'Parking confirmed' : 'Booking declined', accept ? 'تم تأكيد الموقف' : 'تم رفض الحجز',
      accept ? `"${b.spot.title}" is yours. The exact address is now in the app.` : 'The host could not take this booking. Your money is back in your wallet.',
      accept ? `"${b.spot.title}" محجوز لك. العنوان الكامل متاح الآن في التطبيق.` : 'لم يتمكن المضيف من قبول الحجز. أُعيد المبلغ إلى محفظتك.',
      `/spots/${b.spotId}`, `spot-${accept ? 'confirmed' : 'declined'}:${id}`);
  });
  return bookingFor(userId, id);
}

export async function cancel(userId: string, id: string) {
  await atomic(async (tx) => {
    const b = await locked(tx, id);
    const isHost = b.spot.hostId === userId;
    assert(isHost || b.driverId === userId, 'NOT_FOUND', 'Booking not found', 404);
    assert(b.status === 'pending' || b.status === 'confirmed', 'BOOKING_NOT_CANCELLABLE', 'This booking can no longer be cancelled', 409);
    assert(b.startTime > new Date(), 'BOOKING_NOT_CANCELLABLE', 'The booking has already started', 409);
    await tx.spotBooking.update({ where: { id }, data: { status: 'cancelled' } });
    await refund(tx, b, b.spot.title);
    await notify(tx, isHost ? b.driverId : b.spot.hostId, 'spot_cancelled', 'Booking cancelled', 'أُلغي الحجز',
      isHost ? 'The host cancelled your booking. Your money is back in your wallet.' : `A driver cancelled their booking at "${b.spot.title}".`,
      isHost ? 'ألغى المضيف حجزك. أُعيد المبلغ إلى محفظتك.' : `ألغى سائق حجزه في "${b.spot.title}".`,
      `/spots/${b.spotId}`, `spot-cancelled:${id}`);
  });
  return bookingFor(userId, id);
}

export async function checkIn(userId: string, id: string) {
  await atomic(async (tx) => {
    const b = await locked(tx, id);
    assert(b.driverId === userId, 'NOT_FOUND', 'Booking not found', 404);
    assert(b.status === 'confirmed', 'BOOKING_NOT_CONFIRMED', 'Only a confirmed booking can be checked in', 409);
    const now = Date.now();
    assert(now >= b.startTime.getTime() - 15 * 60_000 && now < b.endTime.getTime(), 'NOT_YET', 'You can check in from 15 minutes before your booking', 409);
    await tx.spotBooking.update({ where: { id }, data: { status: 'active' } });
    await notify(tx, b.spot.hostId, 'spot_checked_in', 'Driver arrived', 'وصل السائق',
      `A driver has parked at "${b.spot.title}".`, `ركن سائق في "${b.spot.title}".`, `/spots/${b.spotId}`, `spot-checked-in:${id}`);
  });
  return bookingFor(userId, id);
}

/** The driver leaving early (or the host confirming they left) ends the booking and pays the host. */
export async function complete(userId: string, id: string) {
  await atomic(async (tx) => {
    const b = await locked(tx, id);
    assert(b.driverId === userId || b.spot.hostId === userId, 'NOT_FOUND', 'Booking not found', 404);
    assert(b.status === 'active' || (b.status === 'confirmed' && b.startTime <= new Date()), 'BOOKING_NOT_ACTIVE', 'This booking has not started', 409);
    await tx.spotBooking.update({ where: { id }, data: { status: 'completed' } });
    await payHost(tx, b);
  });
  return bookingFor(userId, id);
}

export async function rate(userId: string, id: string, rating: number) {
  const b = requireValue(await db.spotBooking.findUnique({ where: { id }, include: { spot: true } }), 'Booking not found');
  assert(b.status === 'completed', 'NOT_COMPLETED', 'You can rate after the booking ends', 409);
  if (b.driverId === userId) {
    assert(b.hostRating == null, 'ALREADY_RATED', 'You already rated this spot', 409);
    await db.spotBooking.update({ where: { id }, data: { hostRating: rating } });
  } else {
    assert(b.spot.hostId === userId, 'NOT_FOUND', 'Booking not found', 404);
    assert(b.driverRating == null, 'ALREADY_RATED', 'You already rated this driver', 409);
    await db.spotBooking.update({ where: { id }, data: { driverRating: rating } });
  }
  return bookingFor(userId, id);
}
