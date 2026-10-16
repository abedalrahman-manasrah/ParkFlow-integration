import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, atomic } from '../src/database/client';
import * as admin from '../src/modules/admin/service';
import * as spots from '../src/modules/hostSpots/service';
import * as rides from '../src/modules/rides/service';
import * as ledger from '../src/modules/wallet/ledger';

// These integration regressions use only the dedicated test database and real
// ledger transactions. No payment, email, SMS, or push provider is contacted.
function requireTestDatabase() {
  const url = process.env.DATABASE_URL;
  if (!url || !new URL(url).pathname.endsWith('_test')) {
    throw new Error('Refusing to run money audit probes outside a dedicated *_test database');
  }
}

beforeEach(async () => {
  requireTestDatabase();
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe('TRUNCATE ' + tables.map(t => '"' + t.tablename.replace(/"/g, '""') + '"').join(',') + ' CASCADE');
});

async function person(name: string, credit = 0, role: 'USER' | 'ADMIN' = 'USER') {
  const user = await db.user.create({ data: {
    email: `${randomUUID()}@audit.example.com`, emailVerifiedAt: new Date(),
    fullName: name, role, wallet: { create: {} },
  } });
  if (credit) await atomic(tx => ledger.post(tx, user.id, {
    amount: credit, type: 'adjustment', title: 'Audit fixture credit', titleAr: 'Audit fixture credit',
  }));
  return user.id;
}

async function balance(userId: string) {
  return (await db.wallet.findUniqueOrThrow({ where: { userId } })).balance;
}

const futureSlot = () => new Date(Math.ceil((Date.now() + 2 * 3_600_000) / 1_800_000) * 1_800_000).toISOString();
const spotInput = (): spots.SpotInput => ({
  title: 'Audit driveway', city: 'Ramallah', areaHint: 'Audit neighbourhood',
  fullAddress: 'Street 1 house 2', latitude: 31.9, longitude: 35.2,
  vehicleSize: 'car', covered: false, hourlyRate: 500,
  weekdays: [0, 1, 2, 3, 4, 5, 6], availableFrom: '00:00', availableTo: '00:00', instantBook: false,
});

async function spotFixture() {
  const hostId = await person('Audit Host');
  const driverId = await person('Audit Driver', 10000);
  const spot = await spots.create(hostId, spotInput(), randomUUID());
  const booking = await spots.book(driverId, spot.id, { startTime: futureSlot(), hours: 1 }, randomUUID());
  return { hostId, driverId, booking };
}


async function debitFor(kind: 'spot' | 'ride', bookingId: string) {
  return db.walletTransaction.findUniqueOrThrow({ where: { reference: `${kind}-payment:${bookingId}` } });
}

async function administrator() {
  return { userId: await person('Refund Administrator', 0, 'ADMIN'), role: 'ADMIN' as const };
}

async function startSpot(id: string, finished = false) {
  await db.spotBooking.update({ where: { id }, data: {
    startTime: new Date(Date.now() - 2 * 3_600_000),
    endTime: new Date(Date.now() + (finished ? -1 : 1) * 3_600_000),
  } });
}

async function paidRideFixture() {
  const hostId = await person('Legacy Ride Driver');
  const passengerId = await person('Legacy Ride Passenger', 10000);
  const vehicle = await db.vehicle.create({ data: { plateNumber: randomUUID() } });
  await db.userVehicle.create({ data: { userId: hostId, vehicleId: vehicle.id } });
  const ride = await rides.create(hostId, {
    fromCity: 'Ramallah', toCity: 'Nablus', meetingPoint: 'Al-Manara',
    departAt: futureSlot(), seatsTotal: 2, vehicleId: vehicle.id,
  }, randomUUID());
  // Current rides stay free; retained historical fares still need safe escrow.
  await db.ride.update({ where: { id: ride.id }, data: { pricePerSeat: 500 } });
  const booked = await rides.book(passengerId, ride.id, { seats: 1 }, randomUUID());
  return { hostId, passengerId, rideId: ride.id, booking: booked.myBooking! };
}

describe('booking escrow regressions', () => {
  it('does not credit a private spot debit twice after an admin refund and cancellation', async () => {
    const { driverId, booking } = await spotFixture();
    const administratorId = await person('Refund Administrator', 0, 'ADMIN');
    const debit = await db.walletTransaction.findUniqueOrThrow({ where: { reference: `spot-payment:${booking.id}` } });
    expect(await balance(driverId)).toBe(9500);
    await admin.refund({ userId: administratorId, role: 'ADMIN' }, debit.id, 'Refund requested during review', randomUUID());
    expect(await balance(driverId)).toBe(10000);

    await spots.cancel(driverId, booking.id);

    expect(await balance(driverId)).toBe(10000);
  });

  it('refunds an unanswered elapsed booking instead of allowing late acceptance to pay the host', async () => {
    const { hostId, driverId, booking } = await spotFixture();
    await db.spotBooking.update({ where: { id: booking.id }, data: {
      startTime: new Date(Date.now() - 2 * 3_600_000), endTime: new Date(Date.now() - 3_600_000),
    } });

    // A host can call this mutation directly without first opening a GET view.
    // A rejection or an expired/declined response is acceptable; paying them is not.
    await spots.respond(hostId, booking.id, true).catch(() => undefined);
    await spots.mine(driverId);

    expect(await balance(driverId)).toBe(10000);
    expect(await balance(hostId)).toBe(0);
    expect((await db.spotBooking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('declined');
  });


  it('expires an unanswered request as soon as its start passes, even before its end', async () => {
    const { hostId, driverId, booking } = await spotFixture();
    await startSpot(booking.id);

    const response = await spots.respond(hostId, booking.id, true);

    expect(response.status).toBe('declined');
    expect(await balance(driverId)).toBe(10000);
    expect(await balance(hostId)).toBe(0);
    expect(await db.walletTransaction.count({ where: { type: 'refund' } })).toBe(1);
  });

  it('keeps a timely acceptance funded until the host earns it exactly once', async () => {
    const { hostId, driverId, booking } = await spotFixture();
    expect((await spots.respond(hostId, booking.id, true)).status).toBe('confirmed');
    expect(await balance(driverId)).toBe(9500);
    expect(await balance(hostId)).toBe(0);
    await startSpot(booking.id, true);

    await Promise.all([spots.mine(driverId), spots.mine(hostId)]);
    await spots.mine(driverId);

    expect(await balance(driverId)).toBe(9500);
    expect(await balance(hostId)).toBe(500);
    expect(await db.walletTransaction.count({ where: { reference: `spot-earning:${booking.id}` } })).toBe(1);
  });

  it('returns the cancellation refund when an admin refunds the same debit later', async () => {
    const { driverId, booking } = await spotFixture();
    const debit = await debitFor('spot', booking.id);
    await spots.cancel(driverId, booking.id);
    const cancelled = await db.walletTransaction.findUniqueOrThrow({ where: { reference: `spot-refund:${booking.id}` } });

    const result = await admin.refund(await administrator(), debit.id, 'Reviewed cancellation refund', randomUUID());

    expect(result.id).toBe(cancelled.id);
    expect(await balance(driverId)).toBe(10000);
    expect(await db.walletTransaction.count({ where: { type: 'refund' } })).toBe(1);
  });

  it('does not pay an admin-refunded booking on explicit completion', async () => {
    const { hostId, driverId, booking } = await spotFixture();
    await spots.respond(hostId, booking.id, true);
    await admin.refund(await administrator(), (await debitFor('spot', booking.id)).id, 'Reviewed host booking refund', randomUUID());
    await startSpot(booking.id);

    expect((await spots.complete(driverId, booking.id)).status).toBe('completed');

    expect(await balance(driverId)).toBe(10000);
    expect(await balance(hostId)).toBe(0);
    expect(await db.walletTransaction.count({ where: { type: 'earning' } })).toBe(0);
  });

  it('does not pay an admin-refunded booking during automatic completion', async () => {
    const { hostId, driverId, booking } = await spotFixture();
    await spots.respond(hostId, booking.id, true);
    await admin.refund(await administrator(), (await debitFor('spot', booking.id)).id, 'Reviewed host booking refund', randomUUID());
    await startSpot(booking.id, true);

    await spots.mine(driverId);
    await spots.mine(hostId);

    expect((await db.spotBooking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('completed');
    expect(await balance(driverId)).toBe(10000);
    expect(await balance(hostId)).toBe(0);
    expect(await db.walletTransaction.count({ where: { type: 'earning' } })).toBe(0);
  });

  it('recognizes legacy generic refunds before cancellation can credit the booking again', async () => {
    const { driverId, booking } = await spotFixture();
    const debit = await debitFor('spot', booking.id);
    await atomic(tx => ledger.post(tx, driverId, {
      amount: 500, type: 'refund', title: 'Legacy admin refund', titleAr: 'Legacy admin refund', reference: `refund-${debit.id}`,
    }));

    await spots.cancel(driverId, booking.id);

    expect(await balance(driverId)).toBe(10000);
    expect(await db.walletTransaction.count({ where: { type: 'refund' } })).toBe(1);
  });

  it('recognizes legacy generic refunds before automatic host payout', async () => {
    const { hostId, driverId, booking } = await spotFixture();
    await spots.respond(hostId, booking.id, true);
    const debit = await debitFor('spot', booking.id);
    await atomic(tx => ledger.post(tx, driverId, {
      amount: 500, type: 'refund', title: 'Legacy admin refund', titleAr: 'Legacy admin refund', reference: `refund-${debit.id}`,
    }));
    await startSpot(booking.id, true);

    await spots.mine(driverId);

    expect(await balance(driverId)).toBe(10000);
    expect(await balance(hostId)).toBe(0);
  });

  it('serializes different admin refund keys with cancellation into one credit', async () => {
    const { driverId, booking } = await spotFixture();
    const debit = await debitFor('spot', booking.id);
    const actor = await administrator();

    await Promise.all([
      admin.refund(actor, debit.id, 'First reviewed refund', randomUUID()),
      admin.refund(actor, debit.id, 'Second reviewed refund', randomUUID()),
      spots.cancel(driverId, booking.id),
    ]);

    expect(await balance(driverId)).toBe(10000);
    expect(await db.walletTransaction.count({ where: { type: 'refund' } })).toBe(1);
    expect((await db.spotBooking.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe('cancelled');
  });

  it('serializes an admin refund racing completion without paying both parties', async () => {
    const { hostId, driverId, booking } = await spotFixture();
    await spots.respond(hostId, booking.id, true);
    await startSpot(booking.id);
    const debit = await debitFor('spot', booking.id);
    const actor = await administrator();

    const [refunded, completed] = await Promise.allSettled([
      admin.refund(actor, debit.id, 'Reviewed racing refund', randomUUID()),
      spots.complete(driverId, booking.id),
    ]);

    expect(completed.status).toBe('fulfilled');
    if (refunded.status === 'rejected') expect(refunded.reason).toMatchObject({ code: 'ESCROW_ALREADY_SETTLED' });
    expect([await balance(driverId), await balance(hostId)]).toEqual(refunded.status === 'fulfilled' ? [10000, 0] : [9500, 500]);
    expect(await db.walletTransaction.count({ where: { type: { in: ['refund', 'earning'] } } })).toBe(1);
  });

  it('rejects refunding spot escrow already paid to its host', async () => {
    const { hostId, driverId, booking } = await spotFixture();
    await spots.respond(hostId, booking.id, true);
    await startSpot(booking.id);
    await spots.complete(driverId, booking.id);

    await expect(admin.refund(await administrator(), (await debitFor('spot', booking.id)).id, 'Late reviewed refund', randomUUID()))
      .rejects.toMatchObject({ code: 'ESCROW_ALREADY_SETTLED', status: 409 });

    expect(await balance(driverId)).toBe(9500);
    expect(await balance(hostId)).toBe(500);
    expect(await db.walletTransaction.count({ where: { type: 'refund' } })).toBe(0);
  });

  it('keeps ordinary completed debit refunds available and idempotent', async () => {
    const userId = await person('Ordinary customer', 10000);
    const debit = await atomic(tx => ledger.post(tx, userId, {
      amount: -500, type: 'parking_payment', title: 'Ordinary parking', titleAr: 'Ordinary parking',
    }));
    const actor = await administrator();

    const first = await admin.refund(actor, debit.id, 'Reviewed parking refund', randomUUID());
    const second = await admin.refund(actor, debit.id, 'Another reviewed parking refund', randomUUID());

    expect(first.id).toBe(second.id);
    expect(await balance(userId)).toBe(10000);
    expect(await db.walletTransaction.count({ where: { type: 'refund' } })).toBe(1);
  });

  it('does not refund a legacy paid ride twice across admin refund and passenger cancellation', async () => {
    const { passengerId, booking } = await paidRideFixture();
    const debit = await debitFor('ride', booking.id);
    await admin.refund(await administrator(), debit.id, 'Reviewed legacy ride refund', randomUUID());

    await rides.cancelBooking(passengerId, booking.id);

    expect(await balance(passengerId)).toBe(10000);
    expect(await db.walletTransaction.count({ where: { type: 'refund' } })).toBe(1);
  });

  it('pays only unrefunded accepted fares when completing a legacy paid ride', async () => {
    const { hostId, passengerId, rideId, booking } = await paidRideFixture();
    const otherPassengerId = await person('Other legacy passenger', 10000);
    const otherBooking = (await rides.book(otherPassengerId, rideId, { seats: 1 }, randomUUID())).myBooking!;
    await rides.respond(hostId, booking.id, true);
    await rides.respond(hostId, otherBooking.id, true);
    await admin.refund(await administrator(), (await debitFor('ride', booking.id)).id, 'Reviewed first passenger refund', randomUUID());
    await db.ride.update({ where: { id: rideId }, data: { departAt: new Date(Date.now() - 60_000) } });

    await rides.complete(hostId, rideId);
    await rides.mine(passengerId);

    expect(await balance(passengerId)).toBe(10000);
    expect(await balance(otherPassengerId)).toBe(9500);
    expect(await balance(hostId)).toBe(500);
    expect(await db.walletTransaction.count({ where: { reference: `ride-earning:${rideId}` } })).toBe(1);
  });

  it('rejects refunding legacy ride escrow already paid to its driver', async () => {
    const { hostId, passengerId, rideId, booking } = await paidRideFixture();
    await rides.respond(hostId, booking.id, true);
    await db.ride.update({ where: { id: rideId }, data: { departAt: new Date(Date.now() - 60_000) } });
    await rides.complete(hostId, rideId);

    await expect(admin.refund(await administrator(), (await debitFor('ride', booking.id)).id, 'Late reviewed ride refund', randomUUID()))
      .rejects.toMatchObject({ code: 'ESCROW_ALREADY_SETTLED', status: 409 });

    expect(await balance(passengerId)).toBe(9500);
    expect(await balance(hostId)).toBe(500);
  });

});
