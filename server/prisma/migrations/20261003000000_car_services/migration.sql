CREATE TYPE "CarServiceCategory" AS ENUM ('car_wash', 'oil_change', 'maintenance', 'tire_service');

CREATE TABLE "car_service_businesses" (
  "id" VARCHAR(120) NOT NULL,
  "nameAr" VARCHAR(200) NOT NULL,
  "nameEn" VARCHAR(200) NOT NULL,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "mapReady" BOOLEAN NOT NULL DEFAULT false,
  "coordinateAccuracy" VARCHAR(80) NOT NULL,
  "coordinateNoteAr" VARCHAR(500),
  "coordinateNoteEn" VARCHAR(500),
  "addressAr" VARCHAR(300),
  "addressEn" VARCHAR(300),
  "phone" VARCHAR(32),
  "website" VARCHAR(2048),
  "openingHoursText" VARCHAR(300),
  "servicesAr" TEXT[] NOT NULL,
  "servicesEn" TEXT[] NOT NULL,
  "pricing" JSONB,
  "operatingStatus" VARCHAR(80) NOT NULL,
  "verificationStatus" VARCHAR(80) NOT NULL,
  "sourceName" VARCHAR(200) NOT NULL,
  "sourceUrl" VARCHAR(2048) NOT NULL,
  "secondarySourceUrl" VARCHAR(2048),
  "lastCheckedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "car_service_businesses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "car_service_category_links" (
  "businessId" VARCHAR(120) NOT NULL,
  "category" "CarServiceCategory" NOT NULL,
  CONSTRAINT "car_service_category_links_pkey" PRIMARY KEY ("businessId", "category")
);

CREATE INDEX "car_service_businesses_latitude_longitude_idx" ON "car_service_businesses"("latitude", "longitude");
CREATE INDEX "car_service_businesses_mapReady_latitude_longitude_idx" ON "car_service_businesses"("mapReady", "latitude", "longitude");
CREATE INDEX "car_service_category_links_category_idx" ON "car_service_category_links"("category");

ALTER TABLE "car_service_category_links"
  ADD CONSTRAINT "car_service_category_links_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "car_service_businesses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
