import type { Prisma, User } from '@prisma/client';
import { db, atomic, lock, type Tx } from '../../database/client';
import { assert, requireValue } from '../../utils/errors';
import { idempotent } from '../../utils/idempotency';
import { post } from '../wallet/ledger';
import { notify } from '../notifications/service';

/** A ride nobody closes is settled automatically this long after departure. */
const AUTO_COMPLETE_AFTER_MS = 12 * 3_600_000;
const HELD = ['pending', 'accepted'] as const;

const include = {
  driver: { select: { id: true, fullName: true, gender: true } },
  bookings: { include: { passenger: { select: { id: true, fullName: true } } } },
} as const;
type RideRow = Prisma.RideGetPayload<{ include: typeof include }>;

const firstName = (user: { fullName: string }) => user.fullName.trim().split(/\s+/)[0] || '—';

async function ratingOf(tx: Tx | typeof db, driverId: string) {
  const result = await tx.rideBooking.aggregate({
    where: { ride: { driverId }, driverRating: { not: null } },
    _avg: { driverRating: true },
    _count: { driverRating: true },
  });
  const trips = await tx.ride.count({ where: { driverId, status: 'completed' } });
  return { rating: result._avg.driverRating ?? undefined, ratingCount: result._count.driverRating, completedRides: trips };
}

async function vehicleOf(tx: Tx | typeof db, vehicleId: string) {
  return tx.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true, plateNumber: true, make: true, model: true, color: true },
  });
}

async function dto(row: RideRow, viewerId: string) {
  const isDriver = row.driverId === viewerId;
  const seatsTaken = row.bookings.filter((b) => (HELD as readonly string[]).includes(b.status)).reduce((sum, b) => sum + b.seats, 0);
  const myBooking = row.bookings.find((b) => b.passengerId === viewerId && b.status !== 'cancelled' && b.status !== 'declined')
    ?? row.bookings.filter((b) => b.passengerId === viewerId).at(-1);
  const vehicle = await vehicleOf(db, row.vehicleId);
  // The plate is only shared once the driver has accepted you.
  const canSeePlate = isDriver || myBooking?.status === 'accepted' || myBooking?.status === 'completed';
  return {
    id: row.id,
    fromCity: row.fromCity,
    toCity: row.toCity,
    meetingPoint: row.meetingPoint,
    departAt: row.departAt.toISOString(),
    seatsTotal: row.seatsTotal,
    seatsLeft: Math.max(0, row.seatsTotal - seatsTaken),
    pricePerSeat: row.pricePerSeat,
    womenOnly: row.womenOnly,
    notes: row.notes ?? undefined,
    status: row.status,
    isDriver,
    driver: { id: row.driver.id, firstName: firstName(row.driver), ...(await ratingOf(db, row.driverId)) },
    vehicle: vehicle ? {
      make: vehicle.make ?? undefined,
      model: vehicle.model ?? undefined,
      color: vehicle.color ?? undefined,
      plateNumber: canSeePlate ? vehicle.plateNumber : undefined,
    } : undefined,
    myBooking: myBooking ? bookingDto(myBooking) : undefined,
    bookings: isDriver ? row.bookings.map((b) => ({ ...bookingDto(b), passengerName: firstName(b.passenger) })) : undefined,
    createdAt: row.createdAt.toISOString(),
  };
}

function bookingDto(b: RideRow['bookings'][number]) {
  return {
    id: b.id,
    rideId: b.rideId,
    seats: b.seats,
    amount: b.amount,
    status: b.status,
    driverRating: b.driverRating ?? undefined,
    passengerRating: b.passengerRating ?? undefined,
    createdAt: b.createdAt.toISOString(),
  };
}

async function refund(tx: Tx, booking: { id: string; passengerId: string; amount: number }, ride: { fromCity: string; toCity: string }) {
  if (!booking.amount) return;
  await post(tx, booking.passengerId, {
    amount: booking.amount, type: 'refund',
    title: 'Ride refund', titleAr: 'استرداد رحلة',
    subtitle: `${ride.fromCity} → ${ride.toCity}`, subtitleAr: `${ride.fromCity} ← ${ride.toCity}`,
    reference: `ride-refund:${booking.id}`,
  });
}

