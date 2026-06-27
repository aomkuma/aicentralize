import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { buildEmbedding, cosineSimilarity } from "./embeddingService";
import { getSystemSettings, resolveActiveProviderCredential } from "./systemSettingsService";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

type AskResult = {
  answer: string;
  evidence: Array<{
    meetingId: string;
    title: string;
    project: string;
    snippet: string;
  }>;
};

type LocalGenerateInput = {
  prompt: string;
  model?: string;
  provider?: AiProvider;
  fallbackProvider?: AiProvider;
  fallbackProviders?: AiProvider[];
};

type LocalGenerateResult = {
  provider: AiProvider;
  model: string;
  output: string;
};

type AiProvider = "ollama" | "openai" | "anthropic" | "gemini";

type ProviderCredential = {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  organization?: string;
};

type WhisperTranscribeInput = {
  audioPath: string;
  model?: string;
  language?: string;
};

type WhisperTranscribeSegment = {
  start: number;
  end: number;
  text: string;
};

type WhisperTranscribeResult = {
  model: string;
  language: string;
  language_probability: number;
  transcript: string;
  segment_count: number;
  segments: WhisperTranscribeSegment[];
};

const DEFAULT_LOCAL_MODEL = "qwen2.5:7b";
const OLLAMA_GENERATE_PATH = "/api/generate";
const OPENAI_CHAT_PATH = "/v1/chat/completions";
const ANTHROPIC_MESSAGES_PATH = "/v1/messages";
const GEMINI_GENERATE_PATH_TEMPLATE = "/v1beta/models/{model}:generateContent";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-latest";
const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
const DEFAULT_AI_PROVIDER: AiProvider = "gemini";
const GEMINI_MAX_ATTEMPTS = 3;
const GEMINI_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_WHISPER_MODEL = "tiny";
const execFileAsync = promisify(execFile);
const DEFAULT_PYTHON_EXECUTABLE = "C:\\Users\\korap\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function parseProvider(value?: string): AiProvider | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "ollama" || normalized === "openai" || normalized === "anthropic" || normalized === "gemini") {
    return normalized;
  }

  return undefined;
}

function resolveProviderChain(input: LocalGenerateInput): AiProvider[] {
  const primary = input.provider
    ?? parseProvider(env.aiPrimaryProvider)
    ?? DEFAULT_AI_PROVIDER;

  const chain: AiProvider[] = [primary];
  const fromInput = (input.fallbackProviders ?? [])
    .filter((provider) => provider !== primary);
  const fallbackFromInputOrEnv = input.fallbackProvider ?? parseProvider(env.aiFallbackProvider);

  for (const provider of fromInput) {
    if (!chain.includes(provider)) {
      chain.push(provider);
    }
  }

  if (fallbackFromInputOrEnv && fallbackFromInputOrEnv !== primary && !chain.includes(fallbackFromInputOrEnv)) {
    chain.push(fallbackFromInputOrEnv);
  }

  return chain;
}

async function resolveGenerationConfig(input: LocalGenerateInput): Promise<{ providers: AiProvider[]; model?: string }> {
  if (input.provider || input.fallbackProvider || (input.fallbackProviders?.length ?? 0) > 0) {
    return {
      providers: resolveProviderChain(input),
      model: input.model
    };
  }

  try {
    const settings = await getSystemSettings();
    const configuredFallbackProviders = (settings.ai.generation.fallbackProviders ?? [])
      .map((value) => parseProvider(value))
      .filter((value): value is AiProvider => Boolean(value));
    const activeCredentialProviders = (settings.aiProviders.accounts ?? [])
      .filter((account) => account.isActive)
      .map((account) => parseProvider(account.provider))
      .filter((value): value is AiProvider => Boolean(value));
    const fallbackProviders = [...new Set([
      ...configuredFallbackProviders,
      ...activeCredentialProviders
    ])].filter((provider) => provider !== settings.ai.generation.provider);

    return {
      providers: resolveProviderChain({
        ...input,
        provider: settings.ai.generation.provider,
        fallbackProviders
      }),
      model: input.model ?? settings.ai.generation.defaultModel
    };
  } catch {
    return {
      providers: resolveProviderChain(input),
      model: input.model
    };
  }
}

