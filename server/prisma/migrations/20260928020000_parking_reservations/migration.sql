CREATE TYPE "ParkingReservationStatus" AS ENUM ('confirmed', 'cancelled', 'expired', 'checked_in', 'completed');

CREATE TABLE "parking_reservations" (
  "id" TEXT NOT NULL,
  "parkingZoneId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "startTime" TIMESTAMP(3) NOT NULL,
  "endTime" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL CHECK ("durationMinutes" >= 30 AND "durationMinutes" <= 480 AND "durationMinutes" % 30 = 0),
  "hourlyRateSnapshot" INTEGER NOT NULL CHECK ("hourlyRateSnapshot" >= 0),
  "estimatedTotalPriceSnapshot" INTEGER NOT NULL CHECK ("estimatedTotalPriceSnapshot" >= 0),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'ILS',
  "priceIsDemo" BOOLEAN NOT NULL DEFAULT false,
  "isDemoReservation" BOOLEAN NOT NULL DEFAULT true,
  "status" "ParkingReservationStatus" NOT NULL DEFAULT 'confirmed',
  "publicCode" VARCHAR(32) NOT NULL,
  "qrToken" VARCHAR(128) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "parking_reservations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "parking_reservations_parkingZoneId_fkey" FOREIGN KEY ("parkingZoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parking_reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "parking_reservations_time_check" CHECK ("endTime" > "startTime")
);

CREATE UNIQUE INDEX "parking_reservations_publicCode_key" ON "parking_reservations"("publicCode");
CREATE UNIQUE INDEX "parking_reservations_qrToken_key" ON "parking_reservations"("qrToken");
CREATE INDEX "parking_reservations_userId_startTime_idx" ON "parking_reservations"("userId", "startTime");
CREATE INDEX "parking_reservations_status_endTime_idx" ON "parking_reservations"("status", "endTime");
CREATE INDEX "parking_reservations_parkingZoneId_startTime_idx" ON "parking_reservations"("parkingZoneId", "startTime");
