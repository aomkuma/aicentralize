import {
  Prisma,
  ProjectKnowledgeAuthorityLevel,
  ProjectKnowledgeSourceStatus,
  ProjectKnowledgeSourceType,
  ProjectMemoryItemStatus,
  ProjectMemoryItemType,
  TenantRole
} from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  ensureTenantMembership,
  ensureTenantRole,
  isPlatformAdmin,
  type TenantAuthUser
} from "./tenantAccessService";
import { listMemberProjectIds } from "./accessScopeService";
import { generateWithLocalModel } from "./aiService";
import {
  deriveTitleFromFileName,
  DocumentReadError,
  extractDocumentText
} from "./documentTextService";

type ExtractedMemoryItem = {
  type: ProjectMemoryItemType;
  title: string;
  content: string;
  confidence: "LOW" | "MEDIUM" | "HIGH";
};

type ExtractionJson = {
  overview: string;
  items: ExtractedMemoryItem[];
  signals: {
    sourceType: ProjectKnowledgeSourceType;
    lineCount: number;
    extractedAt: string;
  };
};

const readTenantRoles = [TenantRole.TENANT_ADMIN, TenantRole.MANAGER, TenantRole.MEMBER, TenantRole.VIEWER];
const writeTenantRoles = [TenantRole.TENANT_ADMIN, TenantRole.MANAGER];
const AI_EXTRACTION_CHAR_LIMIT = 12000;

export async function assertProjectKnowledgeAccess(
  projectId: string,
  user: TenantAuthUser,
  mode: "read" | "write"
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      code: true,
      tenantId: true
    }
  });

  if (!project) {
    throw new Error("PROJECT_NOT_FOUND");
  }

  if (!project.tenantId) {
    if (!isPlatformAdmin(user)) {
      throw new Error("FORBIDDEN_PROJECT_SCOPE");
    }
    return project;
  }

  if (mode === "write") {
    const canWrite = await ensureTenantRole(user, project.tenantId, writeTenantRoles);
    if (!canWrite) {
      throw new Error("FORBIDDEN_PROJECT_SCOPE");
    }
    return project;
  }

  const hasTenantRead = await ensureTenantRole(user, project.tenantId, readTenantRoles);
  if (hasTenantRead) {
    return project;
  }

  const memberProjectIds = await listMemberProjectIds(user.id);
  if (memberProjectIds.includes(project.id)) {
    return project;
  }

  const hasMembership = await ensureTenantMembership(user, project.tenantId);
  if (!hasMembership) {
    throw new Error("FORBIDDEN_PROJECT_SCOPE");
  }

  return project;
}

const normalizeLine = (line: string) =>
  line
    .replace(/^[-*\u2022\d.\s\[\]xX]+/, "")
    .replace(/\s+/g, " ")
    .trim();

const uniquePush = (items: ExtractedMemoryItem[], next: ExtractedMemoryItem) => {
  const key = `${next.type}:${next.title.toLowerCase()}:${next.content.toLowerCase()}`;
  const exists = items.some((item) => `${item.type}:${item.title.toLowerCase()}:${item.content.toLowerCase()}` === key);
  if (!exists && next.title && next.content) {
    items.push(next);
  }
};

function extractJsonCandidate(raw: string) {
  const trimmed = raw.trim();
  const stripped = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return stripped.slice(firstBrace, lastBrace + 1);
}

function normalizeMemoryType(raw: unknown): ProjectMemoryItemType | null {
  if (typeof raw !== "string") {
    return null;
  }

  const candidate = raw.trim().toUpperCase();
  if (candidate === "OVERVIEW" || candidate === "SCOPE" || candidate === "REQUIREMENT" ||
    candidate === "DECISION" || candidate === "RISK" || candidate === "ISSUE" ||
    candidate === "ACTION" || candidate === "MILESTONE" || candidate === "GLOSSARY" ||
    candidate === "ASSUMPTION" || candidate === "OPEN_QUESTION" || candidate === "STAKEHOLDER") {
    return candidate;
  }

  return null;
}

function normalizeConfidence(raw: unknown): ExtractedMemoryItem["confidence"] {
  if (typeof raw !== "string") {
    return "MEDIUM";
  }

  const candidate = raw.trim().toUpperCase();
  if (candidate === "LOW" || candidate === "MEDIUM" || candidate === "HIGH") {
    return candidate;
  }

  return "MEDIUM";
}

