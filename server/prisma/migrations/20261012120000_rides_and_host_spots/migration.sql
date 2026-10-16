-- Shared rides between cities and privately hosted parking spots.
-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('open', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "RideBookingStatus" AS ENUM ('pending', 'accepted', 'declined', 'cancelled', 'completed');

-- CreateEnum
CREATE TYPE "SpotBookingStatus" AS ENUM ('pending', 'confirmed', 'declined', 'cancelled', 'active', 'completed');

-- Ride and spot payments, plus earnings paid out to drivers and hosts.
ALTER TYPE "TransactionType" ADD VALUE 'ride_payment';
ALTER TYPE "TransactionType" ADD VALUE 'spot_payment';
ALTER TYPE "TransactionType" ADD VALUE 'earning';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "gender" TEXT;

-- CreateTable
CREATE TABLE "rides" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "fromCity" TEXT NOT NULL,
    "toCity" TEXT NOT NULL,
    "meetingPoint" TEXT NOT NULL,
    "departAt" TIMESTAMP(3) NOT NULL,
    "seatsTotal" INTEGER NOT NULL,
    "pricePerSeat" INTEGER NOT NULL,
    "womenOnly" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "status" "RideStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ride_bookings" (
    "id" TEXT NOT NULL,
    "rideId" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "seats" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "RideBookingStatus" NOT NULL DEFAULT 'pending',
    "driverRating" INTEGER,
    "passengerRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ride_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "host_spots" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "city" TEXT NOT NULL,
    "areaHint" TEXT NOT NULL,
    "fullAddress" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "vehicleSize" TEXT NOT NULL DEFAULT 'car',
    "covered" BOOLEAN NOT NULL DEFAULT false,
    "hourlyRate" INTEGER NOT NULL,
    "dailyRate" INTEGER,
    "weekdays" INTEGER[],
    "availableFrom" TEXT NOT NULL,
    "availableTo" TEXT NOT NULL,
    "instantBook" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "host_spots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spot_bookings" (
    "id" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "SpotBookingStatus" NOT NULL DEFAULT 'pending',
    "hostRating" INTEGER,
    "driverRating" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spot_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rides_status_departAt_idx" ON "rides"("status", "departAt");

-- CreateIndex
CREATE INDEX "rides_driverId_departAt_idx" ON "rides"("driverId", "departAt");

-- CreateIndex
CREATE INDEX "ride_bookings_rideId_status_idx" ON "ride_bookings"("rideId", "status");

-- CreateIndex
CREATE INDEX "ride_bookings_passengerId_createdAt_idx" ON "ride_bookings"("passengerId", "createdAt");

-- CreateIndex
CREATE INDEX "host_spots_active_city_idx" ON "host_spots"("active", "city");

-- CreateIndex
CREATE INDEX "host_spots_hostId_idx" ON "host_spots"("hostId");

-- CreateIndex
CREATE INDEX "spot_bookings_spotId_startTime_endTime_idx" ON "spot_bookings"("spotId", "startTime", "endTime");

-- CreateIndex
CREATE INDEX "spot_bookings_driverId_startTime_idx" ON "spot_bookings"("driverId", "startTime");

-- CreateIndex
CREATE INDEX "spot_bookings_status_endTime_idx" ON "spot_bookings"("status", "endTime");

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_bookings" ADD CONSTRAINT "ride_bookings_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ride_bookings" ADD CONSTRAINT "ride_bookings_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_spots" ADD CONSTRAINT "host_spots_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_bookings" ADD CONSTRAINT "spot_bookings_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "host_spots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_bookings" ADD CONSTRAINT "spot_bookings_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Guard rails mirrored from the service layer.
ALTER TABLE "rides" ADD CONSTRAINT "rides_seats_check" CHECK ("seatsTotal" BETWEEN 1 AND 8);
ALTER TABLE "rides" ADD CONSTRAINT "rides_price_check" CHECK ("pricePerSeat" >= 0);
ALTER TABLE "ride_bookings" ADD CONSTRAINT "ride_bookings_seats_check" CHECK ("seats" >= 1);
ALTER TABLE "host_spots" ADD CONSTRAINT "host_spots_rate_check" CHECK ("hourlyRate" >= 0 AND ("dailyRate" IS NULL OR "dailyRate" >= 0));
ALTER TABLE "spot_bookings" ADD CONSTRAINT "spot_bookings_time_check" CHECK ("endTime" > "startTime");
