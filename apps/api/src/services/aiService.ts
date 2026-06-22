import { prisma } from "../lib/prisma";
import { env } from "../config/env";
import { buildEmbedding, cosineSimilarity } from "./embeddingService";
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
};

type LocalGenerateResult = {
  model: string;
  output: string;
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
const DEFAULT_WHISPER_MODEL = "tiny";
const execFileAsync = promisify(execFile);
const DEFAULT_PYTHON_EXECUTABLE = "C:\\Users\\korap\\AppData\\Local\\Programs\\Python\\Python311\\python.exe";

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