/** Pays the driver for accepted seats and releases anything still waiting. */
async function settle(tx: Tx, rideId: string) {
  await lock(tx, `ride:${rideId}`);
  const ride = requireValue(await tx.ride.findUnique({ where: { id: rideId }, include: { bookings: true } }));
  if (ride.status !== 'open') return;
  const accepted = ride.bookings.filter((b) => b.status === 'accepted');
  for (const b of ride.bookings.filter((item) => item.status === 'pending')) {
    await tx.rideBooking.update({ where: { id: b.id }, data: { status: 'declined' } });
    await refund(tx, b, ride);
  }
  if (accepted.length) {
    await tx.rideBooking.updateMany({ where: { id: { in: accepted.map((b) => b.id) } }, data: { status: 'completed' } });
    const total = accepted.reduce((sum, b) => sum + b.amount, 0);
    if (total) await post(tx, ride.driverId, {
      amount: total, type: 'earning',
      title: 'Ride earnings', titleAr: 'أرباح رحلة',
      subtitle: `${ride.fromCity} → ${ride.toCity}`, subtitleAr: `${ride.fromCity} ← ${ride.toCity}`,
      reference: `ride-earning:${ride.id}`,
    });
    for (const b of accepted) {
      await notify(tx, b.passengerId, 'ride_completed', 'Trip completed', 'اكتملت الرحلة',
        'How was your ride? Rate your driver.', 'كيف كانت رحلتك؟ قيّم السائق.', `/rides/${ride.id}`, `ride-completed:${b.id}`);
    }
  }
  await tx.ride.update({ where: { id: ride.id }, data: { status: 'completed' } });
}

async function settleDue() {
  const due = await db.ride.findMany({
    where: { status: 'open', departAt: { lte: new Date(Date.now() - AUTO_COMPLETE_AFTER_MS) } },
    select: { id: true }, take: 50,
  });
  for (const ride of due) await atomic((tx) => settle(tx, ride.id));
}

async function load(id: string) {
  return requireValue(await db.ride.findUnique({ where: { id }, include }), 'Ride not found');
}

function assertProfile(user: User) {
  assert(user.fullName.trim().length >= 2, 'PROFILE_INCOMPLETE', 'Add your name to your profile first', 409);
}

export async function search(userId: string, input: { from?: string; to?: string; after?: string; before?: string }) {
  await settleDue();
  const now = new Date();
  const after = input.after ? new Date(input.after) : now;
  const rows = await db.ride.findMany({
    where: {
      status: 'open',
      driverId: { not: userId },
      departAt: { gt: after > now ? after : now, ...(input.before ? { lt: new Date(input.before) } : {}) },
      ...(input.from ? { fromCity: { equals: input.from, mode: 'insensitive' } } : {}),
      ...(input.to ? { toCity: { equals: input.to, mode: 'insensitive' } } : {}),
    },
    include, orderBy: { departAt: 'asc' }, take: 100,
  });
  return Promise.all(rows.map((row) => dto(row, userId)));
}

export async function get(userId: string, id: string) {
  await settleDue();
  return dto(await load(id), userId);
}

export async function mine(userId: string) {
  await settleDue();
  const [offered, booked] = await Promise.all([
    db.ride.findMany({ where: { driverId: userId }, include, orderBy: { departAt: 'desc' }, take: 100 }),
    db.ride.findMany({ where: { bookings: { some: { passengerId: userId } } }, include, orderBy: { departAt: 'desc' }, take: 100 }),
  ]);
  return {
    offered: await Promise.all(offered.map((row) => dto(row, userId))),
    booked: await Promise.all(booked.map((row) => dto(row, userId))),
  };
}

