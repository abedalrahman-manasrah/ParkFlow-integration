-- Possible crashes detected on a driver's phone and the outcome of the emergency countdown.
CREATE TYPE "CrashEventOutcome" AS ENUM ('cancelled', 'called', 'call_failed', 'no_number');

CREATE TABLE "crash_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "speedKmh" DOUBLE PRECISION,
    "peakG" DOUBLE PRECISION NOT NULL,
    "rotationDeg" DOUBLE PRECISION,
    "outcome" "CrashEventOutcome" NOT NULL,
    "calledNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crash_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crash_events_userId_detectedAt_idx" ON "crash_events"("userId", "detectedAt");
ALTER TABLE "crash_events" ADD CONSTRAINT "crash_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
