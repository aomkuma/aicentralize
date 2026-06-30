-- Add project scope to action items; meeting link becomes optional for project-only tasks.

ALTER TABLE "ActionItem" ADD COLUMN "projectId" TEXT;

UPDATE "ActionItem" AS ai
SET "projectId" = m."projectId"
FROM "Meeting" AS m
WHERE ai."meetingId" = m."id";

ALTER TABLE "ActionItem" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "ActionItem" ALTER COLUMN "meetingId" DROP NOT NULL;

ALTER TABLE "ActionItem"
  ADD CONSTRAINT "ActionItem_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "ActionItem_projectId_status_dueDate_idx"
  ON "ActionItem"("projectId", "status", "dueDate");
