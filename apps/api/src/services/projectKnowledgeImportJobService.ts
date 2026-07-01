import { randomUUID } from "node:crypto";
import {
  ProjectKnowledgeAuthorityLevel,
  ProjectKnowledgeSourceType
} from "@prisma/client";
import {
  importProjectKnowledgeFromFile,
  type ProjectKnowledgeImportProgress
} from "./projectKnowledgeService";
import type { TenantAuthUser } from "./tenantAccessService";

export type ProjectKnowledgeImportJobStatus = "queued" | "running" | "completed" | "failed";

export type ProjectKnowledgeImportJob = {
  id: string;
  projectId: string;
  userId: string;
  fileName: string;
  status: ProjectKnowledgeImportJobStatus;
  stage: ProjectKnowledgeImportProgress["stage"] | "queued";
  detail?: string;
  currentChunk?: number;
  totalChunks?: number;
  successfulChunks?: number;
  error?: string;
  result?: Awaited<ReturnType<typeof importProjectKnowledgeFromFile>>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

type StartProjectKnowledgeImportJobInput = {
  projectId: string;
  user: TenantAuthUser;
  fileName: string;
  buffer: Buffer;
  sourceType: ProjectKnowledgeSourceType;
  authorityLevel?: ProjectKnowledgeAuthorityLevel;
  versionLabel?: string;
  title?: string;
  documentDate?: Date;
};

const jobs = new Map<string, ProjectKnowledgeImportJob>();
const JOB_TTL_MS = 60 * 60 * 1000;

function updateJob(jobId: string, patch: Partial<ProjectKnowledgeImportJob>) {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }

  jobs.set(jobId, {
    ...job,
    ...patch,
    updatedAt: new Date().toISOString()
  });
}

function scheduleCleanup(jobId: string) {
  setTimeout(() => {
    jobs.delete(jobId);
  }, JOB_TTL_MS).unref?.();
}

export function startProjectKnowledgeImportJob(input: StartProjectKnowledgeImportJobInput) {
  const now = new Date().toISOString();
  const job: ProjectKnowledgeImportJob = {
    id: randomUUID(),
    projectId: input.projectId,
    userId: input.user.id,
    fileName: input.fileName,
    status: "queued",
    stage: "queued",
    createdAt: now,
    updatedAt: now
  };

  jobs.set(job.id, job);

  void (async () => {
    updateJob(job.id, { status: "running", stage: "readingFile", detail: input.fileName });

    try {
      const result = await importProjectKnowledgeFromFile({
        ...input,
        onProgress: (progress) => {
          updateJob(job.id, {
            status: progress.stage === "completed" ? "completed" : "running",
            stage: progress.stage,
            detail: progress.detail,
            currentChunk: progress.currentChunk,
            totalChunks: progress.totalChunks,
            successfulChunks: progress.successfulChunks
          });
        }
      });

      updateJob(job.id, {
        status: "completed",
        stage: "completed",
        result,
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      updateJob(job.id, {
        status: "failed",
        stage: "failed",
        error: error instanceof Error ? error.message : "Project knowledge import failed",
        completedAt: new Date().toISOString()
      });
    } finally {
      scheduleCleanup(job.id);
    }
  })();

  return jobs.get(job.id)!;
}

export function getProjectKnowledgeImportJob(jobId: string, userId: string) {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) {
    return null;
  }

  return job;
}