function parseAiExtractionJson(raw: string, sourceType: ProjectKnowledgeSourceType): ExtractionJson | null {
  const candidate = extractJsonCandidate(raw);
  if (!candidate) {
    return null;
  }

  try {
    const parsed = JSON.parse(candidate) as {
      overview?: unknown;
      items?: Array<{
        type?: unknown;
        title?: unknown;
        content?: unknown;
        confidence?: unknown;
      }>;
    };

    const items = Array.isArray(parsed.items)
      ? parsed.items
        .map((item) => {
          const type = normalizeMemoryType(item?.type);
          const title = typeof item?.title === "string" ? item.title.trim() : "";
          const content = typeof item?.content === "string" ? item.content.trim() : "";

          if (!type || !title || !content) {
            return null;
          }

          return {
            type,
            title: title.slice(0, 180),
            content: content.slice(0, 4000),
            confidence: normalizeConfidence(item?.confidence)
          } satisfies ExtractedMemoryItem;
        })
        .filter((item): item is ExtractedMemoryItem => Boolean(item))
      : [];

    const overview = typeof parsed.overview === "string" ? parsed.overview.trim() : "";

    return {
      overview,
      items: items.slice(0, 60),
      signals: {
        sourceType,
        lineCount: 0,
        extractedAt: new Date().toISOString()
      }
    };
  } catch {
    return null;
  }
}

function buildProjectKnowledgeExtractionPrompt(source: {
  sourceType: ProjectKnowledgeSourceType;
  title: string;
  contentText: string;
}) {
  return [
    "You are an expert project knowledge onboarding analyst.",
    "Your task is to convert uploaded project documents into structured project memory.",
    "Return ONLY valid JSON.",
    "No markdown. No code fences. No explanation.",
    "Use this schema exactly:",
    "{",
    '  "overview": "string",',
    '  "items": [',
    '    {',
    '      "type": "OVERVIEW|SCOPE|REQUIREMENT|DECISION|RISK|ISSUE|ACTION|MILESTONE|GLOSSARY|ASSUMPTION|OPEN_QUESTION|STAKEHOLDER",',
    '      "title": "string",',
    '      "content": "string",',
    '      "confidence": "LOW|MEDIUM|HIGH"',
    "    }",
    "  ]",
    "}",
    "Rules:",
    "- Keep project-specific names, dates, owners, requirements, risks, and decisions.",
    "- Prefer concise factual statements over interpretation.",
    "- If information is historical or ambiguous, preserve that nuance in content.",
    "- Include 3 to 20 useful memory items when possible.",
    "- Use Thai when the source is Thai, otherwise preserve the source language.",
    "",
    `Source type: ${source.sourceType}`,
    `Source title: ${source.title}`,
    "Document text:",
    source.contentText.slice(0, AI_EXTRACTION_CHAR_LIMIT)
  ].join("\n");
}

