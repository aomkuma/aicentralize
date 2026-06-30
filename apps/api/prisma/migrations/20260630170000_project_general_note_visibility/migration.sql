-- CreateEnum
CREATE TYPE "ProjectGeneralNoteVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterTable
ALTER TABLE "ProjectGeneralNote" ADD COLUMN "visibility" "ProjectGeneralNoteVisibility" NOT NULL DEFAULT 'PUBLIC';

-- CreateIndex
CREATE INDEX "ProjectGeneralNote_projectId_visibility_createdAt_idx" ON "ProjectGeneralNote"("projectId", "visibility", "createdAt");