async function resolveProviderCredential(provider: AiProvider): Promise<ProviderCredential> {
  const fromSettings = await resolveActiveProviderCredential(provider);
  if (fromSettings) {
    return {
      model: fromSettings.model,
      baseUrl: fromSettings.baseUrl,
      apiKey: fromSettings.apiKey,
      organization: fromSettings.organization
    };
  }

  if (provider === "openai") {
    return {
      model: env.openaiModel,
      baseUrl: env.openaiBaseUrl,
      apiKey: env.openaiApiKey
    };
  }

  if (provider === "anthropic") {
    return {
      model: env.anthropicModel,
      baseUrl: env.anthropicBaseUrl,
      apiKey: env.anthropicApiKey
    };
  }

  if (provider === "gemini") {
    return {
      model: env.geminiModel,
      baseUrl: env.geminiBaseUrl,
      apiKey: env.geminiApiKey
    };
  }

  return {};
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const timeoutMs = env.aiRequestTimeoutMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableTransportError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return message.includes("aborted") || message.includes("timeout") || message.includes("network") || message.includes("fetch failed");
}

async function generateWithOllama(input: LocalGenerateInput): Promise<LocalGenerateResult> {
  const model = input.model?.trim() || DEFAULT_LOCAL_MODEL;
  const baseUrl = env.ollamaBaseUrl.replace(/\/$/, "");

  const ollamaRes = await fetchWithTimeout(`${baseUrl}${OLLAMA_GENERATE_PATH}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: input.prompt,
      stream: false
    })
  });

  if (!ollamaRes.ok) {
    const text = await ollamaRes.text();
    throw new Error(`Ollama request failed (${baseUrl}${OLLAMA_GENERATE_PATH}): ${text}`);
  }

  const data = await ollamaRes.json() as { response?: string };
  return {
    provider: "ollama",
    model,
    output: data.response ?? ""
  };
}

async function generateWithOpenAI(input: LocalGenerateInput): Promise<LocalGenerateResult> {
  const credential = await resolveProviderCredential("openai");
  if (!credential.apiKey) {
    throw new Error("OpenAI API key is missing");
  }

  const model = credential.model || DEFAULT_OPENAI_MODEL;
  const baseUrl = (credential.baseUrl || env.openaiBaseUrl).replace(/\/$/, "");
  const response = await fetchWithTimeout(`${baseUrl}${OPENAI_CHAT_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credential.apiKey}`,
      ...(credential.organization ? { "OpenAI-Organization": credential.organization } : {})
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: input.prompt }],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI request failed (${baseUrl}${OPENAI_CHAT_PATH}): ${text}`);
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  };

  const content = data.choices?.[0]?.message?.content;
  const output = Array.isArray(content)
    ? content.filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n")
    : (content ?? "");

  return {
    provider: "openai",
    model,
    output
  };
}

async function generateWithAnthropic(input: LocalGenerateInput): Promise<LocalGenerateResult> {
  const credential = await resolveProviderCredential("anthropic");
  if (!credential.apiKey) {
    throw new Error("Anthropic API key is missing");
  }

  const model = credential.model || DEFAULT_ANTHROPIC_MODEL;
  const baseUrl = (credential.baseUrl || env.anthropicBaseUrl).replace(/\/$/, "");
  const response = await fetchWithTimeout(`${baseUrl}${ANTHROPIC_MESSAGES_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": credential.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      messages: [{ role: "user", content: input.prompt }]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic request failed (${baseUrl}${ANTHROPIC_MESSAGES_PATH}): ${text}`);
  }

  const data = await response.json() as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const output = (data.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("\n");

  return {
    provider: "anthropic",
    model,
    output
  };
}

async function generateWithGemini(input: LocalGenerateInput): Promise<LocalGenerateResult> {
  const credential = await resolveProviderCredential("gemini");
  if (!credential.apiKey) {
    throw new Error("Gemini API key is missing");
  }

  const model = credential.model || DEFAULT_GEMINI_MODEL;
  const baseUrl = (credential.baseUrl || env.geminiBaseUrl || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const path = GEMINI_GENERATE_PATH_TEMPLATE.replace("{model}", encodeURIComponent(model));
  const url = `${baseUrl}${path}?key=${encodeURIComponent(credential.apiKey)}`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: input.prompt }]
            }
          ]
        })
      });

      if (!response.ok) {
        const text = await response.text();
        if (GEMINI_RETRYABLE_STATUS.has(response.status) && attempt < GEMINI_MAX_ATTEMPTS) {
          const delayMs = 700 * (2 ** (attempt - 1));
          await sleep(delayMs);
          continue;
        }

        throw new Error(`Gemini request failed (${baseUrl}${path}): ${text}`);
      }

      const data = await response.json() as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const output = (data.candidates?.[0]?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("\n");

      return {
        provider: "gemini",
        model,
        output
      };
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      lastError = normalized;

      if (attempt < GEMINI_MAX_ATTEMPTS && isRetryableTransportError(normalized)) {
        const delayMs = 700 * (2 ** (attempt - 1));
        await sleep(delayMs);
        continue;
      }

      throw normalized;
    }
  }

  throw lastError ?? new Error("Gemini request failed after retries");
}

