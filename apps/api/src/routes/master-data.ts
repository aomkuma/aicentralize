import { Router } from "express";
import { TenantEntityType } from "@prisma/client";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { getActiveTenantCategories } from "../services/tenantMetadataService";

export const masterDataRouter = Router();

const categoryQuerySchema = z.object({
  entityType: z.nativeEnum(TenantEntityType).optional()
});

masterDataRouter.get("/tenant-categories", requireAuth, async (req, res) => {
  const parsed = categoryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid query", errors: parsed.error.flatten() });
  }

  const categories = await getActiveTenantCategories(parsed.data.entityType);
  res.json(categories);
});
