-- Verified points are paid into the wallet as a reward transaction.
ALTER TYPE "TransactionType" ADD VALUE 'reward';

-- Map incident reports (accidents, closures, hazards…) now earn points too.
ALTER TABLE "points_ledger" ADD COLUMN "incidentReportId" TEXT;
CREATE INDEX "points_ledger_incidentReportId_idx" ON "points_ledger"("incidentReportId");
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_incidentReportId_fkey" FOREIGN KEY ("incidentReportId") REFERENCES "road_event_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
