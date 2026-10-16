-- Preserve phone identities and legacy profile emails. Never mark legacy emails verified.
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;
ALTER TABLE "users" ALTER COLUMN "countryCode" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
UPDATE "users" SET "email" = NULLIF(lower(trim("email")), '');
-- Duplicate legacy emails intentionally fail here: resolve ownership before migrating.
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
