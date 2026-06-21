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
};

type LocalGenerateResult = {
  model: string;
  output: string;
};

const DEFAULT_LOCAL_MODEL = "qwen2.5:7b";

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

export async function generateWithLocalModel(input: LocalGenerateInput): Promise<LocalGenerateResult> {
  const model = input.model?.trim() || DEFAULT_LOCAL_MODEL;

  const ollamaRes = await fetch("http://127.0.0.1:11434/api/generate", {
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
    throw new Error(`Ollama request failed: ${text}`);
  }

  const data = await ollamaRes.json() as { response?: string };
  return {
    model,
    output: data.response ?? ""
  };
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
