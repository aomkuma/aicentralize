import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import crypto from "node:crypto";
import { env } from "../config/env";

type AsrMode = "whisper" | "browser" | "hybrid";
export type AiProvider = "ollama" | "openai" | "anthropic" | "gemini";

type AiProviderAccount = {
  id: string;
  provider: AiProvider;
  accountName: string;
  label?: string;
  model?: string;
  baseUrl?: string;
  organization?: string;
  apiKeyEncrypted: string;
  apiKeyMasked: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type AiProviderAccountView = Omit<AiProviderAccount, "apiKeyEncrypted">;

type UpsertAiProviderAccountInput = {
  id?: string;
  provider: AiProvider;
  accountName: string;
  label?: string;
  model?: string;
  baseUrl?: string;
  organization?: string;
  apiKey?: string;
  isActive?: boolean;
};

type ActiveProviderCredential = {
  provider: AiProvider;
  model?: string;
  baseUrl?: string;
  organization?: string;
  apiKey: string;
};

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

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
      provider: AiProvider;
      fallbackProviders: AiProvider[];
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
  aiProviders: {
    accounts: AiProviderAccount[];
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
      defaultModel: env.geminiModel ?? "gemini-2.0-flash",
      maxPromptChars: 4000,
      provider: "gemini",
      fallbackProviders: [],
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
    ollamaEnabled: false,
    whisperEnabled: true,
  },
  aiProviders: {
    accounts: [],
  },
};

function toIso(date = new Date()): string {
  return date.toISOString();
}

function createId(): string {
  return crypto.randomUUID();
}

function resolveEncryptionKey(): Buffer {
  const source = env.systemSettingsEncryptionKey || env.jwtSecret;
  return crypto.createHash("sha256").update(source).digest();
}

function encryptSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const key = resolveEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptSecret(value: string): string {
  if (!value.startsWith("enc:v1:")) {
    return value;
  }

  const [, , ivBase64, tagBase64, payloadBase64] = value.split(":");
  if (!ivBase64 || !tagBase64 || !payloadBase64) {
    throw new Error("Invalid encrypted secret format");
  }

  const key = resolveEncryptionKey();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadBase64, "base64")),
    decipher.final()
  ]);

  return decrypted.toString("utf8");
}

function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.length <= 8) {
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  }

  return `${trimmed.slice(0, 4)}${"*".repeat(Math.max(8, trimmed.length - 8))}${trimmed.slice(-4)}`;
}

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

  const providers: AiProvider[] = ["ollama", "openai", "anthropic", "gemini"];

  if (!providers.includes(merged.ai.generation.provider)) {
    merged.ai.generation.provider = DEFAULT_SYSTEM_SETTINGS.ai.generation.provider;
  }

  const fallbackProviders = Array.isArray(merged.ai.generation.fallbackProviders)
    ? merged.ai.generation.fallbackProviders.filter((value): value is AiProvider => providers.includes(value as AiProvider))
    : DEFAULT_SYSTEM_SETTINGS.ai.generation.fallbackProviders;

  merged.ai.generation.fallbackProviders = [...new Set(fallbackProviders)]
    .filter((provider) => provider !== merged.ai.generation.provider)
    .slice(0, 3);

  const accounts = Array.isArray(merged.aiProviders?.accounts)
    ? merged.aiProviders.accounts
    : [];

  merged.aiProviders.accounts = accounts
    .filter((item): item is AiProviderAccount => {
      return Boolean(
        item
        && typeof item.id === "string"
        && providers.includes(item.provider)
        && typeof item.accountName === "string"
        && typeof item.apiKeyEncrypted === "string"
      );
    })
    .map((item) => ({
      ...item,
      accountName: item.accountName.trim(),
      label: item.label?.trim() || undefined,
      model: item.model?.trim() || undefined,
      baseUrl: item.baseUrl?.trim() || undefined,
      organization: item.organization?.trim() || undefined,
      apiKeyMasked: item.apiKeyMasked || "",
      isActive: Boolean(item.isActive),
      createdAt: item.createdAt || toIso(),
      updatedAt: item.updatedAt || toIso()
    }));

  for (const provider of providers) {
    const activeAccounts = merged.aiProviders.accounts.filter((item) => item.provider === provider && item.isActive);
    if (activeAccounts.length > 1) {
      let kept = false;
      merged.aiProviders.accounts = merged.aiProviders.accounts.map((item) => {
        if (item.provider !== provider || !item.isActive) {
          return item;
        }

        if (!kept) {
          kept = true;
          return item;
        }

        return {
          ...item,
          isActive: false
        };
      });
    }
  }

  return merged;
}

function withoutSecrets(settings: SystemSettings): SystemSettings {
  return {
    ...settings,
    aiProviders: {
      accounts: settings.aiProviders.accounts.map(({ apiKeyEncrypted: _apiKeyEncrypted, ...rest }) => rest as AiProviderAccount)
    }
  };
}

