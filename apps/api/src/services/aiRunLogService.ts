import { AiRunOperation, AiRunStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

type LogAiRunInput = {
  operation: AiRunOperation;
  status: AiRunStatus;
  userId?: string;
  projectId?: string;
  meetingId?: string;
  model?: string;
  promptVersion?: string;
  durationMs?: number;
  retrievedIds?: string[];
  trace?: unknown;
  errorMessage?: string;
};

export async function logAiRun(input: LogAiRunInput) {
  await prisma.aiRunLog.create({
    data: {
      operation: input.operation,
      status: input.status,
      userId: input.userId,
      projectId: input.projectId,
      meetingId: input.meetingId,
      model: input.model,
      promptVersion: input.promptVersion,
      durationMs: input.durationMs,
      retrievedIdsJson: input.retrievedIds as Prisma.InputJsonValue | undefined,
      traceJson: input.trace as Prisma.InputJsonValue | undefined,
      errorMessage: input.errorMessage
    }
  });
}
