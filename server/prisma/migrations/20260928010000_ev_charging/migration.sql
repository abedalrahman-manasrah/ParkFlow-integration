CREATE TYPE "EvStationStatus" AS ENUM ('operational', 'temporarily_unavailable', 'planned', 'unknown');
CREATE TYPE "EvConnectorType" AS ENUM ('type_2', 'ccs_2', 'chademo', 'gb_t', 'type_1', 'other');
CREATE TYPE "EvAccessType" AS ENUM ('public', 'customers_only', 'private', 'unknown');
CREATE TABLE "ev_charging_stations" (
  "id" TEXT PRIMARY KEY, "name" VARCHAR(160) NOT NULL, "operatorName" VARCHAR(160),
  "latitude" DOUBLE PRECISION NOT NULL CHECK ("latitude" BETWEEN -90 AND 90),
  "longitude" DOUBLE PRECISION NOT NULL CHECK ("longitude" BETWEEN -180 AND 180),
  "address" VARCHAR(300), "city" VARCHAR(100),
  "status" "EvStationStatus" NOT NULL DEFAULT 'unknown',
  "accessType" "EvAccessType" NOT NULL DEFAULT 'unknown',
  "pricingText" VARCHAR(500), "openingHoursText" VARCHAR(300), "phone" VARCHAR(32),
  "sourceName" VARCHAR(200), "sourceUrl" VARCHAR(2048), "lastVerifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "ev_connectors" (
  "id" TEXT PRIMARY KEY, "stationId" TEXT NOT NULL REFERENCES "ev_charging_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type" "EvConnectorType" NOT NULL, "powerKw" DOUBLE PRECISION NOT NULL CHECK ("powerKw" > 0 AND "powerKw" <= 1000),
  "quantity" INTEGER NOT NULL CHECK ("quantity" > 0)
);
CREATE INDEX "ev_charging_stations_latitude_longitude_idx" ON "ev_charging_stations"("latitude", "longitude");
CREATE INDEX "ev_charging_stations_longitude_idx" ON "ev_charging_stations"("longitude");
CREATE INDEX "ev_charging_stations_status_latitude_idx" ON "ev_charging_stations"("status", "latitude");
CREATE INDEX "ev_connectors_stationId_type_powerKw_idx" ON "ev_connectors"("stationId", "type", "powerKw");
