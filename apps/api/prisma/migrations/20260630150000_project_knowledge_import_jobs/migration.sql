-- CreateEnum
CREATE TYPE "KnowledgeImportJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "KnowledgeImportJobKind" AS ENUM ('IMPORT', 'EXTRACT');

-- CreateTable
CREATE TABLE "ProjectKnowledgeImportJob" (
    "id" TEXT NOT NULL,
    "kind" "KnowledgeImportJobKind" NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceId" TEXT,
    "status" "KnowledgeImportJobStatus" NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'queued',
    "detail" TEXT,
    "currentChunk" INTEGER,
    "totalChunks" INTEGER,
    "successfulChunks" INTEGER,
    "error" TEXT,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectKnowledgeImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectKnowledgeImportJob_userId_createdAt_idx" ON "ProjectKnowledgeImportJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectKnowledgeImportJob_projectId_createdAt_idx" ON "ProjectKnowledgeImportJob"("projectId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProjectKnowledgeImportJob" ADD CONSTRAINT "ProjectKnowledgeImportJob_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectKnowledgeImportJob" ADD CONSTRAINT "ProjectKnowledgeImportJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
