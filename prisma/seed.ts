import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminPwd = await bcrypt.hash("Admin123!", 10);
  const pmPwd = await bcrypt.hash("Pm123456!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@org.local" },
    update: {},
    create: {
      email: "admin@org.local",
      name: "System Admin",
      role: "ADMIN",
      passwordHash: adminPwd
    }
  });

  const pm = await prisma.user.upsert({
    where: { email: "pm@org.local" },
    update: {},
    create: {
      email: "pm@org.local",
      name: "Project Manager",
      role: "PM",
      passwordHash: pmPwd
    }
  });

  const member = await prisma.user.upsert({
    where: { email: "member@org.local" },
    update: {},
    create: {
      email: "member@org.local",
      name: "Team Member",
      role: "MEMBER",
      passwordHash: pmPwd
    }
  });

  const project = await prisma.project.upsert({
    where: { code: "PRJ-ALPHA" },
    update: {},
    create: {
      code: "PRJ-ALPHA",
      name: "Alpha Transformation",
      description: "Pilot project for centralized minute intelligence"
    }
  });

  const meeting = await prisma.meeting.create({
    data: {
      projectId: project.id,
      title: "Sprint Planning Session 1",
      sessionAt: new Date(),
      summary: "Agreed sprint goals, risks, and assigned core tasks.",
      createdById: pm.id,
      minutes: {
        create: [
          { section: "Decisions", content: "Use centralized minute system for all projects." },
          { section: "Risks", content: "Task bottleneck may happen if approvals depend on one person." }
        ]
      },
      actionItems: {
        create: [
          {
            task: "Prepare onboarding guide",
            detail: "Write first draft and circulate for review.",
            assigneeId: member.id,
            dueDate: new Date(Date.now() + 48 * 60 * 60 * 1000)
          },
          {
            task: "Define escalation matrix",
            detail: "Map approver backups for each workstream.",
            assigneeId: admin.id,
            dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000)
          }
        ]
      },
      embeddings: {
        create: [
          {
            sourceType: "summary",
            chunkText: "Sprint planning agreed goals and onboarding plus escalation tasks."
          }
        ]
      }
    }
  });

  await prisma.notificationSetting.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      userId: admin.id,
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false
    }
  });

  await prisma.notificationSetting.upsert({
    where: { userId: pm.id },
    update: {},
    create: {
      userId: pm.id,
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false
    }
  });

  await prisma.notificationSetting.upsert({
    where: { userId: member.id },
    update: {},
    create: {
      userId: member.id,
      inAppEnabled: true,
      emailEnabled: false,
      pushEnabled: false
    }
  });

  console.log(`Seeded meeting ${meeting.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
