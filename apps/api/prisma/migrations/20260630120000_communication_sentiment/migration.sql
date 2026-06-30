-- CreateEnum
CREATE TYPE "SentimentProcessingStatus" AS ENUM ('PENDING', 'PROCESSED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "CommunicationSentimentSourceType" AS ENUM ('ASK_AI_QUERY', 'MEETING_TRANSCRIPT', 'COMMENT');

-- CreateEnum
CREATE TYPE "CommunicationMoodState" AS ENUM ('CALM', 'NEEDS_ATTENTION', 'HIGH_PRESSURE', 'INSUFFICIENT_DATA');

-- AlterTable
ALTER TABLE "AskAiQueryLog" ADD COLUMN "sentimentProcessedAt" TIMESTAMP(3),
ADD COLUMN "sentimentBatchId" TEXT,
ADD COLUMN "sentimentWindowStart" TIMESTAMP(3),
ADD COLUMN "sentimentWindowEnd" TIMESTAMP(3),
ADD COLUMN "sentimentProcessingStatus" "SentimentProcessingStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "AskAiQueryLog_sentimentProcessingStatus_createdAt_idx" ON "AskAiQueryLog"("sentimentProcessingStatus", "createdAt");

-- CreateTable
CREATE TABLE "CommunicationSentimentSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "memberUserId" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "moodScore" INTEGER NOT NULL,
    "stressScore" INTEGER NOT NULL,
    "frictionScore" INTEGER NOT NULL,
    "urgencyScore" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "themesJson" JSONB NOT NULL,
    "signalsJson" JSONB NOT NULL,
    "caveatsJson" JSONB NOT NULL,
    "suggestionsJson" JSONB NOT NULL,
    "moodState" "CommunicationMoodState" NOT NULL,
    "batchId" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationSentimentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationSentimentSource" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceType" "CommunicationSentimentSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "messageCreatedAt" TIMESTAMP(3) NOT NULL,
    "includedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationSentimentSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommunicationSentimentSnapshot_tenantId_createdAt_idx" ON "CommunicationSentimentSnapshot"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationSentimentSnapshot_tenantId_memberUserId_createdAt_idx" ON "CommunicationSentimentSnapshot"("tenantId", "memberUserId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationSentimentSnapshot_batchId_idx" ON "CommunicationSentimentSnapshot"("batchId");

-- CreateIndex
CREATE INDEX "CommunicationSentimentSource_snapshotId_idx" ON "CommunicationSentimentSource"("snapshotId");

-- CreateIndex
CREATE INDEX "CommunicationSentimentSource_sourceType_sourceId_idx" ON "CommunicationSentimentSource"("sourceType", "sourceId");

-- AddForeignKey
ALTER TABLE "CommunicationSentimentSnapshot" ADD CONSTRAINT "CommunicationSentimentSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationSentimentSnapshot" ADD CONSTRAINT "CommunicationSentimentSnapshot_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationSentimentSource" ADD CONSTRAINT "CommunicationSentimentSource_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "CommunicationSentimentSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
