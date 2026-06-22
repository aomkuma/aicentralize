import { MeetingArtifactType, MinuteDraftStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { generateWithLocalModel } from "./aiService";
import { logAiRun } from "./aiRunLogService";

type ExtractMinuteDraftInput = {
  meetingId: string;
  requestedByUserId: string;
  artifactIds?: string[];
  supersedeExistingDrafts?: boolean;
  model?: string;
};

type ExtractMinuteDraftResult = {
  draftId: string;
  status: MinuteDraftStatus;
  warning?: string;
  parseErrors?: unknown;
};

const promptVersion = "sprint1-v1";

const extractedMinuteSchema = z.object({
  summary: z.string().trim().min(1),
  keyPoints: z.array(z.string().trim().min(1)).default([]),
  decisions: z.array(z.object({
    text: z.string().trim().min(1),
    ownerName: z.string().trim().min(1).optional(),
    dueDate: z.string().trim().datetime().optional()
  })).default([]),
  actionItems: z.array(z.object({
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    ownerName: z.string().trim().min(1).optional(),
    dueDate: z.string().trim().datetime().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM")
  })).default([]),
  risks: z.array(z.object({
    text: z.string().trim().min(1)
  })).default([]),
  openQuestions: z.array(z.object({
    text: z.string().trim().min(1)
  })).default([])
});

function buildExtractionPrompt(artifactText: string): string {
  return [
    "You are a senior meeting minute analyst.",
    "Read the meeting transcript/notes and return ONLY valid JSON.",
    "No markdown, no code fences, no extra explanation.",
    "Use this schema exactly:",
    "{",
    '  "summary": "string",',
    '  "keyPoints": ["string"],',
    '  "decisions": [{ "text": "string", "ownerName": "string optional", "dueDate": "ISO datetime optional" }],',
    '  "actionItems": [{ "title": "string", "description": "string optional", "ownerName": "string optional", "dueDate": "ISO datetime optional", "priority": "LOW|MEDIUM|HIGH|CRITICAL" }],',
    '  "risks": [{ "text": "string" }],',
    '  "openQuestions": [{ "text": "string" }]',
    "}",
    "If some section is unavailable, return empty array for that section.",
    "Respond in Thai for all text values.",
    "",
    "Meeting artifacts:",
    artifactText
  ].join("\n");
}

function tryParseJson(raw: string): unknown {
  return JSON.parse(raw);
}

function repairJsonCandidate(raw: string): string | null {
  const trimmed = raw.trim();
  const withoutFences = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const firstBrace = withoutFences.indexOf("{");
  const lastBrace = withoutFences.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return withoutFences.slice(firstBrace, lastBrace + 1);
}

function parseExtractionOutput(raw: string) {
  try {
    const parsed = tryParseJson(raw);
    const validated = extractedMinuteSchema.parse(parsed);
    return { validated, repaired: false as const };
  } catch (firstError) {
    const repairedCandidate = repairJsonCandidate(raw);
    if (!repairedCandidate) {
      throw firstError;
    }

    const parsed = tryParseJson(repairedCandidate);
    const validated = extractedMinuteSchema.parse(parsed);
    return { validated, repaired: true as const };
  }
}

export async function extractMinuteDraft(input: ExtractMinuteDraftInput): Promise<ExtractMinuteDraftResult> {
  const meeting = await prisma.meeting.findUnique({
    where: { id: input.meetingId },
    include: {
      project: true,
      artifacts: {
        where: input.artifactIds?.length
          ? { id: { in: input.artifactIds } }
          : { type: { in: [MeetingArtifactType.TRANSCRIPT, MeetingArtifactType.RAW_NOTE] } },
        orderBy: { createdAt: "asc" }
      }
    }
  });

  if (!meeting) {
    throw new Error("MEETING_NOT_FOUND");
  }

  if (!meeting.artifacts.length) {
    throw new Error("NO_SOURCE_ARTIFACT");
  }

  const artifactText = meeting.artifacts
    .map((artifact, idx) => {
      const header = `Artifact ${idx + 1} (${artifact.type}/${artifact.sourceType})`;
      const body = artifact.contentText ?? `[fileRef: ${artifact.fileUrl ?? "n/a"}]`;
      return `${header}\n${body}`;
    })
    .join("\n\n");

  const prompt = buildExtractionPrompt(artifactText);
  const generationStart = new Date();
  const runStartMs = Date.now();

  let modelOutput = "";
  let modelName = input.model ?? "qwen2.5:7b";

  try {
    const generated = await generateWithLocalModel({
      model: input.model,
      prompt
    });

    modelOutput = generated.output;
    modelName = generated.model;

    const { validated, repaired } = parseExtractionOutput(modelOutput);

    if (input.supersedeExistingDrafts) {
      await prisma.minuteDraft.updateMany({
        where: {
          meetingId: input.meetingId,
          status: { in: [MinuteDraftStatus.DRAFT, MinuteDraftStatus.READY_FOR_REVIEW] }
        },
        data: { status: MinuteDraftStatus.SUPERSEDED }
      });
    }

    const draft = await prisma.minuteDraft.create({
      data: {
        meetingId: input.meetingId,
        sourceArtifactId: meeting.artifacts[0]?.id,
        status: MinuteDraftStatus.READY_FOR_REVIEW,
        summary: validated.summary,
        keyPointsJson: validated.keyPoints,
        decisionsJson: validated.decisions,
        actionItemsJson: validated.actionItems,
        risksJson: validated.risks,
        openQuestionsJson: validated.openQuestions,
        generatedBy: "AI",
        generationMetaJson: {
          promptVersion,
          requestedByUserId: input.requestedByUserId,
          usedArtifactIds: meeting.artifacts.map((a) => a.id),
          repairedJson: repaired
        },
        rawModelOutputJson: { output: modelOutput },
        llmModel: modelName,
        extractionRunId: `${input.meetingId}:${generationStart.getTime()}`,
        createdById: input.requestedByUserId,
        generatedAt: new Date()
      }
    });

    await logAiRun({
      operation: "MINUTE_EXTRACTION",
      status: "SUCCESS",
      userId: input.requestedByUserId,
      projectId: meeting.projectId,
      meetingId: input.meetingId,
      model: modelName,
      promptVersion,
      durationMs: Date.now() - runStartMs,
      trace: {
        artifactCount: meeting.artifacts.length,
        artifactIds: meeting.artifacts.map((a) => a.id),
        repairedJson: repaired,
        draftId: draft.id
      }
    });

    return {
      draftId: draft.id,
      status: draft.status,
      warning: repaired ? "Model output needed controlled JSON repair" : undefined
    };
  } catch (error) {
    const parseErrorMessage = error instanceof Error ? error.message : "Unknown extraction error";

    const failed = await prisma.minuteDraft.create({
      data: {
        meetingId: input.meetingId,
        sourceArtifactId: meeting.artifacts[0]?.id,
        status: MinuteDraftStatus.REJECTED,
        summary: null,
        generatedBy: "AI",
        generationMetaJson: {
          promptVersion,
          requestedByUserId: input.requestedByUserId,
          usedArtifactIds: meeting.artifacts.map((a) => a.id)
        },
        rawModelOutputJson: modelOutput ? { output: modelOutput } : undefined,
        parseErrorsJson: { message: parseErrorMessage },
        llmModel: modelName,
        extractionRunId: `${input.meetingId}:${generationStart.getTime()}`,
        createdById: input.requestedByUserId,
        generatedAt: new Date()
      }
    });

    await logAiRun({
      operation: "MINUTE_EXTRACTION",
      status: "FAILED",
      userId: input.requestedByUserId,
      projectId: meeting.projectId,
      meetingId: input.meetingId,
      model: modelName,
      promptVersion,
      durationMs: Date.now() - runStartMs,
      trace: {
        artifactCount: meeting.artifacts.length,
        artifactIds: meeting.artifacts.map((a) => a.id),
        draftId: failed.id
      },
      errorMessage: parseErrorMessage
    });

    return {
      draftId: failed.id,
      status: failed.status,
      parseErrors: { message: parseErrorMessage }
    };
  }
}
