-- Gate entry/exit records, gate devices and per-lot overstay rules.
-- AlterTable
ALTER TABLE "parking_zones" ADD COLUMN     "overstayFee" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN     "overstayGraceMinutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "overstayMaxPerStay" INTEGER NOT NULL DEFAULT 20000,
ADD COLUMN     "overstayRepeatMinutes" INTEGER NOT NULL DEFAULT 60;

-- AlterTable
ALTER TABLE "violations" ADD COLUMN     "parkingVisitId" TEXT;

-- CreateTable
CREATE TABLE "parking_visits" (
    "id" TEXT NOT NULL,
    "parkingZoneId" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "vehicleId" TEXT,
    "enteredAt" TIMESTAMP(3) NOT NULL,
    "exitedAt" TIMESTAMP(3),
    "entrySource" TEXT NOT NULL,
    "exitSource" TEXT,
    "entryDeviceId" TEXT,
    "exitDeviceId" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gate_devices" (
    "id" TEXT NOT NULL,
    "parkingZoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gate_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parking_visits_parkingZoneId_exitedAt_idx" ON "parking_visits"("parkingZoneId", "exitedAt");

-- CreateIndex
CREATE INDEX "parking_visits_plateNumber_exitedAt_idx" ON "parking_visits"("plateNumber", "exitedAt");

-- CreateIndex
CREATE INDEX "parking_visits_exitedAt_idx" ON "parking_visits"("exitedAt");

-- CreateIndex
CREATE UNIQUE INDEX "gate_devices_keyHash_key" ON "gate_devices"("keyHash");

-- CreateIndex
CREATE INDEX "gate_devices_parkingZoneId_idx" ON "gate_devices"("parkingZoneId");

-- CreateIndex
CREATE INDEX "violations_parkingVisitId_idx" ON "violations"("parkingVisitId");

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_parkingVisitId_fkey" FOREIGN KEY ("parkingVisitId") REFERENCES "parking_visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_visits" ADD CONSTRAINT "parking_visits_parkingZoneId_fkey" FOREIGN KEY ("parkingZoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gate_devices" ADD CONSTRAINT "gate_devices_parkingZoneId_fkey" FOREIGN KEY ("parkingZoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A plate can only be inside one lot at a time.
CREATE UNIQUE INDEX "parking_visits_one_open_per_plate" ON "parking_visits"("plateNumber") WHERE "exitedAt" IS NULL;
ALTER TABLE "parking_visits" ADD CONSTRAINT "parking_visits_time_check" CHECK ("exitedAt" IS NULL OR "exitedAt" >= "enteredAt");
ALTER TABLE "parking_zones" ADD CONSTRAINT "parking_zones_overstay_check" CHECK ("overstayGraceMinutes" BETWEEN 0 AND 240 AND "overstayFee" >= 0 AND "overstayRepeatMinutes" BETWEEN 15 AND 1440 AND "overstayMaxPerStay" >= 0);
