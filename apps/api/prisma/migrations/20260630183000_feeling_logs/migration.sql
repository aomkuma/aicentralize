-- CreateEnum
CREATE TYPE "FeelingLogAnalysisAudience" AS ENUM ('PERSONAL', 'LEADERSHIP', 'MENTION_TARGET');

-- AlterEnum
ALTER TYPE "AiRunOperation" ADD VALUE 'FEELING_LOG_ANALYSIS';

-- CreateTable
CREATE TABLE "FeelingLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "emoji" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeelingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeelingLogMention" (
    "id" TEXT NOT NULL,
    "feelingLogId" TEXT NOT NULL,
    "mentionedUserId" TEXT NOT NULL,
    "mentionLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeelingLogMention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeelingLogAnalysis" (
    "id" TEXT NOT NULL,
    "feelingLogId" TEXT NOT NULL,
    "audience" "FeelingLogAnalysisAudience" NOT NULL,
    "targetUserId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "interpretation" TEXT NOT NULL,
    "recommendation" TEXT,
    "riskLevel" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeelingLogAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeelingLog_tenantId_createdAt_idx" ON "FeelingLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "FeelingLog_authorId_createdAt_idx" ON "FeelingLog"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "FeelingLogMention_feelingLogId_idx" ON "FeelingLogMention"("feelingLogId");

-- CreateIndex
CREATE INDEX "FeelingLogMention_mentionedUserId_createdAt_idx" ON "FeelingLogMention"("mentionedUserId", "createdAt");

-- CreateIndex
CREATE INDEX "FeelingLogAnalysis_feelingLogId_audience_createdAt_idx" ON "FeelingLogAnalysis"("feelingLogId", "audience", "createdAt");

-- CreateIndex
CREATE INDEX "FeelingLogAnalysis_targetUserId_createdAt_idx" ON "FeelingLogAnalysis"("targetUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "FeelingLog" ADD CONSTRAINT "FeelingLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeelingLog" ADD CONSTRAINT "FeelingLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeelingLogMention" ADD CONSTRAINT "FeelingLogMention_feelingLogId_fkey" FOREIGN KEY ("feelingLogId") REFERENCES "FeelingLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeelingLogMention" ADD CONSTRAINT "FeelingLogMention_mentionedUserId_fkey" FOREIGN KEY ("mentionedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeelingLogAnalysis" ADD CONSTRAINT "FeelingLogAnalysis_feelingLogId_fkey" FOREIGN KEY ("feelingLogId") REFERENCES "FeelingLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeelingLogAnalysis" ADD CONSTRAINT "FeelingLogAnalysis_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
