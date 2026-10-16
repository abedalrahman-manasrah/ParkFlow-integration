-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'PARKING_OPERATOR', 'ENFORCEMENT_OFFICER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED', 'PAYMENT_PENDING', 'PAYMENT_FAILED');

-- CreateEnum
CREATE TYPE "ParkingMode" AS ENUM ('start_stop', 'prepaid');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'authorized', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('topup', 'parking_payment', 'violation_payment', 'refund', 'adjustment');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('pending', 'completed', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "CheckpointStatus" AS ENUM ('open', 'congested', 'closed');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('available', 'limited', 'full', 'unknown');

-- CreateEnum
CREATE TYPE "PointsState" AS ENUM ('pending', 'verified', 'revoked');

-- CreateEnum
CREATE TYPE "ViolationStatus" AS ENUM ('unpaid', 'paid', 'appealed', 'cancelled', 'overdue');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('submitted', 'under_review', 'approved', 'rejected', 'more_info');

-- CreateEnum
CREATE TYPE "PermitStatus" AS ENUM ('active', 'expired', 'revoked', 'pending');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "phoneVerifiedAt" TIMESTAMP(3),
    "fullName" TEXT NOT NULL DEFAULT '',
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "avatarUrl" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "notificationPreferences" JSONB NOT NULL DEFAULT '{"parkingReminders":true,"expiryWarnings":true,"lowBalance":true,"violations":true,"promotions":false}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,
    "device" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'PS',
    "type" TEXT NOT NULL DEFAULT 'private',
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "color" TEXT,
    "colorHex" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_vehicles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "nickname" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),

    CONSTRAINT "user_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_operators" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'municipality',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_users" (
    "operatorId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "operator_users_pkey" PRIMARY KEY ("operatorId","userId")
);

-- CreateTable
CREATE TABLE "parking_facilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "operatorName" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "levels" INTEGER NOT NULL,
    "hasAnpr" BOOLEAN NOT NULL DEFAULT false,
    "hasBarrier" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "parking_facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_zones" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "facilityId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL,
    "cityAr" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "kind" TEXT NOT NULL,
    "capacity" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "defaultMode" "ParkingMode" NOT NULL,
    "supportedModes" "ParkingMode"[],
    "supportedEntryMethods" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_tariffs" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hourlyRate" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "incrementMinutes" INTEGER NOT NULL,
    "freeMinutes" INTEGER NOT NULL,
    "minimumCharge" INTEGER NOT NULL,
    "dailyCap" INTEGER,
    "maxStayMinutes" INTEGER,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_operating_hours" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opensAt" TEXT NOT NULL,
    "closesAt" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "parking_operating_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "parkingZoneId" TEXT NOT NULL,
    "parkingMode" "ParkingMode" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "rateSnapshot" JSONB NOT NULL,
    "originalTariffSnapshot" JSONB NOT NULL,
    "trustDiscountSnapshot" JSONB NOT NULL,
    "pricingRulesSnapshot" JSONB NOT NULL,
    "currentCost" INTEGER NOT NULL DEFAULT 0,
    "finalCost" INTEGER,
    "subtotalMinor" INTEGER NOT NULL DEFAULT 0,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    "paymentTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_debts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "autoTopUpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoTopUpThreshold" INTEGER NOT NULL DEFAULT 500,
    "autoTopUpAmount" INTEGER NOT NULL DEFAULT 5000,
    "defaultPaymentMethodId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMethodId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "expiryMonth" INTEGER NOT NULL,
    "expiryYear" INTEGER NOT NULL,
    "holderName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "status" "TransactionStatus" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "subtitle" TEXT,
    "subtitleAr" TEXT,
    "paymentMethodId" TEXT,
    "parkingSessionId" TEXT,
    "violationId" TEXT,
    "reference" TEXT NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "provider" TEXT NOT NULL,
    "providerId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'pending',
    "ledgerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_webhooks" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violations" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ViolationStatus" NOT NULL DEFAULT 'unpaid',
    "amount" INTEGER NOT NULL,
    "parkingZoneId" TEXT,
    "locationName" TEXT NOT NULL,
    "locationNameAr" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "reasonAr" TEXT NOT NULL,
    "issuingAuthority" TEXT NOT NULL,
    "issuingAuthorityAr" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paymentTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "violations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violation_evidence" (
    "id" TEXT NOT NULL,
    "violationId" TEXT NOT NULL,
    "detectedPlate" TEXT NOT NULL,
    "detectionSource" TEXT NOT NULL,
    "firstDetectionAt" TIMESTAMP(3) NOT NULL,
    "secondDetectionAt" TIMESTAMP(3),
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "deviceId" TEXT,
    "officerId" TEXT,

    CONSTRAINT "violation_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidencePhoto" (
    "evidenceId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'vehicle',

    CONSTRAINT "EvidencePhoto_pkey" PRIMARY KEY ("evidenceId","uploadId")
);

-- CreateTable
CREATE TABLE "violation_appeals" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "violationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'submitted',
    "decisionNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "violation_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeal_attachments" (
    "appealId" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,

    CONSTRAINT "appeal_attachments_pkey" PRIMARY KEY ("appealId","uploadId")
);

