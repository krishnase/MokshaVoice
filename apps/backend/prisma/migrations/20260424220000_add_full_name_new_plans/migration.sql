-- Add new Plan enum values
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'STARTER';
ALTER TYPE "Plan" ADD VALUE IF NOT EXISTS 'GROWTH';

-- Add fullName column to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "fullName" TEXT;
