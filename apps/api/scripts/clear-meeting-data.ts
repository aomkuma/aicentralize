import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Clears meeting-generated data while keeping the master setup intact.
 *
 * Keeps:
 * - Users
 * - Tenants / organizations
 * - Tenant memberships
 * - Projects
 *
 * Removes:
 * - Meetings and meeting children
 * - Action items, status history, notifications, reminders
 * - Minute drafts / versions / entries, decisions, artifacts, participants
 * - Meeting knowledge / embedding chunks
 * - AI query/run logs and reminder digest snapshots that can reference old meeting data
 *
 * Dry-run by default. Pass --force to actually delete.
 *
 *   pnpm --filter api db:clear-meetings         # preview only
 *   pnpm --filter api db:clear-meetings:force   # delete for real
 */

const prisma = new PrismaClient();
const force = process.argv.includes("--force");

function dbHost(): string {
  const url = process.env.DATABASE_URL ?? "";
  try {
    return new URL(url).host || "(unknown)";
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

async function getCounts() {
  const [
    tenants,
    tenantMemberships,
    users,
    projects,
    meetings,
    participants,
    artifacts,
    minuteDrafts,
    minuteVersions,
    knowledgeChunks,
    decisions,
    minuteEntries,
    actionItems,
    actionItemStatusHistory,
    notifications,
    reminderLogs,
    reminderDigests,
    embeddingChunks,
    askAiQueryLogs,
    aiRunLogs
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.tenantMembership.count(),
    prisma.user.count(),
    prisma.project.count(),
    prisma.meeting.count(),
    prisma.meetingParticipant.count(),
    prisma.meetingArtifact.count(),
    prisma.minuteDraft.count(),
    prisma.minuteVersion.count(),
    prisma.meetingKnowledgeChunk.count(),
    prisma.decision.count(),
    prisma.minuteEntry.count(),
    prisma.actionItem.count(),
    prisma.actionItemStatusHistory.count(),
    prisma.notification.count(),
    prisma.reminderLog.count(),
    prisma.reminderDigest.count(),
    prisma.embeddingChunk.count(),
    prisma.askAiQueryLog.count(),
    prisma.aiRunLog.count()
  ]);

  return {
    tenants,
    tenantMemberships,
    users,
    projects,
    meetings,
    participants,
    artifacts,
    minuteDrafts,
    minuteVersions,
    knowledgeChunks,
    decisions,
    minuteEntries,
    actionItems,
    actionItemStatusHistory,
    notifications,
    reminderLogs,
    reminderDigests,
    embeddingChunks,
    askAiQueryLogs,
    aiRunLogs
  };
}

async function main() {
  const counts = await getCounts();

  console.log(`Target database host: ${dbHost()}`);
  console.log(`Mode: ${force ? "FORCE (data will be deleted)" : "DRY-RUN (no changes)"}`);
  console.log("");
  console.log("Will keep:");
  console.log(`  - ${counts.users} user(s)`);
  console.log(`  - ${counts.tenants} tenant(s) / organization(s)`);
  console.log(`  - ${counts.tenantMemberships} tenant membership(s)`);
  console.log(`  - ${counts.projects} project(s)`);
  console.log("");
  console.log("Will remove:");
  console.log(`  - ${counts.meetings} meeting(s)`);
  console.log(`  - ${counts.participants} participant row(s), ${counts.artifacts} artifact(s)`);
  console.log(`  - ${counts.minuteDrafts} minute draft(s), ${counts.minuteVersions} minute version(s), ${counts.minuteEntries} minute entry row(s)`);
  console.log(`  - ${counts.knowledgeChunks} meeting knowledge chunk(s), ${counts.embeddingChunks} embedding chunk(s)`);
  console.log(`  - ${counts.decisions} decision(s)`);
  console.log(`  - ${counts.actionItems} action item(s), ${counts.actionItemStatusHistory} action status history row(s)`);
  console.log(`  - ${counts.notifications} notification(s), ${counts.reminderLogs} reminder log(s), ${counts.reminderDigests} reminder digest(s)`);
  console.log(`  - ${counts.askAiQueryLogs} Ask AI query log(s), ${counts.aiRunLogs} AI run log(s)`);
  console.log("");

  if (!force) {
    console.log("Dry-run only. Re-run with --force (pnpm --filter api db:clear-meetings:force) to delete.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.askAiQueryLog.deleteMany();
    await tx.aiRunLog.deleteMany();
    await tx.reminderDigest.deleteMany();
    await tx.reminderLog.deleteMany();
    await tx.notification.deleteMany();
    await tx.actionItemStatusHistory.deleteMany();
    await tx.meetingKnowledgeChunk.deleteMany();
    await tx.embeddingChunk.deleteMany();
    await tx.decision.deleteMany();
    await tx.minuteEntry.deleteMany();
    await tx.actionItem.deleteMany();
    await tx.minuteVersion.deleteMany();
    await tx.minuteDraft.deleteMany();
    await tx.meetingArtifact.deleteMany();
    await tx.meetingParticipant.deleteMany();
    await tx.meeting.deleteMany();
  });

  console.log("Done. Meeting data cleared; users, tenants, memberships, and projects were kept.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
