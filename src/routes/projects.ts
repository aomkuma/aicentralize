import { UserRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";

export const projectRouter = Router();

const createProjectSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional()
});

projectRouter.get("/", requireAuth, async (_req, res) => {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: { meetings: true }
      }
    }
  });

  res.json(projects);
});

projectRouter.post("/", requireAuth, requireRole([UserRole.ADMIN, UserRole.PM]), async (req, res) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const project = await prisma.project.create({ data: parsed.data });
  res.status(201).json(project);
});