const classifyLine = (line: string, sourceType: ProjectKnowledgeSourceType): ExtractedMemoryItem | null => {
  if (/^(scope|ขอบเขต|in scope|out of scope)/i.test(line)) {
    return { type: ProjectMemoryItemType.SCOPE, title: "Scope", content: line, confidence: "HIGH" };
  }
  if (/(requirement|must|shall|ควร|ต้อง|ระบบต้อง|user story|acceptance criteria)/i.test(line)) {
    return { type: ProjectMemoryItemType.REQUIREMENT, title: line.slice(0, 90), content: line, confidence: "MEDIUM" };
  }
  if (/(decision|decided|agreed|approved|มติ|ตกลง|เห็นชอบ|อนุมัติ)/i.test(line)) {
    return { type: ProjectMemoryItemType.DECISION, title: line.slice(0, 90), content: line, confidence: "MEDIUM" };
  }
  if (/(risk|ความเสี่ยง|ระวัง|blocker|dependency|ติดขัด)/i.test(line)) {
    return { type: ProjectMemoryItemType.RISK, title: line.slice(0, 90), content: line, confidence: "MEDIUM" };
  }
  if (/(issue|bug|problem|ปัญหา|incident)/i.test(line)) {
    return { type: ProjectMemoryItemType.ISSUE, title: line.slice(0, 90), content: line, confidence: "MEDIUM" };
  }
  if (/(action|todo|task|follow up|owner|assignee|มอบหมาย|ดำเนินการ|ติดตาม)/i.test(line)) {
    return { type: ProjectMemoryItemType.ACTION, title: line.slice(0, 90), content: line, confidence: "MEDIUM" };
  }
  if (/(milestone|deadline|due|timeline|phase|go-live|กำหนด|ครบกำหนด|ส่งมอบ|เฟส)/i.test(line)) {
    return { type: ProjectMemoryItemType.MILESTONE, title: line.slice(0, 90), content: line, confidence: "MEDIUM" };
  }
  if (/(assumption|constraint|ข้อสมมติ|ข้อจำกัด)/i.test(line)) {
    return { type: ProjectMemoryItemType.ASSUMPTION, title: line.slice(0, 90), content: line, confidence: "MEDIUM" };
  }
  if (/(question|open point|pending|คำถาม|รอคำตอบ|ยังไม่ชัดเจน)/i.test(line)) {
    return { type: ProjectMemoryItemType.OPEN_QUESTION, title: line.slice(0, 90), content: line, confidence: "MEDIUM" };
  }

  const contractLikeSourceTypes = new Set<ProjectKnowledgeSourceType>([
    ProjectKnowledgeSourceType.TOR,
    ProjectKnowledgeSourceType.PROPOSAL,
    ProjectKnowledgeSourceType.CONTRACT
  ]);
  if (contractLikeSourceTypes.has(sourceType)) {
    if (/(deliverable|objective|วัตถุประสงค์|ส่งมอบ)/i.test(line)) {
      return { type: ProjectMemoryItemType.OVERVIEW, title: line.slice(0, 90), content: line, confidence: "MEDIUM" };
    }
  }

  return null;
};

export function extractProjectKnowledge(source: {
  sourceType: ProjectKnowledgeSourceType;
  title: string;
  contentText: string;
}): ExtractionJson {
  const lines = source.contentText
    .split(/\r?\n/)
    .map(normalizeLine)
    .filter((line) => line.length >= 5);

  const items: ExtractedMemoryItem[] = [];
  const overviewLines = lines
    .filter((line) => line.length >= 20)
    .slice(0, 4);

  uniquePush(items, {
    type: ProjectMemoryItemType.OVERVIEW,
    title: source.title,
    content: overviewLines.join(" ") || source.contentText.slice(0, 500),
    confidence: "MEDIUM"
  });

  for (const line of lines.slice(0, 220)) {
    const classified = classifyLine(line, source.sourceType);
    if (classified) {
      uniquePush(items, classified);
    }
  }

  return {
    overview: overviewLines.join(" ") || source.title,
    items: items.slice(0, 60),
    signals: {
      sourceType: source.sourceType,
      lineCount: lines.length,
      extractedAt: new Date().toISOString()
    }
  };
}

async function extractProjectKnowledgeWithAi(source: {
  sourceType: ProjectKnowledgeSourceType;
  title: string;
  contentText: string;
}) {
  const result = await generateWithLocalModel({
    prompt: buildProjectKnowledgeExtractionPrompt(source)
  });
  const extraction = parseAiExtractionJson(result.output, source.sourceType);

  if (!extraction) {
    throw new Error("AI_EXTRACTION_PARSE_FAILED");
  }

  if (!extraction.overview) {
    extraction.overview = source.title;
  }
  extraction.signals.lineCount = source.contentText.split(/\r?\n/).length;
  extraction.signals.extractedAt = new Date().toISOString();

  return {
    extraction,
    provider: result.provider,
    model: result.model
  };
}

export async function createProjectKnowledgeSource(input: {
  projectId: string;
  sourceType: ProjectKnowledgeSourceType;
  title: string;
  contentText: string;
  documentDate?: Date;
  versionLabel?: string;
  authorityLevel?: ProjectKnowledgeAuthorityLevel;
  user: TenantAuthUser;
}) {
  const project = await assertProjectKnowledgeAccess(input.projectId, input.user, "write");

  return prisma.projectKnowledgeSource.create({
    data: {
      tenantId: project.tenantId,
      projectId: project.id,
      sourceType: input.sourceType,
      title: input.title,
      contentText: input.contentText,
      documentDate: input.documentDate,
      versionLabel: input.versionLabel,
      authorityLevel: input.authorityLevel ?? ProjectKnowledgeAuthorityLevel.SUPPORTING,
      uploadedById: input.user.id
    },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
      _count: { select: { extractions: true, memoryItems: true } }
    }
  });
}

