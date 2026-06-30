import { prisma } from "../lib/prisma";
import { type TenantAuthUser } from "./tenantAccessService";
import { assertProjectKnowledgeAccess } from "./projectKnowledgeService";

export async function listProjectGeneralNotes(projectId: string, user: TenantAuthUser) {
  await assertProjectKnowledgeAccess(projectId, user, "read");

  return prisma.projectGeneralNote.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });
}

export async function createProjectGeneralNote(input: {
  projectId: string;
  title: string;
  content: string;
  user: TenantAuthUser;
}) {
  const project = await assertProjectKnowledgeAccess(input.projectId, input.user, "write");

  return prisma.projectGeneralNote.create({
    data: {
      tenantId: project.tenantId,
      projectId: project.id,
      authorId: input.user.id,
      title: input.title,
      content: input.content
    },
    include: {
      author: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });
}
