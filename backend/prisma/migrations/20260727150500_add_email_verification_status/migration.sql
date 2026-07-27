ALTER TABLE "lead"
ADD COLUMN "emailVerificationStatus" TEXT NOT NULL DEFAULT 'not_started'
CHECK ("emailVerificationStatus" IN ('not_started', 'pending', 'verified', 'not_verified', 'failed'));

UPDATE "lead"
SET "emailVerificationStatus" = CASE
  WHEN "emailVerified" = 1 THEN 'verified'
  WHEN "emailVerified" = 0 THEN 'not_verified'
  ELSE 'not_started'
END;

ALTER TABLE "lead" ADD COLUMN "emailVerificationRunId" TEXT;
