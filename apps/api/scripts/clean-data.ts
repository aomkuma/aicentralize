import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Repeatable operational-data reset (safe to run many times).
 *
 * Keeps:
 * - Users whose systemRole is not USER (SUPER_ADMIN / MODERATOR)
 * - SystemSettings
 *
 * Removes everything else: tenants, memberships, invitations, projects,
 * meetings and their artifacts, action items, reminders, notifications,
 * AI/retrieval logs, and all USER accounts plus their auth/notification rows.
 *
 * Dry-run by default. Pass --force to actually delete.
 *
 *   pnpm --filter api db:clean         # preview only
 *   pnpm --filter api db:clean:force   # delete for real
 */

const prisma = new PrismaClient();

const force = process.argv.includes("--force");

// Operational tables truncated wholesale (CASCADE handles FK order).
const TRUNCATE_TABLES = [
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
];

function dbHost(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    return new URL(url).host || "(unknown)";
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function main() {
  const keptUsers = await prisma.user.findMany({
    where: { systemRole: { not: "USER" } },
    select: { email: true, systemRole: true, role: true }
  });

  const removableUsers = await prisma.user.count({ where: { systemRole: "USER" } });
  const [tenants, projects, meetings, actionItems] = await Promise.all([
    prisma.tenant.count(),
    prisma.project.count(),
    prisma.meeting.count(),
    prisma.actionItem.count()
  ]);

  console.log(`Target database host: ${dbHost()}`);
  console.log(`Mode: ${force ? "FORCE (data will be deleted)" : "DRY-RUN (no changes)"}`);
  console.log("");
  console.log("Will keep:");
  console.log(`  - ${keptUsers.length} platform user(s):`);
  for (const u of keptUsers) {
    console.log(`      ${u.email} [systemRole=${u.systemRole}, role=${u.role}]`);
  }
  console.log("  - SystemSettings");
  console.log("");
  console.log("Will remove:");
  console.log(`  - ${removableUsers} USER account(s) + their refresh/notification/push rows`);
  console.log(`  - ${tenants} tenant(s), ${projects} project(s), ${meetings} meeting(s), ${actionItems} action item(s)`);
  console.log(`  - all reminders, notifications, AI/retrieval logs, embeddings`);
  console.log("");

  if (keptUsers.length === 0) {
    console.error("Refusing to run: no SUPER_ADMIN/MODERATOR user would remain. Seed an admin first.");
    process.exitCode = 1;
    return;
  }

  if (!force) {
    console.log("Dry-run only. Re-run with --force (pnpm --filter api db:clean:force) to delete.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const quoted = TRUNCATE_TABLES.map((t) => `"${t}"`).join(", ");
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${quoted} CASCADE;`);

    await tx.refreshToken.deleteMany({ where: { user: { systemRole: "USER" } } });
    await tx.notificationSetting.deleteMany({ where: { user: { systemRole: "USER" } } });
    await tx.pushSubscription.deleteMany({ where: { user: { systemRole: "USER" } } });
    await tx.user.deleteMany({ where: { systemRole: "USER" } });
  });

  console.log("Done. Operational data cleared; platform admins and SystemSettings kept.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
