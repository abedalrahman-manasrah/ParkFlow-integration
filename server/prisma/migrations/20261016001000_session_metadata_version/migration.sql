-- Defaults cannot establish the authentication mode of pre-migration sessions.
-- Only newly issued/rotated sessions carry verified metadata; legacy access and
-- refresh credentials remain valid, while private push waits for that refresh.
ALTER TABLE "refresh_tokens" ADD COLUMN "metadataVersion" INTEGER NOT NULL DEFAULT 0;
