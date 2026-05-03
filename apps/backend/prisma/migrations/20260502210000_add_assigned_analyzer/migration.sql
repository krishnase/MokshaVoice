ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "assignedAnalyzerId" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_assignedAnalyzerId_fkey"
  FOREIGN KEY ("assignedAnalyzerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "User_assignedAnalyzerId_idx" ON "User"("assignedAnalyzerId");
