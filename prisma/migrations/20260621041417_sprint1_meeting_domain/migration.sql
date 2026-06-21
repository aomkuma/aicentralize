-- CreateEnum
CREATE TYPE "MeetingParticipantRole" AS ENUM ('ORGANIZER', 'ATTENDEE', 'OBSERVER');

-- CreateEnum
CREATE TYPE "MeetingArtifactType" AS ENUM ('TRANSCRIPT', 'RAW_NOTE', 'AUDIO_FILE', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "MinuteDraftStatus" AS ENUM ('DRAFT', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MinuteVersionStatus" AS ENUM ('APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActionItemSource" AS ENUM ('MANUAL', 'AI_DRAFT', 'APPROVED_MINUTE');

-- AlterTable
ALTER TABLE "ActionItem" ADD COLUMN     "minuteDraftId" TEXT,
ADD COLUMN     "minuteVersionId" TEXT,
ADD COLUMN     "source" "ActionItemSource" NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT,
    "email" TEXT,
    "role" "MeetingParticipantRole" NOT NULL DEFAULT 'ATTENDEE',
    "attended" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingArtifact" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "type" "MeetingArtifactType" NOT NULL,
    "title" TEXT,
    "contentText" TEXT,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "sourceRef" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinuteDraft" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "sourceArtifactId" TEXT,
    "status" "MinuteDraftStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT,
    "decisionsJson" JSONB,
    "actionItemsJson" JSONB,
    "risksJson" JSONB,
    "rawModelOutputJson" JSONB,
    "parseErrorsJson" JSONB,
    "llmModel" TEXT,
    "extractionRunId" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MinuteDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MinuteVersion" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "draftId" TEXT,
    "versionNo" INTEGER NOT NULL,
    "status" "MinuteVersionStatus" NOT NULL DEFAULT 'APPROVED',
    "summary" TEXT NOT NULL,
    "decisionsJson" JSONB,
    "actionItemsJson" JSONB,
    "risksJson" JSONB,
    "snapshotJson" JSONB NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MinuteVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "minuteVersionId" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "ownerId" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "DecisionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionItemStatusHistory" (
    "id" TEXT NOT NULL,
    "actionItemId" TEXT NOT NULL,
    "fromStatus" "ActionStatus",
    "toStatus" "ActionStatus" NOT NULL,
    "changedById" TEXT NOT NULL,
    "note" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionItemStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingParticipant_meetingId_role_idx" ON "MeetingParticipant"("meetingId", "role");

-- CreateIndex
CREATE INDEX "MeetingParticipant_userId_idx" ON "MeetingParticipant"("userId");

-- CreateIndex
CREATE INDEX "MeetingArtifact_meetingId_type_idx" ON "MeetingArtifact"("meetingId", "type");

-- CreateIndex
CREATE INDEX "MeetingArtifact_createdById_idx" ON "MeetingArtifact"("createdById");

-- CreateIndex
CREATE INDEX "MinuteDraft_meetingId_status_idx" ON "MinuteDraft"("meetingId", "status");

-- CreateIndex
CREATE INDEX "MinuteDraft_generatedAt_idx" ON "MinuteDraft"("generatedAt");

-- CreateIndex
CREATE INDEX "MinuteVersion_meetingId_approvedAt_idx" ON "MinuteVersion"("meetingId", "approvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MinuteVersion_meetingId_versionNo_key" ON "MinuteVersion"("meetingId", "versionNo");

-- CreateIndex
CREATE INDEX "Decision_meetingId_status_idx" ON "Decision"("meetingId", "status");

-- CreateIndex
CREATE INDEX "Decision_ownerId_idx" ON "Decision"("ownerId");

-- CreateIndex
CREATE INDEX "Decision_dueDate_idx" ON "Decision"("dueDate");

-- CreateIndex
CREATE INDEX "ActionItemStatusHistory_actionItemId_changedAt_idx" ON "ActionItemStatusHistory"("actionItemId", "changedAt");

-- CreateIndex
CREATE INDEX "ActionItemStatusHistory_changedById_idx" ON "ActionItemStatusHistory"("changedById");

-- CreateIndex
CREATE INDEX "ActionItem_meetingId_status_dueDate_idx" ON "ActionItem"("meetingId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "ActionItem_assigneeId_status_idx" ON "ActionItem"("assigneeId", "status");

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingArtifact" ADD CONSTRAINT "MeetingArtifact_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingArtifact" ADD CONSTRAINT "MeetingArtifact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinuteDraft" ADD CONSTRAINT "MinuteDraft_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinuteDraft" ADD CONSTRAINT "MinuteDraft_sourceArtifactId_fkey" FOREIGN KEY ("sourceArtifactId") REFERENCES "MeetingArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinuteVersion" ADD CONSTRAINT "MinuteVersion_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinuteVersion" ADD CONSTRAINT "MinuteVersion_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "MinuteDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MinuteVersion" ADD CONSTRAINT "MinuteVersion_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_minuteVersionId_fkey" FOREIGN KEY ("minuteVersionId") REFERENCES "MinuteVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_minuteDraftId_fkey" FOREIGN KEY ("minuteDraftId") REFERENCES "MinuteDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_minuteVersionId_fkey" FOREIGN KEY ("minuteVersionId") REFERENCES "MinuteVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItemStatusHistory" ADD CONSTRAINT "ActionItemStatusHistory_actionItemId_fkey" FOREIGN KEY ("actionItemId") REFERENCES "ActionItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionItemStatusHistory" ADD CONSTRAINT "ActionItemStatusHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
