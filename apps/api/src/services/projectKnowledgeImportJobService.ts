import {
  KnowledgeImportJobKind,
  KnowledgeImportJobStatus,
  Prisma,
  type ProjectKnowledgeImportJob as ImportJobRow
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  extractProjectKnowledgeSource,
  importProjectKnowledgeFromFile,
  type ProjectKnowledgeImportProgress
} from "./projectKnowledgeService";
import type { TenantAuthUser } from "./tenantAccessService";

export type ProjectKnowledgeImportJobStatus = "queued" | "running" | "completed" | "failed";
export type ProjectKnowledgeJobKind = "import" | "extract";

export type ProjectKnowledgeImportJob = {
  id: string;
  kind: ProjectKnowledgeJobKind;
  projectId: string;
  userId: string;
  fileName: string;
  sourceId?: string;
  status: ProjectKnowledgeImportJobStatus;
  stage: ProjectKnowledgeImportProgress["stage"] | "queued";
  detail?: string;
  currentChunk?: number;
  totalChunks?: number;
  successfulChunks?: number;
  error?: string;
  result?: Awaited<ReturnType<typeof importProjectKnowledgeFromFile>> | {
    extraction: Awaited<ReturnType<typeof extractProjectKnowledgeSource>>;
  };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

type StartProjectKnowledgeImportJobInput = {
  projectId: string;
  user: TenantAuthUser;
  fileName: string;
  buffer: Buffer;
  sourceType: Parameters<typeof importProjectKnowledgeFromFile>[0]["sourceType"];
  authorityLevel?: Parameters<typeof importProjectKnowledgeFromFile>[0]["authorityLevel"];
  versionLabel?: string;
  title?: string;
  documentDate?: Date;
};

const JOB_TTL_MS = 60 * 60 * 1000;

function toApiStatus(status: KnowledgeImportJobStatus): ProjectKnowledgeImportJobStatus {
  return status.toLowerCase() as ProjectKnowledgeImportJobStatus;
}

function toApiKind(kind: KnowledgeImportJobKind): ProjectKnowledgeJobKind {
  return kind === KnowledgeImportJobKind.IMPORT ? "import" : "extract";
}

function toDbStatus(status: ProjectKnowledgeImportJobStatus): KnowledgeImportJobStatus {
  return status.toUpperCase() as KnowledgeImportJobStatus;
}

function mapJob(row: ImportJobRow): ProjectKnowledgeImportJob {
  return {
    id: row.id,
    kind: toApiKind(row.kind),
    projectId: row.projectId,
    userId: row.userId,
    fileName: row.fileName,
    sourceId: row.sourceId ?? undefined,
    status: toApiStatus(row.status),
    stage: row.stage as ProjectKnowledgeImportJob["stage"],
    detail: row.detail ?? undefined,
    currentChunk: row.currentChunk ?? undefined,
    totalChunks: row.totalChunks ?? undefined,
    successfulChunks: row.successfulChunks ?? undefined,
    error: row.error ?? undefined,
    result: row.resultJson
      ? (row.resultJson as unknown as ProjectKnowledgeImportJob["result"])
      : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString()
  };
}

async function updateJob(jobId: string, patch: Partial<ProjectKnowledgeImportJob>) {
  const data: Prisma.ProjectKnowledgeImportJobUpdateInput = {};

  if (patch.status !== undefined) {
    data.status = toDbStatus(patch.status);
  }
  if (patch.stage !== undefined) {
    data.stage = patch.stage;
  }
  if (patch.detail !== undefined) {
    data.detail = patch.detail;
  }
  if (patch.currentChunk !== undefined) {
    data.currentChunk = patch.currentChunk;
  }
  if (patch.totalChunks !== undefined) {
    data.totalChunks = patch.totalChunks;
  }
  if (patch.successfulChunks !== undefined) {
    data.successfulChunks = patch.successfulChunks;
  }
  if (patch.error !== undefined) {
    data.error = patch.error;
  }
  if (patch.result !== undefined) {
    data.resultJson = patch.result as Prisma.InputJsonValue;
  }
  if (patch.completedAt !== undefined) {
    data.completedAt = patch.completedAt ? new Date(patch.completedAt) : null;
  }
  if (patch.sourceId !== undefined) {
    data.sourceId = patch.sourceId;
  }

  const row = await prisma.projectKnowledgeImportJob.update({
    where: { id: jobId },
    data
  });

  return mapJob(row);
}

function scheduleCleanup(jobId: string) {
  setTimeout(() => {
    void prisma.projectKnowledgeImportJob.delete({ where: { id: jobId } }).catch(() => undefined);
  }, JOB_TTL_MS).unref?.();
}

export async function startProjectKnowledgeImportJob(input: StartProjectKnowledgeImportJobInput) {
  const row = await prisma.projectKnowledgeImportJob.create({
    data: {
      kind: KnowledgeImportJobKind.IMPORT,
      projectId: input.projectId,
      userId: input.user.id,
      fileName: input.fileName,
      status: KnowledgeImportJobStatus.QUEUED,
      stage: "queued"
    }
  });

  const job = mapJob(row);

  void (async () => {
    await updateJob(job.id, { status: "running", stage: "readingFile", detail: input.fileName });

    try {
      const result = await importProjectKnowledgeFromFile({
        ...input,
        onProgress: (progress) => {
          void updateJob(job.id, {
            status: progress.stage === "completed" ? "completed" : "running",
            stage: progress.stage,
            detail: progress.detail,
            currentChunk: progress.currentChunk,
            totalChunks: progress.totalChunks,
            successfulChunks: progress.successfulChunks
          });
        }
      });

      await updateJob(job.id, {
        status: "completed",
        stage: "completed",
        result,
        sourceId: result.source.id,
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      await updateJob(job.id, {
        status: "failed",
        stage: "failed",
        error: error instanceof Error ? error.message : "Project knowledge import failed",
        completedAt: new Date().toISOString()
      });
    } finally {
      scheduleCleanup(job.id);
    }
  })();

  return job;
}

type StartProjectKnowledgeExtractJobInput = {
  projectId: string;
  sourceId: string;
  sourceTitle: string;
  user: TenantAuthUser;
};

export async function startProjectKnowledgeExtractJob(input: StartProjectKnowledgeExtractJobInput) {
  const row = await prisma.projectKnowledgeImportJob.create({
    data: {
      kind: KnowledgeImportJobKind.EXTRACT,
      projectId: input.projectId,
      userId: input.user.id,
      sourceId: input.sourceId,
      fileName: input.sourceTitle,
      status: KnowledgeImportJobStatus.QUEUED,
      stage: "queued",
      detail: input.sourceTitle
    }
  });

  const job = mapJob(row);

  void (async () => {
    await updateJob(job.id, { status: "running", stage: "extracting", detail: input.sourceTitle });

    try {
      const extraction = await extractProjectKnowledgeSource(
        input.sourceId,
        input.user,
        (progress) => {
          void updateJob(job.id, {
            status: progress.stage === "completed" ? "completed" : "running",
            stage: progress.stage,
            detail: progress.detail,
            currentChunk: progress.currentChunk,
            totalChunks: progress.totalChunks,
            successfulChunks: progress.successfulChunks
          });
        }
      );

      await updateJob(job.id, {
        status: "completed",
        stage: "completed",
        result: { extraction },
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      await updateJob(job.id, {
        status: "failed",
        stage: "failed",
        error: error instanceof Error ? error.message : "Project knowledge extraction failed",
        completedAt: new Date().toISOString()
      });
    } finally {
      scheduleCleanup(job.id);
    }
  })();

  return job;
}

export async function getProjectKnowledgeImportJob(jobId: string, userId: string) {
  const row = await prisma.projectKnowledgeImportJob.findUnique({
    where: { id: jobId }
  });

  if (!row || row.userId !== userId) {
    return null;
  }

  return mapJob(row);
}
