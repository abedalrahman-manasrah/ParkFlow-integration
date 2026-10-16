CREATE TYPE "RoadReportType" AS ENUM ('accident', 'traffic_congestion', 'closed_road', 'checkpoint', 'road_hazard', 'construction', 'police', 'other');
CREATE TYPE "RoadDirection" AS ENUM ('northbound', 'southbound', 'eastbound', 'westbound', 'both');
CREATE TYPE "RoadReportSeverity" AS ENUM ('low', 'moderate', 'high', 'critical');
CREATE TYPE "RoadReportStatus" AS ENUM ('unverified', 'confirmed', 'disputed', 'resolved', 'expired');
CREATE TYPE "RoadReportVoteType" AS ENUM ('still_there', 'not_there');

CREATE TABLE "road_event_reports" (
    "id" TEXT NOT NULL,
    "reporterUserId" TEXT NOT NULL,
    "type" "RoadReportType" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "direction" "RoadDirection",
    "severity" "RoadReportSeverity",
    "description" TEXT,
    "status" "RoadReportStatus" NOT NULL DEFAULT 'unverified',
    "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    "confirmationCount" INTEGER NOT NULL DEFAULT 0,
    "rejectionCount" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "road_event_reports_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "road_event_reports_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "road_event_reports_latitude_check" CHECK ("latitude" >= -90 AND "latitude" <= 90),
    CONSTRAINT "road_event_reports_longitude_check" CHECK ("longitude" >= -180 AND "longitude" <= 180),
    CONSTRAINT "road_event_reports_description_check" CHECK ("description" IS NULL OR char_length("description") <= 280),
    CONSTRAINT "road_event_reports_counts_check" CHECK ("confirmationCount" >= 0 AND "rejectionCount" >= 0),
    CONSTRAINT "road_event_reports_confidence_check" CHECK ("confidenceScore" >= 0 AND "confidenceScore" <= 1)
);

CREATE TABLE "road_report_votes" (
    "id" TEXT NOT NULL,
    "roadReportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vote" "RoadReportVoteType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "road_report_votes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "road_report_votes_roadReportId_fkey" FOREIGN KEY ("roadReportId") REFERENCES "road_event_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "road_report_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "road_event_reports_status_expiresAt_idx" ON "road_event_reports"("status", "expiresAt");
CREATE INDEX "road_event_reports_latitude_longitude_idx" ON "road_event_reports"("latitude", "longitude");
CREATE INDEX "road_event_reports_reporterUserId_createdAt_idx" ON "road_event_reports"("reporterUserId", "createdAt");
CREATE UNIQUE INDEX "road_report_votes_roadReportId_userId_key" ON "road_report_votes"("roadReportId", "userId");
CREATE INDEX "road_report_votes_userId_createdAt_idx" ON "road_report_votes"("userId", "createdAt");