-- CreateTable
CREATE TABLE "permits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "status" "PermitStatus" NOT NULL DEFAULT 'pending',
    "issuer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermitZone" (
    "permitId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,

    CONSTRAINT "PermitZone_pkey" PRIMARY KEY ("permitId","zoneId")
);

-- CreateTable
CREATE TABLE "road_checkpoints" (
    "id" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "road_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "road_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "status" "CheckpointStatus" NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "road_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "availability" "Availability" NOT NULL,
    "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parking_availability_snapshots" (
    "id" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "availability" "Availability" NOT NULL,
    "availableSpaces" INTEGER,
    "occupiedSpaces" INTEGER,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parking_availability_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "state" "PointsState" NOT NULL DEFAULT 'pending',
    "placeId" TEXT NOT NULL,
    "roadReportId" TEXT,
    "parkingReportId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "points_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_profiles" (
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "tier" TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trust_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "href" TEXT,
    "parkingSessionId" TEXT,
    "violationId" TEXT,
    "vehicleId" TEXT,
    "dedupKey" TEXT,
    "readAt" TIMESTAMP(3),
    "pushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'fcm',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "userId" TEXT,
    "payload" JSONB NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_familyId_idx" ON "refresh_tokens"("userId", "familyId");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plateNumber_region_key" ON "vehicles"("plateNumber", "region");

-- CreateIndex
CREATE INDEX "user_vehicles_vehicleId_unlinkedAt_idx" ON "user_vehicles"("vehicleId", "unlinkedAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_vehicles_userId_vehicleId_key" ON "user_vehicles"("userId", "vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "parking_zones_code_key" ON "parking_zones"("code");

-- CreateIndex
CREATE INDEX "parking_zones_latitude_longitude_idx" ON "parking_zones"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "parking_tariffs_zoneId_validFrom_idx" ON "parking_tariffs"("zoneId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "parking_operating_hours_zoneId_weekday_key" ON "parking_operating_hours"("zoneId", "weekday");

-- CreateIndex
CREATE INDEX "parking_sessions_vehicleId_status_idx" ON "parking_sessions"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "parking_sessions_userId_startedAt_idx" ON "parking_sessions"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "parking_sessions_status_endsAt_idx" ON "parking_sessions"("status", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "session_debts_sessionId_key" ON "session_debts"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_key" ON "wallets"("userId");

-- CreateIndex
CREATE INDEX "payment_methods_userId_deletedAt_idx" ON "payment_methods"("userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_reference_key" ON "wallet_transactions"("reference");

-- CreateIndex
CREATE INDEX "wallet_transactions_walletId_createdAt_idx" ON "wallet_transactions"("walletId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_providerId_key" ON "payments"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "payments"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "payments_ledgerId_key" ON "payments"("ledgerId");

-- CreateIndex
CREATE UNIQUE INDEX "violations_reference_key" ON "violations"("reference");

-- CreateIndex
CREATE INDEX "violations_vehicleId_status_idx" ON "violations"("vehicleId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "violation_evidence_violationId_key" ON "violation_evidence"("violationId");

-- CreateIndex
CREATE UNIQUE INDEX "violation_appeals_reference_key" ON "violation_appeals"("reference");

-- CreateIndex
CREATE INDEX "violation_appeals_violationId_status_idx" ON "violation_appeals"("violationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uploads_objectKey_key" ON "uploads"("objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "permits_reference_key" ON "permits"("reference");

-- CreateIndex
CREATE INDEX "permits_vehicleId_status_idx" ON "permits"("vehicleId", "status");

-- CreateIndex
CREATE INDEX "road_reports_checkpointId_reportedAt_idx" ON "road_reports"("checkpointId", "reportedAt");

-- CreateIndex
CREATE INDEX "road_reports_userId_reportedAt_idx" ON "road_reports"("userId", "reportedAt");

-- CreateIndex
CREATE INDEX "parking_reports_zoneId_reportedAt_idx" ON "parking_reports"("zoneId", "reportedAt");

-- CreateIndex
CREATE INDEX "parking_availability_snapshots_zoneId_recordedAt_idx" ON "parking_availability_snapshots"("zoneId", "recordedAt");

-- CreateIndex
CREATE INDEX "points_ledger_userId_placeId_createdAt_idx" ON "points_ledger"("userId", "placeId", "createdAt");

-- CreateIndex
CREATE INDEX "points_ledger_state_createdAt_idx" ON "points_ledger"("state", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupKey_key" ON "notifications"("dedupKey");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_key" ON "device_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_userId_scope_key_key" ON "idempotency_records"("userId", "scope", "key");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_createdAt_idx" ON "audit_logs"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "outbox_events_deliveredAt_createdAt_idx" ON "outbox_events"("deliveredAt", "createdAt");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vehicles" ADD CONSTRAINT "user_vehicles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_vehicles" ADD CONSTRAINT "user_vehicles_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_users" ADD CONSTRAINT "operator_users_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "parking_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_users" ADD CONSTRAINT "operator_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_zones" ADD CONSTRAINT "parking_zones_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "parking_operators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_zones" ADD CONSTRAINT "parking_zones_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "parking_facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_tariffs" ADD CONSTRAINT "parking_tariffs_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_operating_hours" ADD CONSTRAINT "parking_operating_hours_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_parkingZoneId_fkey" FOREIGN KEY ("parkingZoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_debts" ADD CONSTRAINT "session_debts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "parking_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_defaultPaymentMethodId_fkey" FOREIGN KEY ("defaultPaymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_parkingSessionId_fkey" FOREIGN KEY ("parkingSessionId") REFERENCES "parking_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "violations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violations" ADD CONSTRAINT "violations_parkingZoneId_fkey" FOREIGN KEY ("parkingZoneId") REFERENCES "parking_zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_evidence" ADD CONSTRAINT "violation_evidence_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "violations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidencePhoto" ADD CONSTRAINT "EvidencePhoto_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "violation_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidencePhoto" ADD CONSTRAINT "EvidencePhoto_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_appeals" ADD CONSTRAINT "violation_appeals_violationId_fkey" FOREIGN KEY ("violationId") REFERENCES "violations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "violation_appeals" ADD CONSTRAINT "violation_appeals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal_attachments" ADD CONSTRAINT "appeal_attachments_appealId_fkey" FOREIGN KEY ("appealId") REFERENCES "violation_appeals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeal_attachments" ADD CONSTRAINT "appeal_attachments_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permits" ADD CONSTRAINT "permits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permits" ADD CONSTRAINT "permits_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermitZone" ADD CONSTRAINT "PermitZone_permitId_fkey" FOREIGN KEY ("permitId") REFERENCES "permits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermitZone" ADD CONSTRAINT "PermitZone_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_reports" ADD CONSTRAINT "road_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "road_reports" ADD CONSTRAINT "road_reports_checkpointId_fkey" FOREIGN KEY ("checkpointId") REFERENCES "road_checkpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_reports" ADD CONSTRAINT "parking_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_reports" ADD CONSTRAINT "parking_reports_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parking_availability_snapshots" ADD CONSTRAINT "parking_availability_snapshots_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "parking_zones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_roadReportId_fkey" FOREIGN KEY ("roadReportId") REFERENCES "road_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_ledger" ADD CONSTRAINT "points_ledger_parkingReportId_fkey" FOREIGN KEY ("parkingReportId") REFERENCES "parking_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_profiles" ADD CONSTRAINT "trust_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level invariants survive application bugs and concurrent requests.
CREATE UNIQUE INDEX "one_active_session_per_vehicle" ON "parking_sessions" ("vehicleId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "one_default_vehicle_per_user" ON "user_vehicles" ("userId") WHERE "isDefault" AND "unlinkedAt" IS NULL;
ALTER TABLE "wallets" ADD CONSTRAINT "nonnegative_balance" CHECK ("balance" >= 0);
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "nonnegative_balance_after" CHECK ("balanceAfter" >= 0);
ALTER TABLE "parking_tariffs" ADD CONSTRAINT "valid_tariff" CHECK ("hourlyRate" >= 0 AND "incrementMinutes" > 0 AND "freeMinutes" >= 0 AND "minimumCharge" >= 0 AND ("dailyCap" IS NULL OR "dailyCap" >= 0));
ALTER TABLE "parking_sessions" ADD CONSTRAINT "nonnegative_cost" CHECK ("currentCost" >= 0 AND ("finalCost" IS NULL OR "finalCost" >= 0));
ALTER TABLE "payments" ADD CONSTRAINT "positive_payment" CHECK ("amount" > 0);
CREATE FUNCTION forbid_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Financial ledger entries are immutable; post a compensating transaction'; END $$;
CREATE TRIGGER immutable_wallet_ledger BEFORE UPDATE OR DELETE ON wallet_transactions FOR EACH ROW EXECUTE FUNCTION forbid_ledger_mutation();
