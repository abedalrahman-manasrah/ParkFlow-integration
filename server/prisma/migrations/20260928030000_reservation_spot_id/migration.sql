ALTER TABLE "parking_reservations" ADD COLUMN "spotId" TEXT;

CREATE INDEX "parking_reservations_spotId_startTime_endTime_idx"
  ON "parking_reservations"("spotId", "startTime", "endTime");