export async function generateWithLocalModel(input: LocalGenerateInput): Promise<LocalGenerateResult> {
  const generationConfig = await resolveGenerationConfig(input);
  const providers = generationConfig.providers;
  const errors: string[] = [];

  for (const provider of providers) {
    const runtimeInput: LocalGenerateInput = {
      ...input,
      model: provider === providers[0] ? generationConfig.model : undefined
    };

    try {
      if (provider === "openai") {
        return await generateWithOpenAI(runtimeInput);
      }

      if (provider === "anthropic") {
        return await generateWithAnthropic(runtimeInput);
      }

      if (provider === "gemini") {
        return await generateWithGemini(runtimeInput);
      }

      return await generateWithOllama(runtimeInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider}: ${message}`);
    }
  }

  throw new Error(`All AI providers failed. ${errors.join(" | ")}`);
}

export async function transcribeWithWhisper(input: WhisperTranscribeInput): Promise<WhisperTranscribeResult> {
  const scriptPath = path.resolve(process.cwd(), "scripts", "transcribe_whisper.py");
  const model = input.model?.trim() || DEFAULT_WHISPER_MODEL;
  const language = input.language?.trim() || "th";
  const pythonExecutable = process.env.PYTHON_EXECUTABLE || DEFAULT_PYTHON_EXECUTABLE;

  try {
    const { stdout, stderr } = await execFileAsync(
      pythonExecutable,
      [scriptPath, input.audioPath, model, language],
      {
        maxBuffer: 20 * 1024 * 1024,
        timeout: 10 * 60 * 1000,
        windowsHide: true
      }
    );

    if (stderr && stderr.trim()) {
      console.warn("[transcribeWithWhisper] stderr:", stderr);
    }

    return JSON.parse(stdout) as WhisperTranscribeResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const stderr = typeof error === "object" && error && "stderr" in error && typeof (error as { stderr?: unknown }).stderr === "string"
      ? (error as { stderr: string }).stderr
      : "";

    throw new Error([
      `Whisper transcription failed: ${message}`,
      stderr ? `stderr: ${stderr.trim()}` : ""
    ].filter(Boolean).join(" | "));
  }
}

export async function askMinutes(question: string): Promise<AskResult> {
  const q = normalize(question);
  const queryVec = buildEmbedding(q);

  const meetings = await prisma.meeting.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { summary: { contains: q, mode: "insensitive" } },
        { minutes: { some: { content: { contains: q, mode: "insensitive" } } } },
        { actionItems: { some: { task: { contains: q, mode: "insensitive" } } } },
        { embeddings: { some: { chunkText: { contains: q, mode: "insensitive" } } } }
      ]
    },
    include: {
      project: true,
      minutes: true,
      actionItems: { include: { assignee: true } },
      embeddings: true
    },
    take: 20,
    orderBy: { sessionAt: "desc" }
  });

  const ranked = meetings
    .map((meeting) => {
      const searchable = [
        meeting.title,
        meeting.summary,
        ...meeting.minutes.map((m) => m.content),
        ...meeting.actionItems.map((a) => `${a.task} ${a.detail ?? ""}`)
      ].join(" ");

      const lexicalHit = normalize(searchable).includes(q) ? 1 : 0;

      const maxEmbeddingScore = meeting.embeddings.reduce((max, chunk) => {
        if (!Array.isArray(chunk.vector)) {
          return max;
        }

        const chunkVec = (chunk.vector as unknown[])
          .filter((n) => typeof n === "number")
          .map((n) => n as number);

        if (!chunkVec.length) {
          return max;
        }

        return Math.max(max, cosineSimilarity(queryVec, chunkVec));
      }, 0);

      const score = lexicalHit * 0.55 + maxEmbeddingScore * 0.45;
      return { meeting, score };
    })
    .filter((row) => row.score >= env.aiSimilarityThreshold || row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (!ranked.length) {
    return {
      answer: "ไม่พบข้อมูลที่สอดคล้องกับคำถามใน minute meeting",
      evidence: []
    };
  }

  const evidence = ranked.map(({ meeting, score }) => ({
    meetingId: meeting.id,
    title: meeting.title,
    project: meeting.project.name,
    snippet: `${meeting.summary} | open actions: ${meeting.actionItems
      .filter((item) => item.status !== "DONE")
      .map((item) => `${item.task} -> ${item.assignee.name}`)
      .join(", ")} | score: ${score.toFixed(2)}`
  }));

  const answer = evidence
    .map((item, i) => `${i + 1}. [${item.project}] ${item.title}: ${item.snippet}`)
    .join("\n");

  return { answer, evidence };
}
