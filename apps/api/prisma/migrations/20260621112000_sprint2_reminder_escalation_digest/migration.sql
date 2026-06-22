-- AlterEnum
ALTER TYPE "ReminderLogType" ADD VALUE IF NOT EXISTS 'OVERDUE_SHORT';
ALTER TYPE "ReminderLogType" ADD VALUE IF NOT EXISTS 'OVERDUE_ESCALATE';

-- CreateTable
CREATE TABLE "ReminderDigest" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "totalOpen" INTEGER NOT NULL,
    "totalDueSoon" INTEGER NOT NULL,
    "totalOverdue" INTEGER NOT NULL,
    "totalEscalated" INTEGER NOT NULL,
    "overdueByOwnerJson" JSONB,
    "itemsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderDigest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReminderDigest_projectId_createdAt_idx" ON "ReminderDigest"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ReminderDigest_createdAt_idx" ON "ReminderDigest"("createdAt");

-- AddForeignKey
ALTER TABLE "ReminderDigest" ADD CONSTRAINT "ReminderDigest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
