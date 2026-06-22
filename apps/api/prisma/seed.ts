import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminPwd = await bcrypt.hash("Admin123!", 10);
  const pmPwd = await bcrypt.hash("Pm123456!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@org.local" },
    update: {
      systemRole: "SUPER_ADMIN"
    },
    create: {
      email: "admin@org.local",
      name: "System Admin",
      role: "ADMIN",
      systemRole: "SUPER_ADMIN",
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

  const tenant = await prisma.tenant.upsert({
    where: { slug: "org-local" },
    update: {
      name: "Org Local"
    },
    create: {
      slug: "org-local",
      name: "Org Local",
      createdById: admin.id
    }
  });

  await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: admin.id
      }
    },
    update: {
      role: "TENANT_ADMIN",
      jobTitle: "Platform Admin"
    },
    create: {
      tenantId: tenant.id,
      userId: admin.id,
      role: "TENANT_ADMIN",
      jobTitle: "Platform Admin"
    }
  });

  await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: pm.id
      }
    },
    update: {
      role: "MANAGER",
      jobTitle: "Project Manager"
    },
    create: {
      tenantId: tenant.id,
      userId: pm.id,
      role: "MANAGER",
      jobTitle: "Project Manager"
    }
  });

  await prisma.tenantMembership.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: member.id
      }
    },
    update: {
      role: "MEMBER",
      jobTitle: "Engineer"
    },
    create: {
      tenantId: tenant.id,
      userId: member.id,
      role: "MEMBER",
      jobTitle: "Engineer"
    }
  });

  const project = await prisma.project.upsert({
    where: { code: "PRJ-ALPHA" },
    update: {
      tenantId: tenant.id
    },
    create: {
      tenantId: tenant.id,
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

  // ============================================
  // ADDITIONAL SAMPLE ORGANIZATIONS
  // ============================================

  // TechCorp Inc Organization
  const cto = await prisma.user.upsert({
    where: { email: "cto@techcorp.local" },
    update: {},
    create: {
      email: "cto@techcorp.local",
      name: "Alice Chen",
      role: "MEMBER",
      passwordHash: await bcrypt.hash("TechCorp123!", 10)
    }
  });

  const engineer1 = await prisma.user.upsert({
    where: { email: "engineer1@techcorp.local" },
    update: {},
    create: {
      email: "engineer1@techcorp.local",
      name: "Bob Johnson",
      role: "MEMBER",
      passwordHash: await bcrypt.hash("TechCorp123!", 10)
    }
  });

  const engineer2 = await prisma.user.upsert({
    where: { email: "engineer2@techcorp.local" },
    update: {},
    create: {
      email: "engineer2@techcorp.local",
      name: "Carol Davis",
      role: "MEMBER",
      passwordHash: await bcrypt.hash("TechCorp123!", 10)
    }
  });

  const techcorp = await prisma.tenant.upsert({
    where: { slug: "techcorp-inc" },
    update: {
      name: "TechCorp Inc"
    },
    create: {
      slug: "techcorp-inc",
      name: "TechCorp Inc",
      createdById: admin.id
    }
  });

  await prisma.tenantMembership.createMany({
    data: [
      {
        tenantId: techcorp.id,
        userId: admin.id,
        role: "TENANT_ADMIN",
        jobTitle: "CEO",
        department: "Executive"
      },
      {
        tenantId: techcorp.id,
        userId: cto.id,
        role: "MANAGER",
        jobTitle: "CTO",
        department: "Engineering"
      },
      {
        tenantId: techcorp.id,
        userId: engineer1.id,
        role: "MEMBER",
        jobTitle: "Senior Engineer",
        department: "Engineering"
      },
      {
        tenantId: techcorp.id,
        userId: engineer2.id,
        role: "MEMBER",
        jobTitle: "Full Stack Engineer",
        department: "Engineering"
      }
    ],
    skipDuplicates: true
  });

  const techProject = await prisma.project.upsert({
    where: { code: "TECH-001" },
    update: {
      tenantId: techcorp.id
    },
    create: {
      tenantId: techcorp.id,
      code: "TECH-001",
      name: "Platform Modernization",
      description: "Modernize legacy systems to cloud-native architecture"
    }
  });

  // FinanceHub Ltd Organization
  const cfo = await prisma.user.upsert({
    where: { email: "cfo@financehub.local" },
    update: {},
    create: {
      email: "cfo@financehub.local",
      name: "David Smith",
      role: "MEMBER",
      passwordHash: await bcrypt.hash("Finance123!", 10)
    }
  });

  const finManager = await prisma.user.upsert({
    where: { email: "manager@financehub.local" },
    update: {},
    create: {
      email: "manager@financehub.local",
      name: "Emma Wilson",
      role: "MEMBER",
      passwordHash: await bcrypt.hash("Finance123!", 10)
    }
  });

  const accountant = await prisma.user.upsert({
    where: { email: "accountant@financehub.local" },
    update: {},
    create: {
      email: "accountant@financehub.local",
      name: "Frank Brown",
      role: "MEMBER",
      passwordHash: await bcrypt.hash("Finance123!", 10)
    }
  });

  const financehub = await prisma.tenant.upsert({
    where: { slug: "financehub-ltd" },
    update: {
      name: "FinanceHub Ltd"
    },
    create: {
      slug: "financehub-ltd",
      name: "FinanceHub Ltd",
      createdById: admin.id
    }
  });

  await prisma.tenantMembership.createMany({
    data: [
      {
        tenantId: financehub.id,
        userId: admin.id,
        role: "TENANT_ADMIN",
        jobTitle: "Founder",
        department: "Executive"
      },
      {
        tenantId: financehub.id,
        userId: cfo.id,
        role: "MANAGER",
        jobTitle: "CFO",
        department: "Finance"
      },
      {
        tenantId: financehub.id,
        userId: finManager.id,
        role: "MANAGER",
        jobTitle: "Finance Manager",
        department: "Finance"
      },
      {
        tenantId: financehub.id,
        userId: accountant.id,
        role: "MEMBER",
        jobTitle: "Senior Accountant",
        department: "Finance"
      }
    ],
    skipDuplicates: true
  });

  const finProject = await prisma.project.upsert({
    where: { code: "FIN-2024" },
    update: {
      tenantId: financehub.id
    },
    create: {
      tenantId: financehub.id,
      code: "FIN-2024",
      name: "Q1 Financial Planning",
      description: "Strategic planning and budget allocation for Q1 2024"
    }
  });

  console.log("✅ Seeded all organizations:");
  console.log(`  - Org Local (default)`);
  console.log(`  - TechCorp Inc`);
  console.log(`  - FinanceHub Ltd`);
  console.log(`\n📊 Test Credentials:`);
  console.log(`  Admin: admin@org.local / Admin123!`);
  console.log(`  TechCorp CTO: cto@techcorp.local / TechCorp123!`);
  console.log(`  FinanceHub CFO: cfo@financehub.local / Finance123!`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
