-- CreateEnum
CREATE TYPE "AiRunOperation" AS ENUM ('MINUTE_EXTRACTION', 'RETRIEVAL_QUERY', 'ASK_AI_ANSWER', 'REMINDER_RUN');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "AiRunLog" (
    "id" TEXT NOT NULL,
    "operation" "AiRunOperation" NOT NULL,
    "status" "AiRunStatus" NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "meetingId" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "durationMs" INTEGER,
    "retrievedIdsJson" JSONB,
    "traceJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRunLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRunLog_operation_createdAt_idx" ON "AiRunLog"("operation", "createdAt");

-- CreateIndex
CREATE INDEX "AiRunLog_projectId_createdAt_idx" ON "AiRunLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRunLog_meetingId_createdAt_idx" ON "AiRunLog"("meetingId", "createdAt");

-- AddForeignKey
ALTER TABLE "AiRunLog" ADD CONSTRAINT "AiRunLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunLog" ADD CONSTRAINT "AiRunLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiRunLog" ADD CONSTRAINT "AiRunLog_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
