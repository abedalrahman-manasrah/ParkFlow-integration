CREATE TYPE "TourismPlaceCategory" AS ENUM ('historic_landmark', 'museum', 'park_garden', 'visitor_attraction');

CREATE TABLE "tourism_places" (
  "id" VARCHAR(120) NOT NULL,
  "nameAr" VARCHAR(200) NOT NULL,
  "nameEn" VARCHAR(200) NOT NULL,
  "primaryCategory" "TourismPlaceCategory" NOT NULL,
  "descriptionAr" VARCHAR(1000),
  "cityAr" VARCHAR(100),
  "regionAr" VARCHAR(120),
  "addressAr" VARCHAR(300),
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "mapReady" BOOLEAN NOT NULL DEFAULT false,
  "coordinateReferenceSystem" VARCHAR(40),
  "coordinateSourceUrl" VARCHAR(2048),
  "locationStatus" VARCHAR(80) NOT NULL,
  "coordinateMeaning" VARCHAR(120),
  "locationNoteAr" VARCHAR(700),
  "navigationEntrance" JSONB,
  "fieldVerified" BOOLEAN NOT NULL DEFAULT false,
  "openingHours" JSONB,
  "entryFee" JSONB,
  "isFreeEntry" BOOLEAN,
  "publicAccessConfirmed" BOOLEAN,
  "phone" VARCHAR(32),
  "email" VARCHAR(254),
  "website" VARCHAR(2048),
  "imageUrl" VARCHAR(2048),
  "sourceImageUrl" VARCHAR(2048),
  "imageLicense" VARCHAR(300),
  "imageUsageRightsVerified" BOOLEAN NOT NULL DEFAULT false,
  "accessibility" JSONB,
  "toiletsAvailable" BOOLEAN,
  "parkingAvailable" BOOLEAN,
  "nearbyParkingIds" TEXT[] NOT NULL,
  "officialSourceId" INTEGER,
  "sources" JSONB NOT NULL,
  "sourcesCheckedOn" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tourism_places_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tourism_place_category_links" (
  "placeId" VARCHAR(120) NOT NULL,
  "category" "TourismPlaceCategory" NOT NULL,
  CONSTRAINT "tourism_place_category_links_pkey" PRIMARY KEY ("placeId", "category")
);

CREATE INDEX "tourism_places_latitude_longitude_idx" ON "tourism_places"("latitude", "longitude");
CREATE INDEX "tourism_places_mapReady_latitude_longitude_idx" ON "tourism_places"("mapReady", "latitude", "longitude");
CREATE INDEX "tourism_place_category_links_category_idx" ON "tourism_place_category_links"("category");

ALTER TABLE "tourism_place_category_links"
  ADD CONSTRAINT "tourism_place_category_links_placeId_fkey"
  FOREIGN KEY ("placeId") REFERENCES "tourism_places"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
