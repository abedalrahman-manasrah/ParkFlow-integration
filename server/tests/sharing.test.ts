import { beforeEach, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db, atomic } from '../src/database/client';
import { redis } from '../src/database/redis';
import * as rides from '../src/modules/rides/service';
import * as spots from '../src/modules/hostSpots/service';
import { post } from '../src/modules/wallet/ledger';

const key = () => randomUUID();
const balance = async (userId: string) => (await db.wallet.findUniqueOrThrow({ where: { userId } })).balance;
let driver: string, rider: string, other: string, vehicleId: string;

async function person(name: string, gender = 'female', credit = 10000) {
  const user = await db.user.create({ data: { email: `${randomUUID()}@example.com`, emailVerifiedAt: new Date(), fullName: name, gender, wallet: { create: {} } } });
  if (credit) await atomic((tx) => post(tx, user.id, { amount: credit, type: 'adjustment', title: 'Test credit', titleAr: 'رصيد اختبار' }));
  return user.id;
}
const inHours = (hours: number) => new Date(Math.ceil((Date.now() + hours * 3_600_000) / 1_800_000) * 1_800_000).toISOString();
const rideInput = (extra: Partial<Parameters<typeof rides.create>[1]> = {}) => ({
  fromCity: 'Ramallah', toCity: 'Nablus', meetingPoint: 'Al-Manara', departAt: inHours(24),
  seatsTotal: 2, vehicleId, ...extra,
});
const spotInput = (extra: Partial<spots.SpotInput> = {}): spots.SpotInput => ({
  title: 'Driveway', city: 'Ramallah', areaHint: 'Al-Tireh', fullAddress: 'Street 1, house 2',
  latitude: 31.9, longitude: 35.2, vehicleSize: 'car', covered: false, hourlyRate: 500,
  weekdays: [0, 1, 2, 3, 4, 5, 6], availableFrom: '00:00', availableTo: '00:00', instantBook: false, ...extra,
});

beforeEach(async () => {
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE ' + tables.map((t) => '"' + t.tablename.replace(/"/g, '""') + '"').join(',') + ' CASCADE');
  await redis.flushdb();
  driver = await person('Omar Driver', 'male', 0);
  rider = await person('Lina Rider');
  other = await person('Sami Other', 'male');
  const vehicle = await db.vehicle.create({ data: { plateNumber: '7-5521-94', make: 'Hyundai' } });
  await db.userVehicle.create({ data: { userId: driver, vehicleId: vehicle.id } });
  vehicleId = vehicle.id;
});

describe('shared rides', () => {
  it('books free seats without touching wallets, through decline and completion', async () => {
    const ride = await rides.create(driver, { ...rideInput(), pricePerSeat: 2500 } as Parameters<typeof rides.create>[1], key());
    expect(ride).toMatchObject({ seatsLeft: 2, pricePerSeat: 0 });
    const booked = await rides.book(rider, ride.id, { seats: 1 }, key());
    expect(booked.myBooking).toMatchObject({ status: 'pending', amount: 0 });
    expect(booked.vehicle?.plateNumber).toBeUndefined();
    expect(await balance(rider)).toBe(10000);
    const otherBooking = (await rides.book(other, ride.id, { seats: 1 }, key())).myBooking!;
    await expect(rides.book(await person('Third'), ride.id, { seats: 1 }, key())).rejects.toMatchObject({ code: 'NOT_ENOUGH_SEATS' });

    await rides.respond(driver, booked.myBooking!.id, true);
    expect((await rides.get(rider, ride.id)).vehicle?.plateNumber).toBe('7-5521-94');
    await rides.respond(driver, otherBooking.id, false);
    expect(await balance(other)).toBe(10000);

    await expect(rides.complete(driver, ride.id)).rejects.toMatchObject({ code: 'RIDE_NOT_STARTED' });
    await db.ride.update({ where: { id: ride.id }, data: { departAt: new Date(Date.now() - 60_000) } });
    await rides.complete(driver, ride.id);
    expect(await balance(driver)).toBe(0);
    expect(await db.walletTransaction.count({ where: { type: { in: ['ride_payment', 'refund', 'earning'] } } })).toBe(0);
    const rated = await rides.rate(rider, booked.myBooking!.id, 5);
    expect(rated.driver).toMatchObject({ rating: 5, ratingCount: 1, completedRides: 1 });
    await expect(rides.rate(rider, booked.myBooking!.id, 4)).rejects.toMatchObject({ code: 'ALREADY_RATED' });
  });

  it('refunds every passenger when the driver cancels', async () => {
    const ride = await rides.create(driver, rideInput(), key());
    await rides.book(rider, ride.id, { seats: 2 }, key());
    await rides.cancelRide(driver, ride.id);
    expect(await balance(rider)).toBe(10000);
    expect((await rides.get(rider, ride.id)).status).toBe('cancelled');
  });

  it('enforces women-only rides and own vehicles, and needs no wallet balance', async () => {
    await expect(rides.create(driver, rideInput({ womenOnly: true }), key())).rejects.toMatchObject({ code: 'WOMEN_ONLY' });
    await expect(rides.create(rider, rideInput(), key())).rejects.toMatchObject({ code: 'VEHICLE_REQUIRED' });
    const womenVehicle = await db.vehicle.create({ data: { plateNumber: '9-1234-90' } });
    await db.userVehicle.create({ data: { userId: rider, vehicleId: womenVehicle.id } });
    const womenRide = await rides.create(rider, rideInput({ vehicleId: womenVehicle.id, womenOnly: true }), key());
    await expect(rides.book(other, womenRide.id, { seats: 1 }, key())).rejects.toMatchObject({ code: 'WOMEN_ONLY' });
    const ride = await rides.create(driver, rideInput(), key());
    const broke = await person('No Money', 'female', 0);
    expect((await rides.book(broke, ride.id, { seats: 1 }, key())).seatsLeft).toBe(1);
  });
});