export async function create(userId: string, input: {
  fromCity: string; toCity: string; meetingPoint: string; departAt: string; seatsTotal: number;
  vehicleId: string; womenOnly?: boolean; notes?: string;
}, key: string) {
  const id = await idempotent(userId, 'ride:create', key, input, async (tx) => {
    const user = requireValue(await tx.user.findUnique({ where: { id: userId } }));
    assertProfile(user);
    const departAt = new Date(input.departAt);
    assert(departAt.getTime() >= Date.now() + 15 * 60_000, 'RIDE_TOO_SOON', 'Departure must be at least 15 minutes from now');
    assert(departAt.getTime() <= Date.now() + 60 * 86_400_000, 'RIDE_TOO_FAR', 'Departure must be within the next 60 days');
    assert(input.fromCity.trim().toLowerCase() !== input.toCity.trim().toLowerCase(), 'SAME_CITY', 'Choose two different cities');
    assert(!input.womenOnly || user.gender === 'female', 'WOMEN_ONLY', 'Only women can offer women-only rides', 403);
    const linked = await tx.userVehicle.findFirst({ where: { userId, vehicleId: input.vehicleId, unlinkedAt: null } });
    assert(linked, 'VEHICLE_REQUIRED', 'Choose one of your own vehicles', 403);
    const ride = await tx.ride.create({
      data: {
        driverId: userId, vehicleId: input.vehicleId,
        fromCity: input.fromCity.trim(), toCity: input.toCity.trim(), meetingPoint: input.meetingPoint.trim(),
        // Rides are free: seats are shared without a fare.
        departAt, seatsTotal: input.seatsTotal, pricePerSeat: 0,
        womenOnly: input.womenOnly ?? false, notes: input.notes?.trim() || null,
      },
    });
    return ride.id;
  });
  return get(userId, id);
}

export async function book(userId: string, rideId: string, input: { seats: number }, key: string) {
  await idempotent(userId, `ride:book:${rideId}`, key, input, async (tx) => {
    await lock(tx, `ride:${rideId}`);
    const ride = requireValue(await tx.ride.findUnique({ where: { id: rideId }, include: { bookings: true } }), 'Ride not found');
    const user = requireValue(await tx.user.findUnique({ where: { id: userId } }));
    assertProfile(user);
    assert(ride.status === 'open' && ride.departAt > new Date(), 'RIDE_CLOSED', 'This ride is no longer taking bookings', 409);
    assert(ride.driverId !== userId, 'OWN_RIDE', 'You cannot book your own ride', 409);
    assert(!ride.womenOnly || user.gender === 'female', 'WOMEN_ONLY', 'This ride is for women only', 403);
    assert(!ride.bookings.some((b) => b.passengerId === userId && (HELD as readonly string[]).includes(b.status)), 'ALREADY_BOOKED', 'You already have a booking on this ride', 409);
    const taken = ride.bookings.filter((b) => (HELD as readonly string[]).includes(b.status)).reduce((sum, b) => sum + b.seats, 0);
    assert(taken + input.seats <= ride.seatsTotal, 'NOT_ENOUGH_SEATS', 'Not enough seats left on this ride', 409);
    const amount = ride.pricePerSeat * input.seats;
    const booking = await tx.rideBooking.create({ data: { rideId, passengerId: userId, seats: input.seats, amount } });
    // Any fare is held from the wallet now and released to the driver after the trip.
    if (amount) await post(tx, userId, {
      amount: -amount, type: 'ride_payment',
      title: 'Ride booking', titleAr: 'حجز رحلة',
      subtitle: `${ride.fromCity} → ${ride.toCity}`, subtitleAr: `${ride.fromCity} ← ${ride.toCity}`,
      reference: `ride-payment:${booking.id}`,
    });
    await notify(tx, ride.driverId, 'ride_request', 'New seat request', 'طلب مقعد جديد',
      `${firstName(user)} asked for ${input.seats} seat(s) to ${ride.toCity}.`, `طلب ${firstName(user)} ${input.seats} مقعد إلى ${ride.toCity}.`,
      `/rides/${ride.id}`, `ride-request:${booking.id}`);
    return booking.id;
  });
  return get(userId, rideId);
}

export async function respond(userId: string, bookingId: string, accept: boolean) {
  const rideId = await atomic(async (tx) => {
    const found = requireValue(await tx.rideBooking.findUnique({ where: { id: bookingId }, include: { ride: true } }), 'Booking not found');
    await lock(tx, `ride:${found.rideId}`);
    const booking = requireValue(await tx.rideBooking.findUnique({ where: { id: bookingId }, include: { ride: { include: { bookings: true } } } }));
    assert(booking.ride.driverId === userId, 'NOT_FOUND', 'Booking not found', 404);
    assert(booking.status === 'pending', 'BOOKING_NOT_PENDING', 'This request was already answered', 409);
    assert(booking.ride.status === 'open', 'RIDE_CLOSED', 'This ride is closed', 409);
    if (accept) {
      await tx.rideBooking.update({ where: { id: bookingId }, data: { status: 'accepted' } });
      await notify(tx, booking.passengerId, 'ride_accepted', 'Seat confirmed', 'تم تأكيد المقعد',
        `Your seat to ${booking.ride.toCity} is confirmed.`, `تم تأكيد مقعدك إلى ${booking.ride.toCity}.`, `/rides/${booking.rideId}`, `ride-accepted:${bookingId}`);
    } else {
      await tx.rideBooking.update({ where: { id: bookingId }, data: { status: 'declined' } });
      await refund(tx, booking, booking.ride);
      await notify(tx, booking.passengerId, 'ride_declined', 'Seat request declined', 'تم رفض طلب المقعد',
        'The driver could not take you this time.', 'لم يتمكن السائق من أخذك هذه المرة.', `/rides/${booking.rideId}`, `ride-declined:${bookingId}`);
    }
    return booking.rideId;
  });
  return get(userId, rideId);
}

