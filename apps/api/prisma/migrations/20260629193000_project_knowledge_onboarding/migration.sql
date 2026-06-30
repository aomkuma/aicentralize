-- CreateEnum
CREATE TYPE "ProjectKnowledgeSourceType" AS ENUM ('TOR', 'PROPOSAL', 'CONTRACT', 'REQUIREMENT', 'MINUTES', 'ACTION_LOG', 'RISK_LOG', 'ISSUE_LOG', 'TIMELINE', 'TECHNICAL_NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProjectKnowledgeAuthorityLevel" AS ENUM ('AUTHORITATIVE', 'SUPPORTING', 'HISTORICAL');

-- CreateEnum
CREATE TYPE "ProjectKnowledgeSourceStatus" AS ENUM ('UPLOADED', 'EXTRACTED', 'REVIEWED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectMemoryItemType" AS ENUM ('OVERVIEW', 'SCOPE', 'REQUIREMENT', 'DECISION', 'RISK', 'ISSUE', 'ACTION', 'MILESTONE', 'GLOSSARY', 'ASSUMPTION', 'OPEN_QUESTION', 'STAKEHOLDER');

-- CreateEnum
CREATE TYPE "ProjectMemoryItemStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "ProjectKnowledgeSource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "projectId" TEXT NOT NULL,
    "sourceType" "ProjectKnowledgeSourceType" NOT NULL,
    "title" TEXT NOT NULL,
    "contentText" TEXT NOT NULL,
    "documentDate" TIMESTAMP(3),
    "versionLabel" TEXT,
    "authorityLevel" "ProjectKnowledgeAuthorityLevel" NOT NULL DEFAULT 'SUPPORTING',
    "status" "ProjectKnowledgeSourceStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectKnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectKnowledgeExtraction" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "extractionJson" JSONB NOT NULL,
    "confidence" TEXT NOT NULL,
    "model" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectKnowledgeExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMemoryItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "projectId" TEXT NOT NULL,
    "sourceId" TEXT,
    "type" "ProjectMemoryItemType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ProjectMemoryItemStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveDate" TIMESTAMP(3),
    "supersededById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectMemoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectKnowledgeSource_projectId_status_idx" ON "ProjectKnowledgeSource"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectKnowledgeSource_tenantId_createdAt_idx" ON "ProjectKnowledgeSource"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectKnowledgeSource_sourceType_idx" ON "ProjectKnowledgeSource"("sourceType");

-- CreateIndex
CREATE INDEX "ProjectKnowledgeExtraction_sourceId_createdAt_idx" ON "ProjectKnowledgeExtraction"("sourceId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectMemoryItem_projectId_type_status_idx" ON "ProjectMemoryItem"("projectId", "type", "status");

-- CreateIndex
CREATE INDEX "ProjectMemoryItem_tenantId_createdAt_idx" ON "ProjectMemoryItem"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectMemoryItem_sourceId_idx" ON "ProjectMemoryItem"("sourceId");

-- CreateIndex
CREATE INDEX "ProjectMemoryItem_approvedById_idx" ON "ProjectMemoryItem"("approvedById");

-- AddForeignKey
ALTER TABLE "ProjectKnowledgeSource" ADD CONSTRAINT "ProjectKnowledgeSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectKnowledgeSource" ADD CONSTRAINT "ProjectKnowledgeSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectKnowledgeSource" ADD CONSTRAINT "ProjectKnowledgeSource_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectKnowledgeExtraction" ADD CONSTRAINT "ProjectKnowledgeExtraction_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ProjectKnowledgeSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemoryItem" ADD CONSTRAINT "ProjectMemoryItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemoryItem" ADD CONSTRAINT "ProjectMemoryItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemoryItem" ADD CONSTRAINT "ProjectMemoryItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ProjectKnowledgeSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemoryItem" ADD CONSTRAINT "ProjectMemoryItem_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemoryItem" ADD CONSTRAINT "ProjectMemoryItem_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "ProjectMemoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
