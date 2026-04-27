-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('PENDING', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- AlterTable: add callsUsed to Subscription
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "callsUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: Mentor
CREATE TABLE IF NOT EXISTS "Mentor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "calendlyUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Mentor_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Consultation
CREATE TABLE IF NOT EXISTS "Consultation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mentorId" TEXT NOT NULL,
    "calendlyEventId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "status" "ConsultationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Consultation_userId_createdAt_idx" ON "Consultation"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_mentorId_fkey"
    FOREIGN KEY ("mentorId") REFERENCES "Mentor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
