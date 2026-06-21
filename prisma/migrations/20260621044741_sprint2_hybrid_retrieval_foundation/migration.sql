CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "KnowledgeChunkSourceType" AS ENUM ('MINUTE_SUMMARY', 'KEY_POINT', 'DECISION', 'ACTION_ITEM', 'MEETING_METADATA');

-- CreateTable
CREATE TABLE "MeetingKnowledgeChunk" (
    "id" TEXT NOT NULL,
    "chunkKey" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "minuteVersionId" TEXT NOT NULL,
    "sourceType" "KnowledgeChunkSourceType" NOT NULL,
    "sourceRowId" TEXT,
    "textContent" TEXT NOT NULL,
    "metadataJson" JSONB,
    "embeddingJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingKnowledgeChunk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetingKnowledgeChunk_chunkKey_key" ON "MeetingKnowledgeChunk"("chunkKey");

-- CreateIndex
CREATE INDEX "MeetingKnowledgeChunk_projectId_sourceType_idx" ON "MeetingKnowledgeChunk"("projectId", "sourceType");

-- CreateIndex
CREATE INDEX "MeetingKnowledgeChunk_meetingId_sourceType_idx" ON "MeetingKnowledgeChunk"("meetingId", "sourceType");

-- CreateIndex
CREATE INDEX "MeetingKnowledgeChunk_minuteVersionId_idx" ON "MeetingKnowledgeChunk"("minuteVersionId");

-- CreateIndex
CREATE INDEX "MeetingKnowledgeChunk_sourceRowId_idx" ON "MeetingKnowledgeChunk"("sourceRowId");

-- CreateIndex
CREATE INDEX "MeetingKnowledgeChunk_textContent_trgm_idx"
ON "MeetingKnowledgeChunk"
USING GIN ("textContent" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "MeetingKnowledgeChunk_textContent_tsv_idx"
ON "MeetingKnowledgeChunk"
USING GIN (to_tsvector('simple', "textContent"));

-- AddForeignKey
ALTER TABLE "MeetingKnowledgeChunk" ADD CONSTRAINT "MeetingKnowledgeChunk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingKnowledgeChunk" ADD CONSTRAINT "MeetingKnowledgeChunk_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingKnowledgeChunk" ADD CONSTRAINT "MeetingKnowledgeChunk_minuteVersionId_fkey" FOREIGN KEY ("minuteVersionId") REFERENCES "MinuteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
