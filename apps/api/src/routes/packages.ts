import { Router } from "express";
import { prisma } from "../lib/prisma";

export const packagesRouter = Router();

packagesRouter.get("/", async (_req, res) => {
  const packages = await prisma.subscriptionPackage.findMany({
    where: { isActive: true },
    orderBy: [{ priceCents: "asc" }, { name: "asc" }]
  });

  res.json(packages);
});
