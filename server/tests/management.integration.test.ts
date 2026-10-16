import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { db, atomic } from "../src/database/client";
import { redis } from "../src/database/redis";
import { issue } from "../src/modules/auth/service";
import * as adminService from "../src/modules/admin/service";

const app = createApp();
let adminToken: string,
  ownerToken: string,
  managerToken: string,
  attendantToken: string,
  otherToken: string;
const allHours = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  opensAt: "00:00",
  closesAt: "00:00",
  closed: false,
}));
const zoneBody = {
  operatorId: "mg-op",
  code: "NEW-MANAGED",
  name: "New parking",
  nameAr: "موقف جديد",
  city: "Ramallah",
  cityAr: "رام الله",
  latitude: 31.9,
  longitude: 35.2,
  kind: "garage",
  capacity: 20,
  defaultMode: "start_stop",
  supportedModes: ["start_stop"],
  supportedEntryMethods: ["manual"],
};
const api = (
  method: "get" | "post" | "patch" | "delete",
  path: string,
  token = adminToken,
  body?: object,
) =>
  request(app)
    [method]("/api/v1" + path)
    .auth(token, { type: "bearer" })
    .send(body ?? {});
beforeEach(async () => {
  const tables = await db.$queryRaw<
    { tablename: string }[]
  >`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(
    "TRUNCATE " +
      tables.map((t) => '"' + t.tablename.replace(/"/g, '""') + '"').join(",") +
      " CASCADE",
  );
  await redis.flushdb();
  const tokens = [];
  for (const [id, role] of [
    ["mg-admin", "ADMIN"],
    ["mg-owner", "PARKING_OPERATOR"],
    ["mg-manager", "PARKING_OPERATOR"],
    ["mg-attendant", "PARKING_OPERATOR"],
    ["mg-other", "PARKING_OPERATOR"],
  ] as const) {
    const user = await db.user.create({
      data: { id, role, email: id + "@example.com", fullName: id },
    });
    tokens.push((await atomic((tx) => issue(tx, user, {}))).accessToken);
  }
  [adminToken, ownerToken, managerToken, attendantToken, otherToken] =
    tokens as [string, string, string, string, string];
  await db.parkingOperator.createMany({
    data: [
      { id: "mg-op", name: "My operator" },
      { id: "mg-other-op", name: "Other operator" },
    ],
  });
  for (const userId of ["mg-owner", "mg-manager", "mg-attendant"])
    await db.operatorUser.create({ data: { operatorId: "mg-op", userId } });
  await db.operatorUser.create({
    data: { operatorId: "mg-other-op", userId: "mg-other" },
  });
  await db.parkingZone.create({
    data: {
      ...zoneBody,
      id: "mg-zone",
      code: "MG-1",
      defaultMode: "start_stop",
      supportedModes: ["start_stop"],
      operatingHours: { create: allHours },
      tariffs: {
        create: {
          name: "Current",
          hourlyRate: 500,
          incrementMinutes: 15,
          freeMinutes: 0,
          minimumCharge: 0,
          validFrom: new Date("2020-01-01"),
        },
      },
    },
  });
});
async function assignRoles() {
  await db.operatorUser.update({
    where: { operatorId_userId: { operatorId: "mg-op", userId: "mg-owner" } },
    data: { memberRole: "owner" },
  });
  await db.operatorUser.update({
    where: {
      operatorId_userId: { operatorId: "mg-op", userId: "mg-attendant" },
    },
    data: { memberRole: "attendant" },
  });
}
async function reservation() {
  return db.parkingReservation.create({
    data: {
      id: "mg-res",
      parkingZoneId: "mg-zone",
      userId: "mg-owner",
      startTime: new Date(Date.now() + 3600000),
      endTime: new Date(Date.now() + 7200000),
      durationMinutes: 60,
      hourlyRateSnapshot: 500,
      estimatedTotalPriceSnapshot: 500,
      publicCode: "MG-RES",
      qrToken: "mg-qr-token",
    },
  });
}

describe("management permissions and safe changes", () => {
  it("forces availability provenance on the legacy admin endpoint", async () => {
    const r = await api(
      "post",
      "/admin/parking-zones/mg-zone/availability",
      managerToken,
      { availability: "available", source: "SENSOR", confidence: 1 },
    );
    expect(r.status).toBe(200);
    expect(r.body.source).toBe("OPERATOR");
  });
  it.each(["mg-owner", "mg-manager", "mg-attendant"])("rejects impossible availability counts from %s without writing a snapshot", async (userId) => {
    await assignRoles();
    const token = userId === "mg-owner" ? ownerToken : userId === "mg-manager" ? managerToken : attendantToken;
    for (const counts of [{ availableSpaces: 21 }, { occupiedSpaces: 21 }]) {
      const result = await api("post", "/operator/zones/mg-zone/availability", token, {
        availability: "available", confidence: 1, ...counts,
      });
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe("VALIDATION");
    }
    expect(await db.availabilitySnapshot.count({ where: { zoneId: "mg-zone" } })).toBe(0);
    const accepted = await api("post", "/operator/zones/mg-zone/availability", token, {
      availability: "available", confidence: 1, availableSpaces: 20, occupiedSpaces: 0,
    });
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ availableSpaces: 20, occupiedSpaces: 0, source: "OPERATOR" });
  });
  it("restricts list/detail to the assigned organization", async () => {
    expect((await api("get", "/management/zones", otherToken)).body).toEqual(
      [],
    );
    expect(
      (await api("get", "/management/zones/mg-zone", otherToken)).status,
    ).toBe(403);
    expect(
      (await api("get", "/management/zones", managerToken)).body[0].id,
    ).toBe("mg-zone");
  });
  it("rejects stale edits and records one audited version increment", async () => {
    const first = await api(
      "patch",
      "/management/zones/mg-zone",
      managerToken,
      { expectedVersion: 1, name: "Updated" },
    );
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ name: "Updated", version: 2 });
    const stale = await api(
      "patch",
      "/management/zones/mg-zone",
      managerToken,
      { expectedVersion: 1, name: "Lost update" },
    );
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("STALE_VERSION");
    expect(
      (await db.parkingZone.findUniqueOrThrow({ where: { id: "mg-zone" } }))
        .name,
    ).toBe("Updated");
    expect(await db.auditLog.count({ where: { resourceId: "mg-zone" } })).toBe(
      1,
    );
  });
  it("limits analytics to financially authorized organizations for mixed memberships", async () => {
    await assignRoles();
    await db.operatorUser.create({ data: { userId: "mg-owner", operatorId: "mg-other-op", memberRole: "attendant" } });
    await db.parkingZone.create({ data: { ...zoneBody, id: "mg-private-zone", code: "MG-PRIVATE", operatorId: "mg-other-op", defaultMode: "start_stop", supportedModes: ["start_stop"] } });
    const mixed = await api("get", "/operator/analytics", ownerToken);
    expect(mixed.status).toBe(200);
    expect(mixed.body.zones.map((zone: { zoneId: string }) => zone.zoneId)).toEqual(["mg-zone"]);
    const attendant = await api("get", "/operator/analytics", attendantToken);
    expect(attendant.status).toBe(200);
    expect(attendant.body.zones).toEqual([]);
  });
  it("permits only owners to create drafts and only administrators to publish", async () => {
    await assignRoles();
    expect(
      (await api("post", "/management/zones", managerToken, zoneBody)).status,
    ).toBe(403);
    const draft = await api("post", "/management/zones", ownerToken, zoneBody);
    expect(draft.status).toBe(200);
    expect(draft.body).toMatchObject({
      lifecycle: "draft",
      active: false,
      inventoryMode: "live",
      inventoryProvider: "manual",
      prototypeData: false,
    });
    const id = draft.body.id;
    expect(
      (
        await api("post", `/management/zones/${id}/lifecycle`, ownerToken, {
          expectedVersion: 1,
          lifecycle: "published",
        })
      ).status,
    ).toBe(403);
    const submitted = await api(
      "post",
      `/management/zones/${id}/lifecycle`,
      ownerToken,
      { expectedVersion: 1, lifecycle: "review" },
    );
    expect(submitted.status).toBe(200);
  });
  it("requires fresh explicit counts before a newly published zone accepts reservations", async () => {
    await assignRoles();
    const draft = await api("post", "/management/zones", ownerToken, zoneBody);
    expect(draft.status).toBe(200);
    const id = draft.body.id;
    const hours = await api("patch", `/management/zones/${id}/hours`, ownerToken, { expectedVersion: 1, hours: allHours });
    expect(hours.status).toBe(200);
    const tariff = await api("post", `/management/zones/${id}/tariffs`, ownerToken, {
      expectedVersion: 2, name: "Live price", hourlyRate: 500, incrementMinutes: 15,
      freeMinutes: 0, minimumCharge: 0, validFrom: new Date(Date.now() - 1000).toISOString(),
    });
    expect(tariff.status).toBe(200);
    const published = await api("post", `/management/zones/${id}/lifecycle`, adminToken, { expectedVersion: 3, lifecycle: "published" });
    expect(published.status).toBe(200);
    const book = async (key: string) => {
      const selection = { zoneId: id, startTime: new Date(Date.now() + 3600000).toISOString(), durationMinutes: 60 };
      const quoted = await api("post", "/parking/reservations/quote", ownerToken, selection);
      expect(quoted.status).toBe(200);
      return request(app).post("/api/v1/parking/reservations")
        .auth(ownerToken, { type: "bearer" }).set("Idempotency-Key", key)
        .send({ ...selection, spotId: `${id}:L001`, quote: quoted.body.confirmation });
    };
    const noFeed = await book("managed-no-feed");
    expect(noFeed.status).toBe(409);
    expect(noFeed.body.error.code).toBe("INVENTORY_FEED_UNVERIFIED");
    expect((await api("post", `/admin/parking-zones/${id}/availability`, ownerToken, { availability: "available", source: "OPERATOR", confidence: 1 })).status).toBe(200);
    const noCount = await book("managed-no-count");
    expect(noCount.status).toBe(409);
    expect(noCount.body.error.code).toBe("INVENTORY_CAPACITY_UNKNOWN");
    expect((await api("post", `/admin/parking-zones/${id}/availability`, ownerToken, { availability: "available", source: "OPERATOR", confidence: 1, availableSpaces: 2, occupiedSpaces: 18 })).status).toBe(200);
    const booked = await book("managed-counted");
    expect(booked.status).toBe(200);
    expect(booked.body).toMatchObject({ parkingZoneId: id, spotId: `${id}:L001`, status: "confirmed" });
  });
  it("does not publish incomplete parking data", async () => {
    const draft = await api("post", "/management/zones", adminToken, zoneBody);
    const result = await api(
      "post",
      `/management/zones/${draft.body.id}/lifecycle`,
      adminToken,
      { expectedVersion: 1, lifecycle: "published" },
    );
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("ZONE_INCOMPLETE");
  });
  it("blocks attendants on every legacy editing route and keeps operational availability available", async () => {
    await assignRoles();
    expect(
      (
        await api("patch", "/management/zones/mg-zone", attendantToken, {
          expectedVersion: 1,
          name: "Forbidden",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api("patch", "/admin/parking-zones/mg-zone", attendantToken, {
          expectedVersion: 1,
          name: "Forbidden",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api(
          "patch",
          "/admin/parking-zones/mg-zone/hours",
          attendantToken,
          { expectedVersion: 1, hours: allHours },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await api(
          "post",
          "/operator/zones/mg-zone/availability",
          attendantToken,
          { availability: "limited", source: "ANPR", confidence: 1 },
        )
      ).status,
    ).toBe(200);
  });
  it("prevents active publication and assignment bypasses through legacy patch", async () => {
    expect(
      (
        await api("patch", "/admin/parking-zones/mg-zone", managerToken, {
          expectedVersion: 1,
          active: true,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api("patch", "/management/zones/mg-zone", managerToken, {
          expectedVersion: 1,
          operatorId: "mg-other-op",
        })
      ).status,
    ).toBe(403);
  });
  it("blocks archival and relocation while future reservations exist", async () => {
    await reservation();
    for (const [path, body] of [
      [
        "/management/zones/mg-zone/lifecycle",
        { expectedVersion: 1, lifecycle: "archived" },
      ],
      [
        "/management/zones/mg-zone/lifecycle",
        { expectedVersion: 1, lifecycle: "suspended" },
      ],
    ] as const) {
      const r = await api("post", path, adminToken, body);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe("ZONE_IN_USE");
    }
    const moved = await api("patch", "/management/zones/mg-zone", adminToken, {
      expectedVersion: 1,
      latitude: 32,
    });
    expect(moved.status).toBe(409);
  });
  it("archives an unused zone without removing its price history", async () => {
    const r = await api(
      "post",
      "/management/zones/mg-zone/lifecycle",
      adminToken,
      { expectedVersion: 1, lifecycle: "archived" },
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      active: false,
      lifecycle: "archived",
      version: 2,
    });
    expect(await db.parkingTariff.count({ where: { zoneId: "mg-zone" } })).toBe(
      1,
    );
  });
  it("requires complete weekly hours and protects existing reservations from closure", async () => {
    expect(
      (
        await api("patch", "/management/zones/mg-zone/hours", managerToken, {
          expectedVersion: 1,
          hours: allHours.slice(0, 6),
        })
      ).status,
    ).toBe(400);
    await reservation();
    const r = await api(
      "patch",
      "/management/zones/mg-zone/hours",
      managerToken,
      {
        expectedVersion: 1,
        hours: allHours.map((h) => ({ ...h, closed: true })),
      },
    );
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("ZONE_IN_USE");
  });
  it("rejects dated closures overlapping future reservations", async () => {
    const existing = await reservation();
    const r = await api(
      "post",
      "/management/zones/mg-zone/closures",
      managerToken,
      {
        expectedVersion: 1,
        startsAt: existing.startTime.toISOString(),
        endsAt: existing.endTime.toISOString(),
        reason: "Maintenance",
      },
    );
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("ZONE_IN_USE");
  });
  it("preserves closure history while the zone is archived", async () => {
    const closure = await db.parkingClosure.create({ data: { zoneId: "mg-zone", startsAt: new Date(Date.now() + 3600000), endsAt: new Date(Date.now() + 7200000), reason: "Scheduled maintenance" } });
    await db.parkingZone.update({ where: { id: "mg-zone" }, data: { lifecycle: "archived", active: false } });
    const result = await api("delete", `/management/zones/mg-zone/closures/${closure.id}`, adminToken, { expectedVersion: 1 });
    expect(result.status).toBe(409);
    expect(result.body.error.code).toBe("ZONE_ARCHIVED");
    expect(await db.parkingClosure.findUnique({ where: { id: closure.id } })).not.toBeNull();
    expect((await db.parkingZone.findUniqueOrThrow({ where: { id: "mg-zone" } })).version).toBe(1);
  });
  it("creates and removes a scoped dated closure with version checks", async () => {
    const result = await api(
      "post",
      "/management/zones/mg-zone/closures",
      managerToken,
      {
        expectedVersion: 1,
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        endsAt: new Date(Date.now() + 90000000).toISOString(),
        reason: "Maintenance",
      },
    );
    expect(result.status).toBe(200);
    expect(result.body.version).toBe(2);
    expect(result.body.closures).toHaveLength(1);
    expect(
      (
        await api(
          "delete",
          `/management/zones/mg-zone/closures/${result.body.closures[0].id}`,
          otherToken,
          { expectedVersion: 2 },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await api(
          "delete",
          `/management/zones/mg-zone/closures/${result.body.closures[0].id}`,
          managerToken,
          { expectedVersion: 2 },
        )
      ).status,
    ).toBe(200);
  });
  it("schedules a price without changing confirmed reservation snapshots and rejects overlapping prices", async () => {
    await reservation();
    const from = new Date(Date.now() + 600000).toISOString();
    const body = {
      expectedVersion: 1,
      name: "Updated rate",
      hourlyRate: 750,
      incrementMinutes: 15,
      freeMinutes: 0,
      minimumCharge: 0,
      validFrom: from,
    };
    const r = await api(
      "post",
      "/management/zones/mg-zone/tariffs",
      managerToken,
      body,
    );
    expect(r.status).toBe(200);
    expect(r.body.version).toBe(2);
    expect(
      (
        await db.parkingReservation.findUniqueOrThrow({
          where: { id: "mg-res" },
        })
      ).hourlyRateSnapshot,
    ).toBe(500);
    expect(
      (
        await api("post", "/management/zones/mg-zone/tariffs", managerToken, {
          ...body,
          expectedVersion: 2,
        })
      ).status,
    ).toBe(409);
  });
  it("lets administrators assign owners while owners can manage only lower staff roles", async () => {
    await assignRoles();
    await db.user.create({
      data: {
        id: "mg-new",
        fullName: "New employee",
        email: "new@example.com",
      },
    });
    expect(
      (
        await api("post", "/management/operators/mg-op/members", ownerToken, {
          userId: "mg-new",
          memberRole: "owner",
        })
      ).status,
    ).toBe(403);
    const added = await api(
      "post",
      "/management/operators/mg-op/members",
      ownerToken,
      { userId: "mg-new", memberRole: "attendant" },
    );
    expect(added.status).toBe(200);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: "mg-new" } })).role,
    ).toBe("PARKING_OPERATOR");
    expect(
      (
        await api(
          "delete",
          "/management/operators/mg-op/members/mg-owner",
          ownerToken,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await api(
          "delete",
          "/management/operators/mg-op/members/mg-new",
          ownerToken,
        )
      ).status,
    ).toBe(200);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: "mg-new" } })).role,
    ).toBe("USER");
  });
  it("preserves the final operator owner when changing memberships", async () => {
    await assignRoles();
    const r = await api(
      "delete",
      "/management/operators/mg-op/members/mg-owner",
      adminToken,
    );
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("LAST_OWNER");
  });
  it("keeps an active administrator when two admins change each other concurrently", async () => {
    const another = await db.user.create({
      data: { id: "mg-admin-2", email: "admin2@example.com", role: "ADMIN" },
    });
    // Both requests have already authenticated before either transaction starts.
    const results = await Promise.allSettled([
      adminService.role({ userId: "mg-admin", role: "ADMIN" }, another.id, {
        role: "USER",
      }),
      adminService.role({ userId: another.id, role: "ADMIN" }, "mg-admin", {
        role: "USER",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.user.count({ where: { role: "ADMIN", status: "ACTIVE" } }),
    ).toBe(1);
  });
});
