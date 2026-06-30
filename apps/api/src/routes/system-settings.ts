import { SystemRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireSystemRole } from "../middleware/auth";
import {
  activateAiProviderAccount,
  deleteAiProviderAccount,
  getSystemSettings,
  listAiProviderAccounts,
  resolveActiveProviderCredential,
  upsertAiProviderAccount,
  updateSystemSettings,
} from "../services/systemSettingsService";
import { generateWithLocalModel } from "../services/aiService";

export const systemSettingsRouter = Router();

const asrModeSchema = z.enum(["whisper", "browser", "hybrid"]);
const aiProviderSchema = z.enum(["ollama", "openai", "anthropic", "gemini"]);

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
            maxPromptChars: z.number().int().min(256).max(120000).optional(),
            provider: aiProviderSchema.optional(),
            fallbackProviders: z.array(aiProviderSchema).max(3).optional(),
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
    aiProviders: z
      .object({
        accounts: z.array(
          z.object({
            id: z.string().min(1),
            provider: aiProviderSchema,
            accountName: z.string().min(1),
            label: z.string().max(120).optional(),
            model: z.string().max(120).optional(),
            baseUrl: z.string().max(300).optional(),
            organization: z.string().max(120).optional(),
            apiKeyMasked: z.string().max(300).optional(),
            isActive: z.boolean(),
            createdAt: z.string().min(1),
            updatedAt: z.string().min(1)
          })
        ).optional()
      })
      .partial()
      .optional(),
  })
  .strict();

const aiKeyAccountSchema = z.object({
  provider: aiProviderSchema,
  accountName: z.string().min(1).max(120),
  label: z.string().max(120).optional(),
  model: z.string().max(120).optional(),
  baseUrl: z.string().url().max(300).optional(),
  organization: z.string().max(120).optional(),
  apiKey: z.string().min(10).max(400).optional(),
  isActive: z.boolean().optional(),
});

const aiKeyTestSchema = z.object({
  prompt: z.string().min(1).max(400).optional(),
});

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

systemSettingsRouter.get("/ai-keys", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (_req, res) => {
  const items = await listAiProviderAccounts();
  return res.json({ items });
});

systemSettingsRouter.post("/ai-keys", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
  const parsed = aiKeyAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  if (!req.user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const item = await upsertAiProviderAccount(parsed.data, req.user.id);
    return res.status(201).json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = message === "API_KEY_REQUIRED" ? 400 : 500;
    return res.status(status).json({ message });
  }
});

systemSettingsRouter.patch("/ai-keys/:id", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
  const parsed = aiKeyAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  if (!req.user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const item = await upsertAiProviderAccount({
      ...parsed.data,
      id: req.params.id,
    }, req.user.id);
    return res.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = message === "API_KEY_REQUIRED" ? 400 : 500;
    return res.status(status).json({ message });
  }
});

systemSettingsRouter.post("/ai-keys/:id/activate", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const item = await activateAiProviderAccount(req.params.id, req.user.id);
    return res.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = message === "ACCOUNT_NOT_FOUND" ? 404 : 500;
    return res.status(status).json({ message });
  }
});

systemSettingsRouter.delete("/ai-keys/:id", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
  if (!req.user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    await deleteAiProviderAccount(req.params.id, req.user.id);
    return res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const status = message === "ACCOUNT_NOT_FOUND" ? 404 : 500;
    return res.status(status).json({ message });
  }
});

systemSettingsRouter.post("/ai-keys/:id/test", requireAuth, requireSystemRole([SystemRole.SUPER_ADMIN]), async (req, res) => {
  const parsed = aiKeyTestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  try {
    const active = await activateAiProviderAccount(req.params.id, req.user?.id ?? "system");
    const credential = await resolveActiveProviderCredential(active.provider);
    if (!credential) {
      return res.status(404).json({ message: "ACTIVE_CREDENTIAL_NOT_FOUND" });
    }

    const result = await generateWithLocalModel({
      provider: active.provider,
      model: credential.model,
      prompt: parsed.data.prompt ?? "Reply with exactly: AI key test success"
    });

    return res.json({
      ok: true,
      provider: result.provider,
      model: result.model,
      preview: result.output.slice(0, 200)
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      message: "AI_KEY_TEST_FAILED",
      detail: error instanceof Error ? error.message : "unknown error"
    });
  }
});
