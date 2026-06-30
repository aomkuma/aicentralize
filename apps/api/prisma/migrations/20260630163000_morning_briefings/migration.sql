-- CreateEnum
ALTER TYPE "AiRunOperation" ADD VALUE 'MORNING_BRIEFING';

-- CreateEnum
ALTER TYPE "CommunicationSentimentSourceType" ADD VALUE 'MORNING_BRIEFING_ACK';

-- CreateEnum
CREATE TYPE "MorningBriefingStatus" AS ENUM ('GENERATED', 'FAILED');

-- CreateEnum
CREATE TYPE "MorningBriefingAckMood" AS ENUM ('GOT_IT', 'I_KNOW', 'RUDENESS');

-- CreateTable
CREATE TABLE "MorningBriefing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "briefingDate" TIMESTAMP(3) NOT NULL,
    "status" "MorningBriefingStatus" NOT NULL DEFAULT 'GENERATED',
    "roleScope" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sectionsJson" JSONB NOT NULL,
    "evidenceJson" JSONB NOT NULL,
    "actionItemIdsJson" JSONB NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MorningBriefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MorningBriefingAcknowledgement" (
    "id" TEXT NOT NULL,
    "briefingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mood" "MorningBriefingAckMood" NOT NULL,
    "score" INTEGER NOT NULL,
    "reviewAgain" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MorningBriefingAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MorningBriefing_tenantId_userId_briefingDate_key" ON "MorningBriefing"("tenantId", "userId", "briefingDate");

-- CreateIndex
CREATE INDEX "MorningBriefing_userId_generatedAt_idx" ON "MorningBriefing"("userId", "generatedAt");

-- CreateIndex
CREATE INDEX "MorningBriefing_tenantId_generatedAt_idx" ON "MorningBriefing"("tenantId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MorningBriefingAcknowledgement_briefingId_userId_key" ON "MorningBriefingAcknowledgement"("briefingId", "userId");

-- CreateIndex
CREATE INDEX "MorningBriefingAcknowledgement_userId_createdAt_idx" ON "MorningBriefingAcknowledgement"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "MorningBriefingAcknowledgement_score_createdAt_idx" ON "MorningBriefingAcknowledgement"("score", "createdAt");

-- AddForeignKey
ALTER TABLE "MorningBriefing" ADD CONSTRAINT "MorningBriefing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MorningBriefing" ADD CONSTRAINT "MorningBriefing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MorningBriefingAcknowledgement" ADD CONSTRAINT "MorningBriefingAcknowledgement_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "MorningBriefing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MorningBriefingAcknowledgement" ADD CONSTRAINT "MorningBriefingAcknowledgement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
