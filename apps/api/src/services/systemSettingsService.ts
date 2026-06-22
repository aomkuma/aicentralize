import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type AsrMode = "whisper" | "browser" | "hybrid";

export interface SystemSettings {
  ai: {
    asrMode: AsrMode;
    whisper: {
      enabled: boolean;
      model: string;
      language: string;
      timeoutMs: number;
    };
    generation: {
      defaultModel: string;
      maxPromptChars: number;
    };
  };
  security: {
    forceMfaForSuperAdmin: boolean;
    sessionTtlHours: number;
  };
  notifications: {
    emailEnabled: boolean;
    digestEnabled: boolean;
    escalationEnabled: boolean;
  };
  integrations: {
    ollamaEnabled: boolean;
    whisperEnabled: boolean;
  };
}

const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  ai: {
    asrMode: "hybrid",
    whisper: {
      enabled: true,
      model: "tiny",
      language: "th",
      timeoutMs: 30000,
    },
    generation: {
      defaultModel: "qwen2.5:7b",
      maxPromptChars: 4000,
    },
  },
  security: {
    forceMfaForSuperAdmin: false,
    sessionTtlHours: 12,
  },
  notifications: {
    emailEnabled: true,
    digestEnabled: true,
    escalationEnabled: true,
  },
  integrations: {
    ollamaEnabled: true,
    whisperEnabled: true,
  },
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (!isObject(base) || !isObject(patch)) {
    return patch === undefined ? base : patch;
  }

  const merged: Record<string, unknown> = { ...base };
  for (const key of Object.keys(patch)) {
    merged[key] = deepMerge(merged[key], patch[key]);
  }

  return merged;
}

function normalizeSettings(input: unknown): SystemSettings {
  const merged = deepMerge(DEFAULT_SYSTEM_SETTINGS, input) as SystemSettings;

  merged.ai.whisper.timeoutMs = Math.max(3000, Math.min(180000, Number(merged.ai.whisper.timeoutMs) || 30000));
  merged.ai.generation.maxPromptChars = Math.max(256, Math.min(12000, Number(merged.ai.generation.maxPromptChars) || 4000));
  merged.security.sessionTtlHours = Math.max(1, Math.min(720, Number(merged.security.sessionTtlHours) || 12));

  if (!["whisper", "browser", "hybrid"].includes(merged.ai.asrMode)) {
    merged.ai.asrMode = DEFAULT_SYSTEM_SETTINGS.ai.asrMode;
  }

  return merged;
}

export async function getSystemSettings(): Promise<SystemSettings> {
  const row = await prisma.systemSettings.findUnique({ where: { id: "global" } });
  return normalizeSettings(row?.config ?? DEFAULT_SYSTEM_SETTINGS);
}

export async function updateSystemSettings(patch: Partial<SystemSettings>, updatedById: string): Promise<SystemSettings> {
  const current = await getSystemSettings();
  const next = normalizeSettings(deepMerge(current, patch));

  const saved = await prisma.systemSettings.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      config: next as unknown as Prisma.InputJsonValue,
      updatedById,
    },
    update: {
      config: next as unknown as Prisma.InputJsonValue,
      updatedById,
    },
  });

  return normalizeSettings(saved.config);
}