export async function listProjectKnowledgeSources(projectId: string, user: TenantAuthUser) {
  await assertProjectKnowledgeAccess(projectId, user, "read");

  return prisma.projectKnowledgeSource.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { id: true, name: true, email: true } },
      extractions: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      _count: { select: { memoryItems: true } }
    }
  });
}

export async function importProjectKnowledgeFromFile(input: {
  projectId: string;
  user: TenantAuthUser;
  fileName: string;
  buffer: Buffer;
  sourceType: ProjectKnowledgeSourceType;
  authorityLevel?: ProjectKnowledgeAuthorityLevel;
  versionLabel?: string;
  title?: string;
  documentDate?: Date;
}) {
  let contentText: string;

  try {
    contentText = await extractDocumentText(input.buffer, input.fileName);
  } catch (error) {
    if (error instanceof DocumentReadError) {
      throw new Error(error.code);
    }
    throw error;
  }

  const title = (input.title?.trim() || deriveTitleFromFileName(input.fileName)).slice(0, 180);
  const source = await createProjectKnowledgeSource({
    projectId: input.projectId,
    sourceType: input.sourceType,
    title,
    contentText,
    documentDate: input.documentDate,
    versionLabel: input.versionLabel,
    authorityLevel: input.authorityLevel,
    user: input.user
  });

  const extraction = await extractProjectKnowledgeSource(source.id, input.user);

  return { source, extraction };
}

export async function extractProjectKnowledgeSource(sourceId: string, user: TenantAuthUser) {
  const source = await prisma.projectKnowledgeSource.findUnique({
    where: { id: sourceId }
  });

  if (!source) {
    throw new Error("SOURCE_NOT_FOUND");
  }

  await assertProjectKnowledgeAccess(source.projectId, user, "write");

  let extraction = extractProjectKnowledge({
    sourceType: source.sourceType,
    title: source.title,
    contentText: source.contentText
  });
  let model = "deterministic-baseline-extractor";
  let promptVersion = "project-knowledge-onboarding-v1";

  try {
    const aiResult = await extractProjectKnowledgeWithAi({
      sourceType: source.sourceType,
      title: source.title,
      contentText: source.contentText
    });
    extraction = aiResult.extraction;
    model = `${aiResult.provider}:${aiResult.model}`;
    promptVersion = "project-knowledge-onboarding-v2-ai";
  } catch (error) {
    console.warn("[ProjectKnowledge] Falling back to heuristic extraction:", error);
  }

  return prisma.$transaction(async (tx) => {
    const created = await tx.projectKnowledgeExtraction.create({
      data: {
        sourceId: source.id,
        extractionJson: extraction as unknown as Prisma.InputJsonValue,
        confidence: extraction.items.length >= 5 ? "MEDIUM" : "LOW",
        model,
        promptVersion
      }
    });

    await tx.projectKnowledgeSource.update({
      where: { id: source.id },
      data: { status: ProjectKnowledgeSourceStatus.EXTRACTED }
    });

    return created;
  });
}

