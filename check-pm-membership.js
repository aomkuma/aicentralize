const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const memberships = await prisma.tenantMembership.findMany({
    where: { user: { email: 'pm@org.local' } },
    include: { user: true, tenant: true }
  });
  console.log('PM User Memberships:');
  console.log(JSON.stringify(memberships, null, 2));
  await prisma.$disconnect();
})();
