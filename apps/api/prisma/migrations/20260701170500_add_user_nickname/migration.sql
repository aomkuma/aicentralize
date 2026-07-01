-- Add optional nickname fields for user/member listing and invitations.
ALTER TABLE "User"
ADD COLUMN "nickname" TEXT;

ALTER TABLE "UserInvitation"
ADD COLUMN "nickname" TEXT;
