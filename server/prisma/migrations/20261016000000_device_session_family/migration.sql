-- Existing registrations have no authenticated session proof and stay dormant
-- until the native app registers them again. Preserve every existing row.
ALTER TABLE "device_tokens" ADD COLUMN "sessionFamilyId" TEXT;
CREATE INDEX "device_tokens_userId_sessionFamilyId_idx" ON "device_tokens"("userId", "sessionFamilyId");

-- JWT verification continues to enforce the transport/mode of legacy sessions.
-- New sessions persist these properties so queued delivery can enforce them too.
ALTER TABLE "refresh_tokens"
  ADD COLUMN "transport" TEXT NOT NULL DEFAULT 'native',
  ADD COLUMN "developmentPhoneLogin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "developmentEmailLogin" BOOLEAN NOT NULL DEFAULT false;
