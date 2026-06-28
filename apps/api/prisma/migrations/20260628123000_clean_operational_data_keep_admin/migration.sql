-- One-time cleanup migration.
--
-- Keeps:
-- - "User" rows where systemRole = 'SUPER_ADMIN' OR role = 'ADMIN'
-- - "SystemSettings"
--
-- Removes:
-- - tenants, tenant memberships, invitations
-- - projects, meetings, meeting artifacts/minutes/drafts/versions
-- - action items, reminders, notifications, AI/retrieval logs
-- - non-admin users and their personal auth/notification records

TRUNCATE TABLE
  "UserInvitation",
  "TenantMembership",
  "Tenant",
  "Project",
  "Meeting",
  "MeetingParticipant",
  "MeetingArtifact",
  "MinuteDraft",
  "MinuteVersion",
  "MeetingKnowledgeChunk",
  "Decision",
  "MinuteEntry",
  "ActionItem",
  "ActionItemStatusHistory",
  "Notification",
  "ReminderLog",
  "ReminderDigest",
  "EmbeddingChunk",
  "AskAiQueryLog",
  "AiRunLog"
CASCADE;

DELETE FROM "RefreshToken"
WHERE "userId" IN (
  SELECT "id"
  FROM "User"
  WHERE "systemRole" <> 'SUPER_ADMIN'
    AND "role" <> 'ADMIN'
);

DELETE FROM "NotificationSetting"
WHERE "userId" IN (
  SELECT "id"
  FROM "User"
  WHERE "systemRole" <> 'SUPER_ADMIN'
    AND "role" <> 'ADMIN'
);

DELETE FROM "PushSubscription"
WHERE "userId" IN (
  SELECT "id"
  FROM "User"
  WHERE "systemRole" <> 'SUPER_ADMIN'
    AND "role" <> 'ADMIN'
);

DELETE FROM "User"
WHERE "systemRole" <> 'SUPER_ADMIN'
  AND "role" <> 'ADMIN';