describe('private parking spots', () => {
  it('keeps the address private until a booking is confirmed, then pays the host', async () => {
    const spot = await spots.create(driver, spotInput(), key());
    const listed = (await spots.list(rider, { latitude: 31.9, longitude: 35.2 }))[0]!;
    expect(listed).toMatchObject({ id: spot.id, locationIsApproximate: true });
    expect(listed.fullAddress).toBeUndefined();

    const booking = await spots.book(rider, spot.id, { startTime: inHours(2), hours: 3 }, key());
    expect(booking).toMatchObject({ status: 'pending', amount: 1500 });
    expect(booking.spot.fullAddress).toBeUndefined();
    expect(await balance(rider)).toBe(8500);
    await expect(spots.book(other, spot.id, { startTime: inHours(3), hours: 1 }, key())).rejects.toMatchObject({ code: 'SPOT_TAKEN' });

    const confirmed = await spots.respond(driver, booking.id, true);
    expect(confirmed.status).toBe('confirmed');
    expect((await spots.get(rider, spot.id)).fullAddress).toBe('Street 1, house 2');

    await db.spotBooking.update({ where: { id: booking.id }, data: { startTime: new Date(Date.now() - 2 * 3_600_000), endTime: new Date(Date.now() - 60_000) } });
    await spots.list(rider, {});
    expect((await db.spotBooking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('completed');
    expect(await balance(driver)).toBe(1500);
  });

  it('refunds declined and cancelled bookings and respects instant booking', async () => {
    const spot = await spots.create(driver, spotInput(), key());
    const declined = await spots.book(rider, spot.id, { startTime: inHours(2), hours: 1 }, key());
    await spots.respond(driver, declined.id, false);
    expect(await balance(rider)).toBe(10000);

    const instant = await spots.create(other, spotInput({ instantBook: true }), key());
    const booking = await spots.book(rider, instant.id, { startTime: inHours(5), hours: 2 }, key());
    expect(booking.status).toBe('confirmed');
    await spots.cancel(rider, booking.id);
    expect(await balance(rider)).toBe(10000);
  });

  it('only allows bookings inside the weekly hours and caps the daily price', async () => {
    const limited = await spots.create(driver, spotInput({ availableFrom: '08:00', availableTo: '10:00' }), key());
    const midnight = new Date(Date.now() + 2 * 86_400_000);
    midnight.setUTCHours(21, 0, 0, 0); // 23:00 or 00:00 in Palestine depending on daylight saving
    await expect(spots.book(rider, limited.id, { startTime: midnight.toISOString(), hours: 1 }, key())).rejects.toMatchObject({ code: 'OUTSIDE_HOURS' });
    expect(spots.priceFor({ hourlyRate: 500, dailyRate: 3000 }, 26)).toBe(3000 + 1000);
    expect(spots.priceFor({ hourlyRate: 500, dailyRate: 3000 }, 4)).toBe(2000);
    expect(spots.priceFor({ hourlyRate: 500, dailyRate: null }, 30)).toBe(15000);
  });
});
