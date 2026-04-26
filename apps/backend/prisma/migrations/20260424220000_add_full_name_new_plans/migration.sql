-- Add new Plan enum values
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'STARTER';
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'GROWTH';

-- Migrate existing FREE plans to STARTER
UPDATE "Subscription" SET plan = 'STARTER' WHERE plan = 'FREE';

-- Add fullName column to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fullName" TEXT;
