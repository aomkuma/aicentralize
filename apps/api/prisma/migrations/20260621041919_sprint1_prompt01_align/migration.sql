-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "MeetingAttendanceStatus" AS ENUM ('INVITED', 'ATTENDED', 'ABSENT', 'LATE');

-- CreateEnum
CREATE TYPE "MeetingArtifactSourceType" AS ENUM ('VOICE_CAPTURE', 'MANUAL_PASTE', 'FILE_UPLOAD', 'IMPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "MinuteDraftGeneratedBy" AS ENUM ('AI', 'USER', 'HYBRID');

-- CreateEnum
CREATE TYPE "ActionItemPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterEnum
ALTER TYPE "ActionItemSource" ADD VALUE 'AI_EXTRACTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActionStatus" ADD VALUE 'OPEN';
ALTER TYPE "ActionStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MeetingArtifactType" ADD VALUE 'AUDIO';
ALTER TYPE "MeetingArtifactType" ADD VALUE 'FILE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MinuteDraftStatus" ADD VALUE 'READY_FOR_REVIEW';
ALTER TYPE "MinuteDraftStatus" ADD VALUE 'REJECTED';
ALTER TYPE "MinuteDraftStatus" ADD VALUE 'SUPERSEDED';

-- AlterEnum
ALTER TYPE "MinuteVersionStatus" ADD VALUE 'REVOKED';

-- DropForeignKey
ALTER TABLE "ActionItem" DROP CONSTRAINT "ActionItem_assigneeId_fkey";

-- DropForeignKey
ALTER TABLE "ActionItemStatusHistory" DROP CONSTRAINT "ActionItemStatusHistory_changedById_fkey";

-- AlterTable
ALTER TABLE "ActionItem" ADD COLUMN     "ownerDisplayName" TEXT,
ADD COLUMN     "priority" "ActionItemPriority" NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN     "sourceDraftItemRef" TEXT,
ALTER COLUMN "assigneeId" DROP NOT NULL,
ALTER COLUMN "dueDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ActionItemStatusHistory" ALTER COLUMN "changedById" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "agenda" TEXT,
ADD COLUMN     "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "MeetingArtifact" ADD COLUMN     "sourceType" "MeetingArtifactSourceType" NOT NULL DEFAULT 'OTHER';

-- AlterTable
ALTER TABLE "MeetingParticipant" ADD COLUMN     "attendanceStatus" "MeetingAttendanceStatus",
ADD COLUMN     "roleLabel" TEXT;

-- AlterTable
ALTER TABLE "MinuteDraft" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "generatedBy" "MinuteDraftGeneratedBy" NOT NULL DEFAULT 'AI',
ADD COLUMN     "generationMetaJson" JSONB,
ADD COLUMN     "keyPointsJson" JSONB,
ADD COLUMN     "openQuestionsJson" JSONB;

-- AlterTable
ALTER TABLE "MinuteVersion" ADD COLUMN     "keyPointsJson" JSONB;

-- CreateIndex
CREATE INDEX "ActionItem_assigneeId_status_dueDate_idx" ON "ActionItem"("assigneeId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Meeting_projectId_sessionAt_idx" ON "Meeting"("projectId", "sessionAt");

-- CreateIndex
CREATE INDEX "MinuteDraft_createdById_idx" ON "MinuteDraft"("createdById");

-- AddForeignKey
ALTER TABLE "MinuteDraft" ADD CONSTRAINT "MinuteDraft_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItemStatusHistory" ADD CONSTRAINT "ActionItemStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
