-- CreateEnum
CREATE TYPE "ReminderLogType" AS ENUM ('DUE_SOON', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ReminderDeliveryStatus" AS ENUM ('SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "actionItemId" TEXT NOT NULL,
    "reminderType" "ReminderLogType" NOT NULL,
    "sentToUserId" TEXT,
    "sentToDisplayName" TEXT,
    "message" TEXT NOT NULL,
    "deliveryStatus" "ReminderDeliveryStatus" NOT NULL,
    "channelMetaJson" JSONB,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReminderLog_actionItemId_reminderType_sentAt_idx" ON "ReminderLog"("actionItemId", "reminderType", "sentAt");

-- CreateIndex
CREATE INDEX "ReminderLog_sentToUserId_sentAt_idx" ON "ReminderLog"("sentToUserId", "sentAt");

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_sentToUserId_fkey" FOREIGN KEY ("sentToUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
