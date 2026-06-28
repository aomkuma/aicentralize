ALTER TABLE "UserInvitation" ADD COLUMN "emailLastAttemptAt" TIMESTAMP(3);
ALTER TABLE "UserInvitation" ADD COLUMN "emailSentAt" TIMESTAMP(3);
ALTER TABLE "UserInvitation" ADD COLUMN "emailLastError" TEXT;
