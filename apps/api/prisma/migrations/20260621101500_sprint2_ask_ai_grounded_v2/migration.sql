-- CreateTable
CREATE TABLE "AskAiQueryLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "meetingId" TEXT,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "model" TEXT,
    "retrievedEvidenceIds" JSONB NOT NULL,
    "usedEvidenceJson" JSONB NOT NULL,
    "retrievalDebugJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AskAiQueryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AskAiQueryLog_userId_createdAt_idx" ON "AskAiQueryLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AskAiQueryLog_projectId_createdAt_idx" ON "AskAiQueryLog"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "AskAiQueryLog_meetingId_createdAt_idx" ON "AskAiQueryLog"("meetingId", "createdAt");

-- AddForeignKey
ALTER TABLE "AskAiQueryLog" ADD CONSTRAINT "AskAiQueryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskAiQueryLog" ADD CONSTRAINT "AskAiQueryLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskAiQueryLog" ADD CONSTRAINT "AskAiQueryLog_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE SET NULL ON UPDATE CASCADE;
