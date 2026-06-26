import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { buildEmbedding, cosineSimilarity } from "./embeddingService";

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
};

type LocalGenerateResult = {
  provider: AiProvider;
  model: string;
  output: string;
};

type AiProvider = "ollama" | "openai" | "anthropic";

const DEFAULT_LOCAL_MODEL = "qwen2.5:7b";
const OLLAMA_GENERATE_PATH = "/api/generate";
const OPENAI_CHAT_PATH = "/v1/chat/completions";
const ANTHROPIC_MESSAGES_PATH = "/v1/messages";
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-latest";
const DEFAULT_AI_PROVIDER: AiProvider = "ollama";

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function parseProvider(value?: string): AiProvider | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "ollama" || normalized === "openai" || normalized === "anthropic") {
    return normalized;
  }

  return undefined;
}

function resolveProviderChain(input: LocalGenerateInput): AiProvider[] {
  const primary = input.provider
    ?? parseProvider(env.aiPrimaryProvider)
    ?? DEFAULT_AI_PROVIDER;

  const fallbackFromInputOrEnv = input.fallbackProvider ?? parseProvider(env.aiFallbackProvider);
  const chain: AiProvider[] = [primary];

  if (fallbackFromInputOrEnv && fallbackFromInputOrEnv !== primary) {
    chain.push(fallbackFromInputOrEnv);
  }

  if (!chain.includes("ollama")) {
    chain.push("ollama");
  }

  return chain;
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
  if (!env.openaiApiKey) {
    throw new Error("OpenAI API key is missing");
  }

  const model = input.model?.trim() || env.openaiModel || DEFAULT_OPENAI_MODEL;
  const baseUrl = env.openaiBaseUrl.replace(/\/$/, "");
  const response = await fetchWithTimeout(`${baseUrl}${OPENAI_CHAT_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.openaiApiKey}`
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
  if (!env.anthropicApiKey) {
    throw new Error("Anthropic API key is missing");
  }

  const model = input.model?.trim() || env.anthropicModel || DEFAULT_ANTHROPIC_MODEL;
  const baseUrl = env.anthropicBaseUrl.replace(/\/$/, "");
  const response = await fetchWithTimeout(`${baseUrl}${ANTHROPIC_MESSAGES_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.anthropicApiKey,
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

export async function generateWithLocalModel(input: LocalGenerateInput): Promise<LocalGenerateResult> {
  const providers = resolveProviderChain(input);
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      if (provider === "openai") {
        return await generateWithOpenAI(input);
      }

      if (provider === "anthropic") {
        return await generateWithAnthropic(input);
      }

      return await generateWithOllama(input);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${provider}: ${message}`);
    }
  }

  throw new Error(`All AI providers failed. ${errors.join(" | ")}`);
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
