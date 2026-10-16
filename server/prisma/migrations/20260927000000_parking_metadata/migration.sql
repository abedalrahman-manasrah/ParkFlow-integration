ALTER TABLE "parking_zones"
ADD COLUMN "ownership" TEXT,
ADD COLUMN "accessRestriction" TEXT,
ADD COLUMN "accessRestrictionAr" TEXT,
ADD COLUMN "parkingAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "prototypeData" BOOLEAN NOT NULL DEFAULT false;
