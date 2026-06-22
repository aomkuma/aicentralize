/*
  Warnings:

  - Made the column `assigneeId` on table `ActionItem` required. This step will fail if there are existing NULL values in that column.
  - Made the column `dueDate` on table `ActionItem` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "ActionItem" DROP CONSTRAINT "ActionItem_assigneeId_fkey";

-- AlterTable
ALTER TABLE "ActionItem" ALTER COLUMN "assigneeId" SET NOT NULL,
ALTER COLUMN "dueDate" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "ActionItem" ADD CONSTRAINT "ActionItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
