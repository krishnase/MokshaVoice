-- Add ANALYZER to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ANALYZER';

-- Add new SessionStatus values (must be outside transaction in PG)
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'ANALYZER_REVIEW';
ALTER TYPE "SessionStatus" ADD VALUE IF NOT EXISTS 'PENDING_DECODER';

-- Add analyzer columns to Session
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "analyzerId" TEXT;
ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "analyzedAt" TIMESTAMP(3);

-- Foreign key: Session.analyzerId → User.id
ALTER TABLE "Session" ADD CONSTRAINT "Session_analyzerId_fkey"
  FOREIGN KEY ("analyzerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Index for analyzer queue lookups
CREATE INDEX IF NOT EXISTS "Session_analyzerId_idx" ON "Session"("analyzerId");
