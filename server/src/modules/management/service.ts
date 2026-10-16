import { lockSessionFamily } from '../auth/service';
import { z } from "zod";
import { db, atomic, json, lock, type Tx } from "../../database/client";
import { ApiError, assert, requireValue } from "../../utils/errors";
import { event } from "../../realtime/outbox";
import type { Actor } from "../admin/service";
import { operatorPermission, zonePermission } from "./permissions";
import * as schemas from "./schemas";

const include = {
  operator: { select: { id: true, name: true } },
  tariffs: { orderBy: { validFrom: "desc" as const } },
  operatingHours: { orderBy: { weekday: "asc" as const } },
  closures: { orderBy: { startsAt: "asc" as const } },
};
const personSelect = {
  id: true,
  fullName: true,
  email: true,
  phone: true,
  role: true,
  status: true,
} as const;
export async function audit(
  tx: Tx,
  actor: Actor,
  action: string,
  resourceType: string,
  resourceId: string,
  before: unknown,
  after: unknown,
) {
  await tx.auditLog.create({
    data: {
      actorUserId: actor.userId,
      action,
      resourceType,
      resourceId,
      before: before == null ? undefined : json(before),
      after: after == null ? undefined : json(after),
      ip: actor.ip,
      userAgent: actor.userAgent,
    },
  });
}
async function viewZone(tx: Tx | typeof db, actor: Actor, id: string) {
  const zone = requireValue(
    await tx.parkingZone.findUnique({ where: { id }, include }),
  );
  const memberRole = await operatorPermission(
    tx,
    actor,
    zone.operatorId,
    "read",
  );
  return { ...zone, memberRole, canEdit: memberRole !== "attendant" };
}
async function checkedZone(
  tx: Tx,
  actor: Actor,
  id: string,
  expectedVersion: number,
) {
  await lock(tx, `zone:${id}`);
  const zone = await zonePermission(tx, actor, id, "edit");
  if (zone.version !== expectedVersion)
    throw new ApiError(
      409,
      "STALE_VERSION",
      "This parking location changed. Reload it before saving.",
      { currentVersion: zone.version },
    );
  return zone;
}
async function noUse(
  tx: Tx,
  id: string,
  range?: { startsAt: Date; endsAt: Date },
) {
  const now = new Date();
  const [reservations, sessions] = await Promise.all([
    tx.parkingReservation.findMany({
      where: {
        parkingZoneId: id,
        status: { in: ["confirmed", "checked_in"] },
        endTime: { gt: range ? range.startsAt : now },
        ...(range ? { startTime: { lt: range.endsAt } } : {}),
      },
      select: { id: true },
      take: 21,
    }),
    tx.parkingSession.findMany({
      where: {
        parkingZoneId: id,
        status: "ACTIVE",
        ...(range
          ? {
              startedAt: { lt: range.endsAt },
              OR: [{ endsAt: null }, { endsAt: { gt: range.startsAt } }],
            }
          : {}),
      },
      select: { id: true },
      take: 21,
    }),
  ]);
  if (reservations.length || sessions.length)
    throw new ApiError(
      409,
      "ZONE_IN_USE",
      "Resolve the affected reservations or active sessions before changing this parking location.",
      {
        reservationIds: reservations.map((r) => r.id),
        sessionIds: sessions.map((s) => s.id),
      },
    );
}
async function finish(
  tx: Tx,
  actor: Actor,
  id: string,
  action: string,
  before: unknown,
) {
  await tx.parkingZone.update({
    where: { id },
    data: { version: { increment: 1 } },
  });
  const after = await viewZone(tx, actor, id);
  await audit(tx, actor, action, "parking-zone", id, before, after);
  await event(tx, "parking.zone.updated", { zoneId: id });
  return after;
}
export async function listZones(actor: Actor) {
  const zones = await db.parkingZone.findMany({
    where:
      actor.role === "ADMIN"
        ? {}
        : { operator: { users: { some: { userId: actor.userId } } } },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: { id: true },
  });
  return Promise.all(zones.map((z) => viewZone(db, actor, z.id)));
}
export async function getZone(actor: Actor, id: string) {
  await zonePermission(db, actor, id, "read");
  return viewZone(db, actor, id);
}
export async function createZone(
  actor: Actor,
  input: z.input<typeof schemas.zoneCreateSchema>,
) {
  const parsed = schemas.zoneCreateSchema.parse(input);
  assert(
    parsed.supportedModes.includes(parsed.defaultMode),
    "VALIDATION",
    "Default parking mode must be supported",
  );
  return atomic(async (tx) => {
    await operatorPermission(tx, actor, parsed.operatorId, "create");
    const zone = await tx.parkingZone.create({
      data: {
        ...parsed,
        metadata: parsed.metadata ? json(parsed.metadata) : undefined,
        lifecycle: "draft",
        active: false,
        inventoryMode: "live",
        inventoryProvider: "manual",
        prototypeData: false,
      },
    });
    const result = await viewZone(tx, actor, zone.id);
    await audit(tx, actor, "create", "parking-zone", zone.id, null, result);
    return result;
  });
}
export async function patchZone(
  actor: Actor,
  id: string,
  input: z.input<typeof schemas.zonePatchSchema>,
) {
  const { expectedVersion, ...data } = schemas.zonePatchSchema.parse(input);
  return atomic(async (tx) => {
    const before = await checkedZone(tx, actor, id, expectedVersion);
    assert(
      before.lifecycle !== "archived",
      "ZONE_ARCHIVED",
      "Archived locations cannot be edited",
      409,
    );
    if (data.operatorId !== undefined && data.operatorId !== before.operatorId)
      assert(
        actor.role === "ADMIN",
        "FORBIDDEN",
        "Only an administrator can transfer a location",
        403,
      );
    const moved =
      (data.latitude !== undefined && data.latitude !== before.latitude) ||
      (data.longitude !== undefined && data.longitude !== before.longitude);
    const disruptive =
      moved ||
      (data.operatorId !== undefined &&
        data.operatorId !== before.operatorId) ||
      (data.capacity !== undefined && data.capacity < (before.capacity ?? 0));
    if (disruptive) await noUse(tx, id);
    assert(
      (data.supportedModes ?? before.supportedModes).includes(
        data.defaultMode ?? before.defaultMode,
      ),
      "VALIDATION",
      "Default parking mode must be supported",
    );
    await tx.parkingZone.update({
      where: { id },
      data: {
        ...data,
        metadata: data.metadata ? json(data.metadata) : undefined,
        ...(moved && actor.role !== "ADMIN" && before.lifecycle === "published"
          ? { lifecycle: "review", active: false }
          : {}),
      },
    });
    return finish(tx, actor, id, "update", before);
  });
}
export async function lifecycle(
  actor: Actor,
  id: string,
  input: z.input<typeof schemas.lifecycleSchema>,
) {
  const { expectedVersion, lifecycle: next } =
    schemas.lifecycleSchema.parse(input);
  return atomic(async (tx) => {
    const before = await checkedZone(tx, actor, id, expectedVersion);
    if (actor.role !== "ADMIN") {
      await operatorPermission(tx, actor, before.operatorId, "create");
      assert(
        next === "review" &&
          ["draft", "review", "suspended"].includes(before.lifecycle),
        "FORBIDDEN",
        "Only administrators can publish, suspend or archive locations",
        403,
      );
    }
    assert(
      before.lifecycle !== "archived" ||
        (actor.role === "ADMIN" && next === "draft"),
      "ZONE_ARCHIVED",
      "Restore an archived location as a draft first",
      409,
    );
    if (next === before.lifecycle) return viewZone(tx, actor, id);
    if (next !== "published") await noUse(tx, id);
    if (next === "published") {
      const now = new Date();
      const [hours, tariff] = await Promise.all([
        tx.operatingHour.findMany({ where: { zoneId: id } }),
        tx.parkingTariff.findFirst({
          where: {
            zoneId: id,
            validFrom: { lte: now },
            OR: [{ validTo: null }, { validTo: { gt: now } }],
          },
        }),
      ]);
      assert(
        before.capacity &&
          hours.length === 7 &&
          new Set(hours.map((h) => h.weekday)).size === 7 &&
          hours.some((h) => !h.closed) &&
          tariff,
        "ZONE_INCOMPLETE",
        "Set capacity, seven operating days and a current tariff before publishing",
        409,
      );
    }
    await tx.parkingZone.update({
      where: { id },
      data: { lifecycle: next, active: next === "published" },
    });
    return finish(tx, actor, id, "lifecycle", before);
  });
}
export async function tariff(
  actor: Actor,
  id: string,
  input: z.input<typeof schemas.tariffSchema>,
) {
  const { expectedVersion, ...fields } = schemas.tariffSchema.parse(input);
  const start = new Date(fields.validFrom),
    end = fields.validTo ? new Date(fields.validTo) : null;
  assert(
    start.getTime() >= Date.now() - 60000 && (!end || end > start),
    "VALIDATION",
    "Choose a valid future tariff interval",
  );
  assert(
    fields.dailyCap === undefined || fields.dailyCap >= fields.minimumCharge,
    "VALIDATION",
    "The daily cap cannot be below the minimum charge",
  );
  return atomic(async (tx) => {
    const before = await checkedZone(tx, actor, id, expectedVersion);
    assert(
      before.lifecycle !== "archived",
      "ZONE_ARCHIVED",
      "Archived locations cannot be edited",
      409,
    );
    const overlapping = await tx.parkingTariff.findMany({
      where: {
        zoneId: id,
        ...(end ? { validFrom: { lt: end } } : {}),
        OR: [{ validTo: null }, { validTo: { gt: start } }],
      },
    });
    const predecessor = overlapping.find(
      (t) =>
        t.validTo === null && t.validFrom < start && t.validFrom <= new Date(),
    );
    assert(
      overlapping.every((t) => t.id === predecessor?.id),
      "TARIFF_OVERLAP",
      "The tariff overlaps an existing scheduled tariff",
      409,
    );
    if (predecessor)
      await tx.parkingTariff.update({
        where: { id: predecessor.id },
        data: { validTo: start },
      });
    await tx.parkingTariff.create({
      data: {
        ...fields,
        zoneId: id,
        currency: "ILS",
        validFrom: start,
        validTo: end,
      },
    });
    return finish(tx, actor, id, "tariff", before);
  });
}
export async function hours(
  actor: Actor,
  id: string,
  input: z.input<typeof schemas.hoursSchema>,
) {
  const { expectedVersion, hours: rows } = schemas.hoursSchema.parse(input);
  return atomic(async (tx) => {
    const before = await checkedZone(tx, actor, id, expectedVersion);
    assert(
      before.lifecycle !== "archived",
      "ZONE_ARCHIVED",
      "Archived locations cannot be edited",
      409,
    );
    await noUse(tx, id);
    await tx.operatingHour.deleteMany({ where: { zoneId: id } });
    await tx.operatingHour.createMany({
      data: rows.map((r) => ({ ...r, zoneId: id })),
    });
    return finish(tx, actor, id, "hours", before);
  });
}
export async function addClosure(
  actor: Actor,
  id: string,
  input: z.input<typeof schemas.closureSchema>,
) {
  const { expectedVersion, ...data } = schemas.closureSchema.parse(input);
  const startsAt = new Date(data.startsAt),
    endsAt = new Date(data.endsAt);
  assert(
    startsAt.getTime() >= Date.now() - 60000 && endsAt > startsAt,
    "VALIDATION",
    "Choose a valid future closure interval",
  );
  return atomic(async (tx) => {
    const before = await checkedZone(tx, actor, id, expectedVersion);
    assert(
      before.lifecycle !== "archived",
      "ZONE_ARCHIVED",
      "Archived locations cannot be edited",
      409,
    );
    await noUse(tx, id, { startsAt, endsAt });
    assert(
      !(await tx.parkingClosure.findFirst({
        where: {
          zoneId: id,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      })),
      "CLOSURE_OVERLAP",
      "This closure overlaps an existing closure",
      409,
    );
    await tx.parkingClosure.create({
      data: { zoneId: id, startsAt, endsAt, reason: data.reason },
    });
    return finish(tx, actor, id, "closure", before);
  });
}
export async function removeClosure(
  actor: Actor,
  id: string,
  closureId: string,
  expectedVersion: number,
) {
  return atomic(async (tx) => {
    const before = await checkedZone(tx, actor, id, expectedVersion);
    assert(
      before.lifecycle !== "archived",
      "ZONE_ARCHIVED",
      "Restore this location as a draft before editing",
      409,
    );
    const closure = requireValue(
      await tx.parkingClosure.findFirst({
        where: { id: closureId, zoneId: id },
      }),
    );
    assert(
      closure.endsAt > new Date(),
      "VALIDATION",
      "Past closure history cannot be removed",
    );
    await tx.parkingClosure.delete({ where: { id: closureId } });
    await audit(
      tx,
      actor,
      "remove",
      "parking-closure",
      closureId,
      closure,
      null,
    );
    return finish(tx, actor, id, "closure", before);
  });
}

async function viewOperator(tx: Tx | typeof db, actor: Actor, id: string) {
  const memberRole = await operatorPermission(tx, actor, id, "read");
  const canManageStaff = ["admin", "owner"].includes(memberRole);
  const row = requireValue(
    await tx.parkingOperator.findUnique({
      where: { id },
      include: {
        _count: { select: { zones: true } },
        users: { include: { user: { select: personSelect } } },
      },
    }),
  );
  const { users, _count, ...data } = row;
  return {
    ...data,
    memberRole,
    canManageStaff,
    canCreateZone: canManageStaff,
    zoneCount: _count.zones,
    members: canManageStaff ? users : [],
  };
}
export async function listOperators(actor: Actor) {
  const rows = await db.parkingOperator.findMany({
    where:
      actor.role === "ADMIN"
        ? {}
        : { users: { some: { userId: actor.userId } } },
    orderBy: { name: "asc" },
    select: { id: true },
  });
  return Promise.all(rows.map((row) => viewOperator(db, actor, row.id)));
}
export async function createOperator(
  actor: Actor,
  input: z.input<typeof schemas.operatorSchema>,
) {
  assert(
    actor.role === "ADMIN",
    "FORBIDDEN",
    "Administrator access is required",
    403,
  );
  const data = schemas.operatorSchema.parse(input);
  return atomic(async (tx) => {
    const row = await tx.parkingOperator.create({ data });
    await audit(tx, actor, "create", "operator", row.id, null, row);
    return viewOperator(tx, actor, row.id);
  });
}
export async function updateOperator(
  actor: Actor,
  id: string,
  input: z.input<typeof schemas.operatorSchema>,
) {
  assert(
    actor.role === "ADMIN",
    "FORBIDDEN",
    "Administrator access is required",
    403,
  );
  const data = schemas.operatorSchema.parse(input);
  return atomic(async (tx) => {
    const before = requireValue(
      await tx.parkingOperator.findUnique({ where: { id } }),
    );
    const after = await tx.parkingOperator.update({ where: { id }, data });
    await audit(tx, actor, "update", "operator", id, before, after);
    return viewOperator(tx, actor, id);
  });
}
async function adjustPlatformRole(tx: Tx, userId: string) {
  await lockSessionFamily(tx, userId);
  const user = requireValue(
    await tx.user.findUnique({ where: { id: userId } }),
  );
  const count = await tx.operatorUser.count({ where: { userId } });
  if (user.role === "USER" && count)
    await tx.user.update({
      where: { id: userId },
      data: { role: "PARKING_OPERATOR" },
    });
  if (user.role === "PARKING_OPERATOR" && !count)
    await tx.user.update({ where: { id: userId }, data: { role: "USER" } });
  await tx.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
export async function assignMember(
  actor: Actor,
  operatorId: string,
  input: z.input<typeof schemas.memberSchema>,
) {
  const data = schemas.memberSchema.parse(input);
  return atomic(async (tx) => {
    await lock(tx, `operator:${operatorId}`);
    await operatorPermission(tx, actor, operatorId, "staff");
    await lockSessionFamily(tx, data.userId);
    const target = requireValue(
      await tx.user.findUnique({ where: { id: data.userId } }),
    );
    assert(
      target.status === "ACTIVE",
      "VALIDATION",
      "The selected account is suspended",
    );
    const before = await tx.operatorUser.findUnique({
      where: { operatorId_userId: { operatorId, userId: data.userId } },
    });
    if (actor.role !== "ADMIN")
      assert(
        data.memberRole !== "owner" &&
          before?.memberRole !== "owner" &&
          target.role !== "ADMIN" &&
          target.role !== "ENFORCEMENT_OFFICER",
        "FORBIDDEN",
        "Only administrators can assign or change owners and platform staff",
        403,
      );
    if (before?.memberRole === "owner" && data.memberRole !== "owner")
      assert(
        (await tx.operatorUser.count({
          where: { operatorId, memberRole: "owner" },
        })) > 1,
        "LAST_OWNER",
        "Assign another owner before removing the final owner",
        409,
      );
    const after = await tx.operatorUser.upsert({
      where: { operatorId_userId: { operatorId, userId: data.userId } },
      create: { operatorId, ...data },
      update: { memberRole: data.memberRole },
    });
    await adjustPlatformRole(tx, data.userId);
    await audit(
      tx,
      actor,
      "membership",
      "operator-user",
      operatorId + ":" + data.userId,
      before,
      after,
    );
    return viewOperator(tx, actor, operatorId);
  }, 'ReadCommitted');
}
export async function removeMember(
  actor: Actor,
  operatorId: string,
  userId: string,
) {
  return atomic(async (tx) => {
    await lock(tx, `operator:${operatorId}`);
    await operatorPermission(tx, actor, operatorId, "staff");
    await lockSessionFamily(tx, userId);
    const before = requireValue(
      await tx.operatorUser.findUnique({
        where: { operatorId_userId: { operatorId, userId } },
      }),
    );
    if (actor.role !== "ADMIN")
      assert(
        before.memberRole !== "owner",
        "FORBIDDEN",
        "Only administrators can change owner access",
        403,
      );
    if (before.memberRole === "owner")
      assert(
        (await tx.operatorUser.count({
          where: { operatorId, memberRole: "owner" },
        })) > 1,
        "LAST_OWNER",
        "Assign another owner before removing the final owner",
        409,
      );
    await tx.operatorUser.delete({
      where: { operatorId_userId: { operatorId, userId } },
    });
    await adjustPlatformRole(tx, userId);
    await audit(
      tx,
      actor,
      "remove",
      "operator-user",
      operatorId + ":" + userId,
      before,
      null,
    );
    return viewOperator(tx, actor, operatorId);
  }, 'ReadCommitted');
}
export async function removeOperator(actor: Actor, id: string) {
  assert(
    actor.role === "ADMIN",
    "FORBIDDEN",
    "Administrator access is required",
    403,
  );
  return atomic(async (tx) => {
    await lock(tx, `operator:${id}`);
    const before = requireValue(
      await tx.parkingOperator.findUnique({
        where: { id },
        include: { users: true },
      }),
    );
    assert(
      !(await tx.parkingZone.count({ where: { operatorId: id } })),
      "OPERATOR_IN_USE",
      "Organizations with parking history cannot be removed",
      409,
    );
    // Multi-account lifecycle locks use a stable order across organizations.
    for (const userId of before.users.map(member => member.userId).sort())
      await lockSessionFamily(tx, userId);
    await tx.operatorUser.deleteMany({ where: { operatorId: id } });
    for (const member of before.users)
      await adjustPlatformRole(tx, member.userId);
    await tx.parkingOperator.delete({ where: { id } });
    await audit(tx, actor, "remove", "operator", id, before, null);
    return { ok: true };
  }, 'ReadCommitted');
}
export async function findPeople(
  actor: Actor,
  operatorId: string,
  query: string,
) {
  await operatorPermission(db, actor, operatorId, "staff");
  const value = query.trim();
  assert(
    value.length >= 3,
    "VALIDATION",
    "Enter an exact email, phone number or account ID",
  );
  return db.user.findMany({
    where: {
      OR: [{ id: value }, { email: value.toLowerCase() }, { phone: value }],
    },
    select: personSelect,
    take: 5,
  });
}
