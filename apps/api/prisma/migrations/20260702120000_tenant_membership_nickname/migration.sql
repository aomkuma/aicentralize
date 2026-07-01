-- Nickname is tenant-scoped (same email can have different nicknames per organization).
ALTER TABLE "TenantMembership" ADD COLUMN "nickname" TEXT;

-- Best-effort backfill from legacy global User.nickname.
UPDATE "TenantMembership" AS tm
SET "nickname" = u."nickname"
FROM "User" AS u
WHERE tm."userId" = u.id
  AND u."nickname" IS NOT NULL
  AND tm."nickname" IS NULL;