export async function approveProjectKnowledgeSource(sourceId: string, user: TenantAuthUser) {
  const source = await prisma.projectKnowledgeSource.findUnique({
    where: { id: sourceId },
    include: {
      extractions: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });

  if (!source) {
    throw new Error("SOURCE_NOT_FOUND");
  }

  await assertProjectKnowledgeAccess(source.projectId, user, "write");

  const extraction = source.extractions[0];
  if (!extraction) {
    throw new Error("EXTRACTION_REQUIRED");
  }

  const extractionJson = extraction.extractionJson as ExtractionJson;
  const items = Array.isArray(extractionJson.items) ? extractionJson.items : [];

  return prisma.$transaction(async (tx) => {
    await tx.projectMemoryItem.deleteMany({
      where: {
        sourceId: source.id,
        status: ProjectMemoryItemStatus.APPROVED
      }
    });

    const created = await Promise.all(items.map((item) =>
      tx.projectMemoryItem.create({
        data: {
          tenantId: source.tenantId,
          projectId: source.projectId,
          sourceId: source.id,
          type: item.type,
          title: item.title.slice(0, 180),
          content: item.content,
          status: ProjectMemoryItemStatus.APPROVED,
          effectiveDate: source.documentDate,
          approvedById: user.id,
          approvedAt: new Date(),
          metadataJson: {
            authorityLevel: source.authorityLevel,
            sourceType: source.sourceType,
            extractionId: extraction.id,
            confidence: item.confidence
          }
        }
      })
    ));

    const updatedSource = await tx.projectKnowledgeSource.update({
      where: { id: source.id },
      data: { status: ProjectKnowledgeSourceStatus.APPROVED }
    });

    return {
      source: updatedSource,
      memoryItemCount: created.length
    };
  });
}

export async function listProjectMemoryItems(projectId: string, user: TenantAuthUser) {
  await assertProjectKnowledgeAccess(projectId, user, "read");

  return prisma.projectMemoryItem.findMany({
    where: {
      projectId,
      status: ProjectMemoryItemStatus.APPROVED
    },
    orderBy: [{ type: "asc" }, { createdAt: "desc" }],
    include: {
      source: {
        select: {
          id: true,
          title: true,
          sourceType: true,
          authorityLevel: true,
          documentDate: true
        }
      },
      approvedBy: { select: { id: true, name: true, email: true } }
    }
  });
}

export async function getProjectKnowledgeBaseline(projectId: string, user: TenantAuthUser) {
  const project = await assertProjectKnowledgeAccess(projectId, user, "read");

  const [sourceCounts, memoryCounts, latestSource] = await Promise.all([
    prisma.projectKnowledgeSource.groupBy({
      by: ["status"],
      where: { projectId },
      _count: true
    }),
    prisma.projectMemoryItem.groupBy({
      by: ["type"],
      where: { projectId, status: ProjectMemoryItemStatus.APPROVED },
      _count: true
    }),
    prisma.projectKnowledgeSource.findFirst({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true }
    })
  ]);

  const approvedMemoryCount = memoryCounts.reduce((sum, row) => sum + row._count, 0);
  const coreMemoryTypes = new Set<ProjectMemoryItemType>([
    ProjectMemoryItemType.REQUIREMENT,
    ProjectMemoryItemType.SCOPE
  ]);
  const hasCoreContext = memoryCounts.some((row) => row.type === ProjectMemoryItemType.OVERVIEW) &&
    memoryCounts.some((row) => coreMemoryTypes.has(row.type));
  const needsReviewCount = sourceCounts
    .filter((row) => new Set<ProjectKnowledgeSourceStatus>([
      ProjectKnowledgeSourceStatus.UPLOADED,
      ProjectKnowledgeSourceStatus.EXTRACTED,
      ProjectKnowledgeSourceStatus.REVIEWED
    ]).has(row.status))
    .reduce((sum, row) => sum + row._count, 0);

  return {
    projectId: project.id,
    projectName: project.name,
    status: approvedMemoryCount === 0
      ? "NO_BASELINE"
      : hasCoreContext && needsReviewCount === 0
        ? "BASELINE_READY"
        : "NEEDS_REVIEW",
    approvedMemoryCount,
    needsReviewCount,
    sourceCounts: sourceCounts.map((row) => ({ status: row.status, count: row._count })),
    memoryCounts: memoryCounts.map((row) => ({ type: row.type, count: row._count })),
    lastUpdated: latestSource?.updatedAt ?? null
  };
}

export const projectKnowledgeErrors = {
  PROJECT_NOT_FOUND: "Project not found",
  FORBIDDEN_PROJECT_SCOPE: "Forbidden project scope",
  SOURCE_NOT_FOUND: "Knowledge source not found",
  EXTRACTION_REQUIRED: "Run extraction before approval",
  FILE_TOO_SHORT: "The extracted text is too short to create project knowledge.",
  PDF_NO_TEXT: "PDF text extraction failed. This PDF may be image-only or use unsupported encoding.",
  UNSUPPORTED_FILE_TYPE: "Unsupported file type.",
  DOCUMENT_READ_FAILED: "Document text extraction failed.",
  AI_EXTRACTION_PARSE_FAILED: "AI baseline extraction failed."
};