export async function cancelBooking(userId: string, bookingId: string) {
  const rideId = await atomic(async (tx) => {
    const booking = requireValue(await tx.rideBooking.findFirst({ where: { id: bookingId, passengerId: userId }, include: { ride: true } }), 'Booking not found');
    await lock(tx, `ride:${booking.rideId}`);
    assert((HELD as readonly string[]).includes(booking.status), 'BOOKING_NOT_CANCELLABLE', 'This booking can no longer be cancelled', 409);
    assert(booking.ride.departAt > new Date(), 'BOOKING_NOT_CANCELLABLE', 'The ride has already left', 409);
    await tx.rideBooking.update({ where: { id: bookingId }, data: { status: 'cancelled' } });
    await refund(tx, booking, booking.ride);
    await notify(tx, booking.ride.driverId, 'ride_booking_cancelled', 'Seat cancelled', 'أُلغي مقعد',
      'A passenger cancelled their seat.', 'ألغى راكب مقعده.', `/rides/${booking.rideId}`, `ride-booking-cancelled:${bookingId}`);
    return booking.rideId;
  });
  return get(userId, rideId);
}

export async function cancelRide(userId: string, rideId: string) {
  await atomic(async (tx) => {
    await lock(tx, `ride:${rideId}`);
    const ride = requireValue(await tx.ride.findFirst({ where: { id: rideId, driverId: userId }, include: { bookings: true } }), 'Ride not found');
    assert(ride.status === 'open', 'RIDE_CLOSED', 'This ride is already closed', 409);
    for (const b of ride.bookings.filter((item) => (HELD as readonly string[]).includes(item.status))) {
      await tx.rideBooking.update({ where: { id: b.id }, data: { status: 'cancelled' } });
      await refund(tx, b, ride);
      await notify(tx, b.passengerId, 'ride_cancelled', 'Ride cancelled', 'أُلغيت الرحلة',
        `The driver cancelled the ride to ${ride.toCity}.`, `ألغى السائق الرحلة إلى ${ride.toCity}.`,
        `/rides/${ride.id}`, `ride-cancelled:${b.id}`);
    }
    await tx.ride.update({ where: { id: ride.id }, data: { status: 'cancelled' } });
  });
  return get(userId, rideId);
}

export async function complete(userId: string, rideId: string) {
  await atomic(async (tx) => {
    const ride = requireValue(await tx.ride.findFirst({ where: { id: rideId, driverId: userId } }), 'Ride not found');
    assert(ride.status === 'open', 'RIDE_CLOSED', 'This ride is already closed', 409);
    assert(ride.departAt <= new Date(), 'RIDE_NOT_STARTED', 'You can finish the ride after departure time', 409);
    await settle(tx, rideId);
  });
  return get(userId, rideId);
}

export async function rate(userId: string, bookingId: string, rating: number) {
  const booking = requireValue(await db.rideBooking.findUnique({ where: { id: bookingId }, include: { ride: true } }), 'Booking not found');
  assert(booking.status === 'completed', 'NOT_COMPLETED', 'You can rate after the trip', 409);
  if (booking.passengerId === userId) {
    assert(booking.driverRating == null, 'ALREADY_RATED', 'You already rated this trip', 409);
    await db.rideBooking.update({ where: { id: bookingId }, data: { driverRating: rating } });
  } else {
    assert(booking.ride.driverId === userId, 'NOT_FOUND', 'Booking not found', 404);
    assert(booking.passengerRating == null, 'ALREADY_RATED', 'You already rated this passenger', 409);
    await db.rideBooking.update({ where: { id: bookingId }, data: { passengerRating: rating } });
  }
  return get(userId, booking.rideId);
}
