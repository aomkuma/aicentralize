import { SystemRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireSystemRole } from "../middleware/auth";
import { getSystemSettings, updateSystemSettings } from "../services/systemSettingsService";

export const systemSettingsRouter = Router();

const asrModeSchema = z.enum(["whisper", "browser", "hybrid"]);

const updateSystemSettingsSchema = z
  .object({
    ai: z
      .object({
        asrMode: asrModeSchema.optional(),
        whisper: z
          .object({
            enabled: z.boolean().optional(),
            model: z.string().min(1).max(100).optional(),
            language: z.string().min(2).max(20).optional(),
            timeoutMs: z.number().int().min(3000).max(180000).optional(),
          })
          .partial()
          .optional(),
        generation: z
          .object({
            defaultModel: z.string().min(1).max(100).optional(),
            maxPromptChars: z.number().int().min(256).max(12000).optional(),
          })
          .partial()
          .optional(),
      })
      .partial()
      .optional(),
    security: z
      .object({
        forceMfaForSuperAdmin: z.boolean().optional(),
        sessionTtlHours: z.number().int().min(1).max(720).optional(),
      })
      .partial()
      .optional(),
    notifications: z
      .object({
        emailEnabled: z.boolean().optional(),
        digestEnabled: z.boolean().optional(),
        escalationEnabled: z.boolean().optional(),
      })
      .partial()
      .optional(),
    integrations: z
      .object({
        ollamaEnabled: z.boolean().optional(),
        whisperEnabled: z.boolean().optional(),
      })
      .partial()
      .optional(),
  })
  .strict();

systemSettingsRouter.get("/", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (_req, res) => {
  const settings = await getSystemSettings();
  return res.json(settings);
});

systemSettingsRouter.patch("/", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
  const parsed = updateSystemSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  if (!req.user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const settings = await updateSystemSettings(parsed.data, req.user.id);
  return res.json(settings);
});