async function saveSystemSettings(next: SystemSettings, updatedById?: string): Promise<SystemSettings> {
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

export async function getSystemSettings(options?: { includeSecrets?: boolean }): Promise<SystemSettings> {
  const row = await prisma.systemSettings.findUnique({ where: { id: "global" } });
  const settings = normalizeSettings(row?.config ?? DEFAULT_SYSTEM_SETTINGS);
  return options?.includeSecrets ? settings : withoutSecrets(settings);
}

export async function updateSystemSettings(patch: DeepPartial<SystemSettings>, updatedById: string): Promise<SystemSettings> {
  const current = await getSystemSettings({ includeSecrets: true });
  const next = normalizeSettings(deepMerge(current, patch));
  const saved = await saveSystemSettings(next, updatedById);
  return withoutSecrets(saved);
}

export async function listAiProviderAccounts(): Promise<AiProviderAccountView[]> {
  const settings = await getSystemSettings();
  return settings.aiProviders.accounts as unknown as AiProviderAccountView[];
}

export async function upsertAiProviderAccount(input: UpsertAiProviderAccountInput, updatedById: string): Promise<AiProviderAccountView> {
  const settings = await getSystemSettings({ includeSecrets: true });
  const now = toIso();
  const existing = settings.aiProviders.accounts.find((item) => item.id === input.id);

  if (!existing && !input.apiKey?.trim()) {
    throw new Error("API_KEY_REQUIRED");
  }

  const apiKeyPlain = input.apiKey?.trim();
  const nextEncrypted = apiKeyPlain ? encryptSecret(apiKeyPlain) : existing?.apiKeyEncrypted;
  const nextMasked = apiKeyPlain ? maskApiKey(apiKeyPlain) : (existing?.apiKeyMasked ?? "");

  if (!nextEncrypted) {
    throw new Error("API_KEY_REQUIRED");
  }

  const nextAccount: AiProviderAccount = {
    id: existing?.id ?? createId(),
    provider: input.provider,
    accountName: input.accountName.trim(),
    label: input.label?.trim() || undefined,
    model: input.model?.trim() || undefined,
    baseUrl: input.baseUrl?.trim() || undefined,
    organization: input.organization?.trim() || undefined,
    apiKeyEncrypted: nextEncrypted,
    apiKeyMasked: nextMasked,
    isActive: input.isActive ?? existing?.isActive ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };

  const otherAccounts = settings.aiProviders.accounts.filter((item) => item.id !== nextAccount.id);
  const accounts = nextAccount.isActive
    ? otherAccounts.map((item) => item.provider === nextAccount.provider ? { ...item, isActive: false } : item)
    : otherAccounts;

  const next = normalizeSettings({
    ...settings,
    aiProviders: {
      accounts: [...accounts, nextAccount]
    }
  });

  const saved = await saveSystemSettings(next, updatedById);
  const account = saved.aiProviders.accounts.find((item) => item.id === nextAccount.id);
  if (!account) {
    throw new Error("ACCOUNT_SAVE_FAILED");
  }

  const { apiKeyEncrypted: _secret, ...view } = account;
  return view as AiProviderAccountView;
}

export async function activateAiProviderAccount(id: string, updatedById: string): Promise<AiProviderAccountView> {
  const settings = await getSystemSettings({ includeSecrets: true });
  const target = settings.aiProviders.accounts.find((item) => item.id === id);
  if (!target) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }

  const now = toIso();
  const next = normalizeSettings({
    ...settings,
    aiProviders: {
      accounts: settings.aiProviders.accounts.map((item) => {
        if (item.provider !== target.provider) {
          return item;
        }

        return {
          ...item,
          isActive: item.id === target.id,
          updatedAt: item.id === target.id ? now : item.updatedAt
        };
      })
    }
  });

  const saved = await saveSystemSettings(next, updatedById);
  const account = saved.aiProviders.accounts.find((item) => item.id === id);
  if (!account) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }

  const { apiKeyEncrypted: _secret, ...view } = account;
  return view as AiProviderAccountView;
}

export async function deleteAiProviderAccount(id: string, updatedById: string): Promise<void> {
  const settings = await getSystemSettings({ includeSecrets: true });
  const exists = settings.aiProviders.accounts.some((item) => item.id === id);
  if (!exists) {
    throw new Error("ACCOUNT_NOT_FOUND");
  }

  const next = normalizeSettings({
    ...settings,
    aiProviders: {
      accounts: settings.aiProviders.accounts.filter((item) => item.id !== id)
    }
  });

  await saveSystemSettings(next, updatedById);
}

export async function resolveActiveProviderCredential(provider: AiProvider): Promise<ActiveProviderCredential | null> {
  const settings = await getSystemSettings({ includeSecrets: true });
  const account = settings.aiProviders.accounts.find((item) => item.provider === provider && item.isActive);
  if (!account) {
    return null;
  }

  return {
    provider,
    model: account.model,
    baseUrl: account.baseUrl,
    organization: account.organization,
    apiKey: decryptSecret(account.apiKeyEncrypted)
  };
}
