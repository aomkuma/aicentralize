import { ActionItemPriority, ActionStatus, Prisma, SystemRole, UserRole } from "@prisma/client";
import { Request, Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import jwt, { JwtPayload } from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { ensureProjectScopeAccess } from "../services/accessScopeService";
import { buildProjectAiSupplementText } from "../services/projectAiContextService";
import { askMinutes, generateWithLocalModel, transcribeWithWhisper } from "../services/aiService";
import { MAX_PLAYGROUND_PROMPT_CHARS } from "../constants/aiLimits";
import { getSystemSettings } from "../services/systemSettingsService";
import { BRAND_FONT_HEAD_HTML, BRAND_TAILWIND_FONT_FAMILY } from "../lib/brandFonts";

export const aiRouter = Router();

const askSchema = z.object({
  question: z.string().min(3)
});

const promptPlaygroundSchema = z.object({
  prompt: z.string().min(1).max(MAX_PLAYGROUND_PROMPT_CHARS),
  model: z.string().min(1).default("qwen2.5:7b"),
  projectId: z.string().min(1).optional()
});

function resolveRequestedModel(model?: string): string | undefined {
  const normalized = model?.trim();
  if (!normalized || normalized === "qwen2.5:7b") {
    return undefined;
  }

  return normalized;
}

type AuthPayload = JwtPayload & {
  sub: string;
  role: UserRole;
  systemRole?: SystemRole;
  email: string;
};

type OptionalAuthUser = {
  id: string;
  role: UserRole;
  systemRole: SystemRole;
  email: string;
};

type AppLink = {
  label: string;
  url: string;
  type: "project" | "action" | "knowledge";
  sourceId: string;
  context?: string;
};

function parseOptionalAuthUser(req: Request): OptionalAuthUser | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    return {
      id: payload.sub,
      role: payload.role,
      systemRole: payload.systemRole ?? SystemRole.USER,
      email: payload.email
    };
  } catch {
    return null;
  }
}

function formatDateOnly(input: Date): string {
  return input.toISOString().slice(0, 10);
}

function isSelfTaskQuestion(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return [
    /งาน(?:ของ)?(?:ฉัน|ผม|เรา|ตัวเอง|ตัวฉัน|ตัวผม)/,
    /(?:ฉัน|ผม|เรา).{0,24}(?:รับผิดชอบ|ต้องทำ|ต้องโฟกัส|มีงาน|action|task)/,
    /(?:my|mine|me|myself).{0,24}(?:task|tasks|action|actions|work|assignment|assignments)/,
    /(?:task|tasks|action|actions|work|assignment|assignments).{0,24}(?:my|mine|me|myself)/
  ].some((pattern) => pattern.test(normalized));
}

function normalizeForTaskMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "").trim();
}

function taskMatchesPrompt(task: string, prompt: string): boolean {
  const taskNorm = normalizeForTaskMatch(task);
  const promptNorm = normalizeForTaskMatch(prompt);

  if (!taskNorm || taskNorm.length < 4) {
    return false;
  }

  if (promptNorm.includes(taskNorm)) {
    return true;
  }

  const quotedPhrases = [...prompt.matchAll(/["'「『]([^"'」』]{3,})["'」』]/g)]
    .map((match) => normalizeForTaskMatch(match[1]));

  return quotedPhrases.some((phrase) => phrase && (taskNorm.includes(phrase) || phrase.includes(taskNorm)));
}

function isActionItemExistenceQuestion(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return [
    /action\s*item/i,
    /มีงาน/,
    /งานนี้/,
    /งาน.*ไหม/,
    /มี.*ไหม/,
    /แค่มี/,
    /เสร็จ/,
    /\bdone\b/i,
    /\bcancel/i,
    /ยกเลิก/
  ].some((pattern) => pattern.test(normalized));
}

function extractRequestedPriority(prompt: string): ActionItemPriority | null {
  const normalized = prompt.toLowerCase();
  if (/\bcritical\b|วิกฤต|ด่วนมาก|เร่งด่วนมาก/.test(normalized)) {
    return ActionItemPriority.CRITICAL;
  }
  if (/\bhigh\b|ความสำคัญสูง|ด่วน|เร่งด่วน/.test(normalized)) {
    return ActionItemPriority.HIGH;
  }
  if (/\bmedium\b|ความสำคัญกลาง|ปานกลาง/.test(normalized)) {
    return ActionItemPriority.MEDIUM;
  }
  if (/\blow\b|ความสำคัญต่ำ|ไม่ด่วน/.test(normalized)) {
    return ActionItemPriority.LOW;
  }
  return null;
}

function isDueTodayQuestion(prompt: string): boolean {
  return /\btoday\b|วันนี้/.test(prompt.toLowerCase());
}

function getLocalTodayRange(): { gte: Date; lt: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { gte: start, lt: end };
}

const actionItemSnapshotSelect = {
  id: true,
  task: true,
  detail: true,
  status: true,
  priority: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
  source: true,
  assignee: {
    select: {
      name: true,
      email: true
    }
  }
} as const;

function formatActionItemSnapshotLine(
  item: {
    id: string;
    task: string;
    detail: string | null;
    status: string;
    priority: string;
    dueDate: Date;
    source: string;
    assignee: { name: string; email: string };
  },
  now: Date
): string {
  const overdueFlag = item.dueDate.getTime() < now.getTime() ? "OVERDUE" : "NOT_OVERDUE";
  const detail = item.detail?.trim() ? ` | detail=${item.detail.trim()}` : "";
  return `- id=${item.id} | owner=${item.assignee.name} <${item.assignee.email}> | due=${formatDateOnly(item.dueDate)} | status=${item.status} | priority=${item.priority} | source=${item.source} | overdue=${overdueFlag} | task=${item.task}${detail}`;
}

async function buildProjectContext(user: OptionalAuthUser, projectId: string, prompt: string): Promise<{ text: string; appLinks: AppLink[] } | null> {
  const access = await ensureProjectScopeAccess(
    { id: user.id, role: user.role, systemRole: user.systemRole },
    projectId
  );
  if (!access.allowed) {
    return null;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      code: true,
      name: true
    }
  });

  if (!project) {
    return null;
  }

  const selfTaskQuestion = isSelfTaskQuestion(prompt);
  const requestedPriority = extractRequestedPriority(prompt);
  const dueDateFilter = isDueTodayQuestion(prompt) ? getLocalTodayRange() : undefined;
  const actionItemScopeFilter: Prisma.ActionItemWhereInput = selfTaskQuestion ? { assigneeId: user.id } : {};
  const openActionItemWhere: Prisma.ActionItemWhereInput = {
    status: { notIn: [ActionStatus.DONE, ActionStatus.CANCELLED] },
    ...actionItemScopeFilter,
    ...(requestedPriority ? { priority: requestedPriority } : {}),
    ...(dueDateFilter ? { dueDate: dueDateFilter } : {}),
    projectId
  };

  const [actionItems, openMatchingCount, closedCandidates] = await Promise.all([
    prisma.actionItem.findMany({
      where: openActionItemWhere,
      select: actionItemSnapshotSelect,
      orderBy: [
        { dueDate: "asc" },
        { createdAt: "desc" }
      ],
      take: requestedPriority || dueDateFilter ? 120 : 40
    }),
    prisma.actionItem.count({
      where: openActionItemWhere
    }),
    prisma.actionItem.findMany({
      where: {
        status: { in: ["DONE", "CANCELLED"] },
        ...actionItemScopeFilter,
        projectId
      },
      select: actionItemSnapshotSelect,
      orderBy: { updatedAt: "desc" },
      take: 60
    })
  ]);

  const matchedClosedItems = closedCandidates.filter((item) => taskMatchesPrompt(item.task, prompt));
  const closedActionItems = matchedClosedItems.length > 0
    ? matchedClosedItems.slice(0, 15)
    : isActionItemExistenceQuestion(prompt)
      ? closedCandidates.slice(0, 15)
      : [];

  const generalNotes = await prisma.projectGeneralNote.findMany({
    where: { projectId },
    select: {
      id: true,
      title: true,
      content: true,
      visibility: true,
      createdAt: true,
      author: {
        select: {
          name: true,
          email: true
        }
      }
    },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  const now = new Date();
  const overdueItems = actionItems.filter((item) => item.dueDate.getTime() < now.getTime());
  const overdueCount = overdueItems.length;

  const owners = new Map<string, { open: number; overdue: number }>();
  for (const item of actionItems) {
    const key = `${item.assignee.name} <${item.assignee.email}>`;
    const current = owners.get(key) ?? { open: 0, overdue: 0 };
    current.open += 1;
    if (item.dueDate.getTime() < now.getTime()) {
      current.overdue += 1;
    }
    owners.set(key, current);
  }

  const ownerLines = Array.from(owners.entries())
    .sort((a, b) => b[1].overdue - a[1].overdue || b[1].open - a[1].open)
    .slice(0, 8)
    .map(([owner, stats]) => `- ${owner}: open=${stats.open}, overdue=${stats.overdue}`)
    .join("\n");

  const itemLines = actionItems
    .slice(0, 25)
    .map((item) => formatActionItemSnapshotLine(item, now))
    .join("\n");

  const closedItemLines = closedActionItems
    .map((item) => formatActionItemSnapshotLine(item, now))
    .join("\n");

  const generalNoteLines = generalNotes
    .map((note) => {
      const content = note.content.replace(/\s+/g, " ").trim();
      return `- visibility=${note.visibility} | title=${note.title} | author=${note.author.name} <${note.author.email}> | createdAt=${note.createdAt.toISOString()} | content=${content}`;
    })
    .join("\n");

  const supplementText = await buildProjectAiSupplementText(projectId);

  const priorityCounts = actionItems.reduce<Record<string, number>>((acc, item) => {
    acc[item.priority] = (acc[item.priority] ?? 0) + 1;
    return acc;
  }, {});
  const activeFilterParts = [
    requestedPriority ? `priority=${requestedPriority}` : "",
    dueDateFilter ? `due=today` : "",
    selfTaskQuestion ? "assignee=requester" : ""
  ].filter(Boolean);

  const text = [
    "PROJECT_SNAPSHOT (authoritative app data):",
    `- projectId: ${project.id}`,
    `- projectCode: ${project.code}`,
    `- projectName: ${project.name}`,
    `- requesterUserId: ${user.id}`,
    `- requesterEmail: ${user.email}`,
    `- actionItemScope: ${selfTaskQuestion ? "CURRENT_USER_ONLY" : "PROJECT_OPEN_ITEMS"}`,
    `- actionItemFilter: ${activeFilterParts.join(", ") || "open project items"}`,
    selfTaskQuestion
      ? "- scopeRule: The user asked about their own tasks, so this snapshot includes only action items assigned to the requester."
      : "- scopeRule: actionItems lists open project action items across owners.",
    "- scopeRuleClosed: closedActionItems lists completed/cancelled tasks when the question references them or asks whether a task exists.",
    `- openActionItems: ${openMatchingCount}`,
    `- closedActionItemsIncluded: ${closedActionItems.length}`,
    `- overdueActionItems: ${overdueCount}`,
    `- priorityCountsInListedActionItems: CRITICAL=${priorityCounts.CRITICAL ?? 0}, HIGH=${priorityCounts.HIGH ?? 0}, MEDIUM=${priorityCounts.MEDIUM ?? 0}, LOW=${priorityCounts.LOW ?? 0}`,
    "- ownersSummary:",
    ownerLines || "- (none)",
    "- actionItems (open only):",
    itemLines || "- (none)",
    "- closedActionItems:",
    closedItemLines || "- (none)",
    "- generalNotes:",
    generalNoteLines || "- (none)",
    "",
    "PROJECT_SUPPLEMENT (approved memory, meetings, risks, anonymized team pulse):",
    supplementText || "- (none)"
  ].join("\n");

  return {
    text,
    appLinks: [
      {
        label: "Open project continuity",
        url: `/continuity/${project.id}`,
        type: "project",
        sourceId: project.id,
        context: project.name
      },
      {
        label: "View open actions",
        url: `/continuity/${project.id}?tab=actions&status=open`,
        type: "action",
        sourceId: project.id,
        context: project.name
      },
      {
        label: "Open general notes",
        url: `/projects/${project.id}/notes`,
        type: "knowledge",
        sourceId: project.id,
        context: project.name
      }
    ]
  };
}

const transcribePlaygroundSchema = z.object({
  model: z.string().min(1).default("small"),
  language: z.string().min(1).default("th")
});

const speakerSegmentSchema = z.object({
  speaker: z.enum(["A", "B", "C"]),
  text: z.string().min(1),
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative().optional()
});

const analyzeSpeakerSchema = z.object({
  model: z.string().min(1).default("qwen2.5:7b"),
  language: z.string().optional(),
  segments: z.array(speakerSegmentSchema).default([])
});

function detectLanguageHint(text: string): string {
  if (/[\u0E00-\u0E7F]/.test(text)) {
    return "Thai";
  }

  if (/[\u4E00-\u9FFF]/.test(text)) {
    return "Chinese";
  }

  if (/[\u3040-\u30FF]/.test(text)) {
    return "Japanese";
  }

  if (/[\uAC00-\uD7AF]/.test(text)) {
    return "Korean";
  }

  if (/[\u0600-\u06FF]/.test(text)) {
    return "Arabic";
  }

  if (/[\u0400-\u04FF]/.test(text)) {
    return "Cyrillic-language";
  }

  return "English";
}

function buildLanguagePolicy(prompt: string): string {
  const preferredLanguage = detectLanguageHint(prompt);

  return [
    "Response policy:",
    `- Detected user language: ${preferredLanguage}`,
    `- Respond primarily in ${preferredLanguage}.`,
    "- Persona: you are Rubjob in English and รับจบ in Thai, a cheerful nerdy female AI assistant for loose ends, project status, overdue work, and things the team needs to follow through.",
    "- Your core job is to help users understand pending work, project state, decisions, risks, owners, deadlines, and next steps from project context.",
    "- Use a warm, upbeat, slightly nerdy tone without being silly or verbose.",
    "- Sound helpful and calm, never annoyed, scolding, sarcastic, or dismissive.",
    "- Short answers should still feel kind: in Thai, add a natural polite particle such as 'ค่ะ' when appropriate.",
    "- For Thai responses, use a natural female assistant voice with polite endings such as 'ค่ะ' when appropriate.",
    "- Keep tone friendly and practical for project managers in Meeting Intelligence workflow.",
    "- Avoid overly formal openings (for example: avoid 'เรียนคุณลูกค้า').",
    "- Answer the user's exact question first; do not force a generic meeting-summary structure.",
    "- If the user asks a narrow or factual question, answer narrowly in 1-3 short sentences when possible.",
    "- If the user asks for a short answer, keep it short even when project context is available.",
    "- Concise does not mean context-free: when answering with a number, status, yes/no, date, owner, or short conclusion, include the key evidence or examples that make the answer understandable.",
    "- For factual answers, give the direct answer first, then add a brief basis such as the relevant items, source note, meeting, date, owner, or caveat.",
    "- Do not make the user ask a second question just to know what your number, status, or conclusion refers to.",
    "- If information is missing, briefly say what is missing and suggest a helpful next step instead of giving a blunt refusal.",
    "- Use bullets only when the user asks for a list, summary, comparison, tasks, issues, or recommendations.",
    "- For action-item count questions, do not answer with only a number; state the scope/filter and list the counted items briefly.",
    "- If you give a count of action items, the number must match the listed items exactly.",
    "- For priority questions such as critical/high/medium/low, use the explicit priority field from project context.",
    "- If the user asks for today's action items, use explicit due dates from project context.",
    "- If details are needed, keep them short and directly tied to the question.",
    "- Do not use markdown emphasis syntax such as '**' or '###' in output text.",
    "- Use simple Thai that non-technical users can understand quickly.",
    "- Keep technical terms in other languages only when necessary for clarity.",
    "- Do not ask the user to switch language.",
    "- Do not switch to another language unless the user explicitly asks.",
    "- Keep the answer natural and concise."
  ].join("\n");
}

const recordingDir = path.join(process.cwd(), "uploads", "recordings");
fs.mkdirSync(recordingDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, recordingDir),
    filename: (_req, file, cb) => {
      const safeExt = path.extname(file.originalname || "").slice(0, 10) || ".webm";
      const random = Math.random().toString(36).slice(2, 10);
      cb(null, `${Date.now()}-${random}${safeExt}`);
    }
  }),
  limits: {
    fileSize: env.maxUploadBytes
  }
});

aiRouter.post("/ask", requireAuth, async (req, res) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const result = await askMinutes(parsed.data.question);
  res.json(result);
});

aiRouter.post("/playground/generate", async (req, res) => {
  const parsed = promptPlaygroundSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const settings = await getSystemSettings();
  const configuredMax = settings.ai.generation.maxPromptChars;
  if (parsed.data.prompt.length > configuredMax) {
    return res.status(400).json({
      message: `Prompt exceeds configured limit of ${configuredMax.toLocaleString()} characters`
    });
  }

  try {
    const authUser = parseOptionalAuthUser(req);
    if (parsed.data.projectId && !authUser) {
      return res.status(401).json({ message: "Authentication required for project-scoped AI" });
    }

    const projectContext = authUser && parsed.data.projectId
      ? await buildProjectContext(authUser, parsed.data.projectId, parsed.data.prompt)
      : null;

    const groundedInstructions = [
      "Grounding policy:",
      "- If PROJECT_SNAPSHOT is provided, treat it as source of truth for project task status.",
      "- Answer using the snapshot fields directly, especially overdue and owner-related counts.",
      "- actionItems contains open tasks only. closedActionItems contains completed/cancelled tasks relevant to the question.",
      "- A task may appear only in closedActionItems if it is already done or cancelled.",
      "- Manual tasks created outside meetings still appear in the snapshot when they belong to the project.",
      "- PROJECT_SUPPLEMENT includes approved project memory, meeting catalog, minute risks/open questions, general notes, and anonymized team pulse aggregates.",
      "- anonymizedTeamPulse and tenantCommunicationMood never include raw feeling-log text or author identity.",
      "- generalNotes may include PUBLIC and PRIVATE visibility.",
      "- If actionItemScope is CURRENT_USER_ONLY, answer only about tasks assigned to the requester.",
      "- Never present another owner's task as the requester's own task.",
      "- If actionItemScope is CURRENT_USER_ONLY and actionItems is empty, say the requester currently has no open tasks in this project.",
      "- If a requested fact is not in snapshot, say it is unavailable instead of inventing.",
      "- Concise answers still need enough context to be useful: for numbers, status, yes/no, dates, owners, or conclusions, include the brief basis from the snapshot.",
      "- Do not answer with a bare number, bare status, or bare conclusion when the snapshot contains the details behind it.",
      "- For action-item count questions, do not answer with only a number. State the scope/filter and list the counted tasks briefly.",
      "- Any action-item count you give must exactly match the tasks you list in the response.",
      "- For critical/high/medium/low questions, use the explicit priority field only.",
      "- Match the output format to the question. Do not use a fixed section order unless the user asks for an overview or report.",
      "- For narrow questions, answer only the requested fact plus one caveat if needed.",
      "- For overview/report questions, use concise bullets with short PM follow-up points.",
      "- Keep the response concise and practical."
    ].join("\n");

    const guidedPrompt = [
      buildLanguagePolicy(parsed.data.prompt),
      groundedInstructions,
      projectContext ? projectContext.text : "PROJECT_SNAPSHOT: (not provided)",
      "User question:",
      parsed.data.prompt
    ].join("\n\n");

    const data = await generateWithLocalModel({
      model: resolveRequestedModel(parsed.data.model),
      prompt: guidedPrompt,
      personaScope: {
        projectId: parsed.data.projectId,
        userId: authUser?.id
      }
    });

    if (authUser) {
      try {
        await prisma.askAiQueryLog.create({
          data: {
            userId: authUser.id,
            projectId: parsed.data.projectId,
            question: parsed.data.prompt,
            answer: data.output,
            confidence: "medium",
            model: data.model,
            retrievedEvidenceIds: [],
            usedEvidenceJson: [],
            retrievalDebugJson: {
              source: "PLAYGROUND_CHAT",
              grounded: Boolean(projectContext)
            }
          }
        });
      } catch {
        // Do not fail generate response when history log write fails.
      }
    }

    return res.json({
      model: data.model,
      output: data.output,
      appLinks: []
    });
  } catch (error) {
    return res.status(502).json({
      message: "Cannot connect to local Ollama server",
      detail: error instanceof Error ? error.message : "unknown error"
    });
  }
});

aiRouter.post("/playground/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Missing audio file" });
  }

  const parsed = transcribePlaygroundSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  try {
    const settings = await getSystemSettings();
    const whisperAllowed =
      settings.ai.asrMode !== "browser" &&
      settings.ai.whisper.enabled &&
      settings.integrations.whisperEnabled;

    if (!whisperAllowed) {
      return res.status(403).json({
        message: "Whisper transcription is disabled by system settings",
        detail: {
          asrMode: settings.ai.asrMode,
          whisperEnabled: settings.ai.whisper.enabled,
          whisperIntegrationEnabled: settings.integrations.whisperEnabled
        }
      });
    }

    const result = await transcribeWithWhisper({
      audioPath: req.file.path,
      model: parsed.data.model,
      language: parsed.data.language
    });

    return res.json({
      model: result.model,
      language: result.language,
      languageProbability: result.language_probability,
      transcript: result.transcript,
      segmentCount: result.segment_count,
      segments: result.segments,
      fileName: req.file.filename,
      fileUrl: `/ai/playground/recordings/${encodeURIComponent(req.file.filename)}`
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    const unavailable = /Whisper runtime is not available/i.test(detail);

    return res.status(unavailable ? 503 : 502).json({
      message: unavailable ? "Whisper transcription unavailable" : "Whisper transcription failed",
      code: unavailable ? "WHISPER_UNAVAILABLE" : "WHISPER_FAILED",
      detail
    });
  }
});

aiRouter.post("/playground/record/upload", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Missing audio file" });
  }

  return res.status(201).json({
    fileName: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    fileUrl: `/ai/playground/recordings/${encodeURIComponent(req.file.filename)}`
  });
});

aiRouter.get("/playground/recordings/:fileName", async (req, res) => {
  const fileName = path.basename(req.params.fileName);
  const fullPath = path.join(recordingDir, fileName);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ message: "Recording not found" });
  }

  return res.sendFile(fullPath);
});

aiRouter.post("/playground/diarize-analyze", async (req, res) => {
  const parsed = analyzeSpeakerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const merged: Array<{
    speaker: "A" | "B" | "C";
    text: string;
    startMs?: number;
    endMs?: number;
  }> = [];
  const maxTurnGapMs = 2600;
  for (const seg of parsed.data.segments) {
    const segStart = typeof seg.startMs === "number" ? seg.startMs : undefined;
    const segEnd = typeof seg.endMs === "number" ? seg.endMs : segStart;
    const last = merged[merged.length - 1];
    const canMergeByGap =
      typeof segStart !== "number" ||
      typeof last?.endMs !== "number" ||
      segStart - last.endMs <= maxTurnGapMs;

    if (last && last.speaker === seg.speaker && canMergeByGap) {
      last.text = `${last.text} ${seg.text}`.trim();
      if (typeof segEnd === "number") {
        last.endMs = typeof last.endMs === "number" ? Math.max(last.endMs, segEnd) : segEnd;
      }
    } else {
      merged.push({
        speaker: seg.speaker,
        text: seg.text.trim(),
        startMs: segStart,
        endMs: segEnd
      });
    }
  }

  const formatOffset = (ms?: number): string => {
    if (typeof ms !== "number" || ms < 0) {
      return "--:--:--";
    }
    const totalSeconds = Math.floor(ms / 1000);
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  const transcript = merged
    .map((s) => {
      const from = formatOffset(s.startMs);
      const to = formatOffset(s.endMs);
      return `[${from} - ${to}] Speaker ${s.speaker}: ${s.text}`;
    })
    .join("\n");
  if (!transcript) {
    return res.json({
      transcript: "",
      summary: "No speech segments captured yet."
    });
  }

  const prompt = [
    "You are a meeting assistant.",
    "Given transcript with Speaker A/B/C, provide:",
    "1) concise summary",
    "2) key decisions",
    "3) action items with owner speaker labels",
    "Answer in Thai.",
    parsed.data.language ? `Language hint: ${parsed.data.language}` : "",
    "",
    transcript
  ].filter(Boolean).join("\n");

  try {
    const authUser = parseOptionalAuthUser(req);

    const data = await generateWithLocalModel({
      model: resolveRequestedModel(parsed.data.model),
      prompt,
      personaScope: { userId: authUser?.id }
    });

    return res.json({
      transcript,
      summary: data.output
    });
  } catch (error) {
    return res.status(502).json({
      message: "AI generation failed",
      detail: error instanceof Error ? error.message : "unknown error",
      transcript
    });
  }
});

aiRouter.get("/playground/page.js", (_req, res) => {
  res.type("application/javascript").send(`const promptEl = document.getElementById("prompt");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");
const sendBtn = document.getElementById("send");
const clearBtn = document.getElementById("clear");
const startRecBtn = document.getElementById("startRec");
const stopRecBtn = document.getElementById("stopRec");
const analyzeRecBtn = document.getElementById("analyzeRec");
const recStatusEl = document.getElementById("recordingStatus");
const transcriptEl = document.getElementById("speakerTranscript");
const audioInfoEl = document.getElementById("audioInfo");
const promptScreenEl = document.getElementById("promptScreen");
const recordScreenEl = document.getElementById("recordScreen");
const screenTabs = Array.from(document.querySelectorAll("[data-screen-tab]"));
const menuToggleEl = document.getElementById("menuToggle");
const mobileMenuEl = document.getElementById("mobileMenu");
const menuBackdropEl = document.getElementById("menuBackdrop");
const menuIconOpenEl = document.getElementById("menuIconOpen");
const menuIconCloseEl = document.getElementById("menuIconClose");
const DEFAULT_MODEL = "qwen2.5:7b";

let statusTimer = null;
let typingTimer = null;
let mediaRecorder = null;
let mediaStream = null;
let recognition = null;
let isRecording = false;
let audioChunks = [];
let segments = [];
let recordingStart = 0;
let recordingWallStart = 0;
let audioContext = null;
let micSource = null;
let analyserNode = null;
let analysisTimer = null;
let timeDomainData = null;
let freqData = null;
let voiceFrames = [];
let speakerProfiles = {};
let autoSpeakerIndex = 0;
let lastSegmentAt = 0;
let lastAssignedSpeaker = null;
let lastSpeakerSwitchAt = 0;
const sameSpeakerHoldMs = 7000;
const switchCooldownMs = 10000;
const strongSwitchDist = 0.4;
const strongSwitchMargin = 0.28;

function setStatus(text) {
  statusEl.textContent = text || "";
}

function setBusy(isBusy) {
  sendBtn.disabled = isBusy;
  sendBtn.textContent = isBusy ? "Generating..." : "Generate";
  if (isBusy) {
    resultEl.classList.add("loading");
    statusEl.classList.add("busy");
  } else {
    resultEl.classList.remove("loading");
    statusEl.classList.remove("busy");
  }
}

function setRecordingControls(recording) {
  if (recording) {
    startRecBtn.classList.add("hidden");
    stopRecBtn.classList.remove("hidden");
  } else {
    stopRecBtn.classList.add("hidden");
    startRecBtn.classList.remove("hidden");
  }
}

function setActiveScreen(screen) {
  const showPrompt = screen === "prompt";
  promptScreenEl.classList.toggle("hidden", !showPrompt);
  recordScreenEl.classList.toggle("hidden", showPrompt);

  screenTabs.forEach((btn) => {
    const active = btn.dataset.screenTab === screen;
    btn.classList.toggle("bg-blue-600", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("border-blue-600", active);
    btn.classList.toggle("bg-white", !active);
    btn.classList.toggle("text-slate-600", !active);
  });
}

function setupMobileMenu() {
  if (!menuToggleEl || !mobileMenuEl || !menuIconOpenEl || !menuIconCloseEl || !menuBackdropEl) {
    return;
  }

  const setOpen = (open) => {
    mobileMenuEl.classList.toggle("-translate-x-full", !open);
    menuBackdropEl.classList.toggle("hidden", !open);
    menuIconOpenEl.classList.toggle("hidden", open);
    menuIconCloseEl.classList.toggle("hidden", !open);
    menuToggleEl.setAttribute("aria-expanded", String(open));
  };

  setOpen(false);
  menuToggleEl.addEventListener("click", () => {
    const isOpen = !mobileMenuEl.classList.contains("-translate-x-full");
    setOpen(!isOpen);
  });

  menuBackdropEl.addEventListener("click", () => setOpen(false));
  document.querySelectorAll("[data-mobile-nav-link]").forEach((el) => {
    el.addEventListener("click", () => setOpen(false));
  });
}

function startStatusPulse() {
  const frames = ["Generating", "Generating.", "Generating..", "Generating..."];
  let idx = 0;
  setStatus(frames[idx]);
  statusTimer = setInterval(() => {
    idx = (idx + 1) % frames.length;
    setStatus(frames[idx]);
  }, 260);
}

function stopStatusPulse(finalText) {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  setStatus(finalText || "");
}

function stopTyping() {
  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;
  }
}

function typewrite(text, onDone) {
  stopTyping();
  resultEl.textContent = "";
  const chars = Array.from(text || "");
  if (!chars.length) {
    onDone();
    return;
  }

  const step = Math.max(1, Math.floor(chars.length / 220));
  let i = 0;
  typingTimer = setInterval(() => {
    i += step;
    resultEl.textContent = chars.slice(0, i).join("");
    if (i >= chars.length) {
      stopTyping();
      onDone();
    }
  }, 12);
}

function calculateRms(samples) {
  if (!samples || !samples.length) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i] || 0;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

function calculateSpectralCentroid(freq, sampleRate) {
  if (!freq || !freq.length) {
    return 0;
  }
  let weighted = 0;
  let total = 0;
  const binHz = sampleRate / 2 / freq.length;
  for (let i = 0; i < freq.length; i += 1) {
    const mag = freq[i] || 0;
    total += mag;
    weighted += mag * i * binHz;
  }
  if (!total) {
    return 0;
  }
  return weighted / total;
}

function startVoiceAnalysis(stream) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return;
    }

    audioContext = new Ctx();
    micSource = audioContext.createMediaStreamSource(stream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.75;
    micSource.connect(analyserNode);

    timeDomainData = new Float32Array(analyserNode.fftSize);
    freqData = new Uint8Array(analyserNode.frequencyBinCount);

    analysisTimer = setInterval(() => {
      if (!analyserNode || !timeDomainData || !freqData) {
        return;
      }
      analyserNode.getFloatTimeDomainData(timeDomainData);
      analyserNode.getByteFrequencyData(freqData);

      const energy = calculateRms(timeDomainData);
      if (energy < 0.012) {
        return;
      }

      const centroid = calculateSpectralCentroid(freqData, audioContext.sampleRate || 48000);
      voiceFrames.push({ ts: Date.now(), energy, centroid });
      if (voiceFrames.length > 160) {
        voiceFrames = voiceFrames.slice(-160);
      }
    }, 120);
  } catch {
    // Keep recorder functional even if voice feature extraction is unavailable.
  }
}

function stopVoiceAnalysis() {
  if (analysisTimer) {
    clearInterval(analysisTimer);
    analysisTimer = null;
  }
  if (micSource) {
    try { micSource.disconnect(); } catch {}
  }
  if (analyserNode) {
    try { analyserNode.disconnect(); } catch {}
  }
  micSource = null;
  analyserNode = null;
  timeDomainData = null;
  freqData = null;
  if (audioContext) {
    try { audioContext.close(); } catch {}
    audioContext = null;
  }
}

function getRecentVoiceFeature(nowMs) {
  const windowMs = 1400;
  const recent = voiceFrames.filter((f) => nowMs - f.ts <= windowMs);
  if (!recent.length) {
    return null;
  }
  let energy = 0;
  let centroid = 0;
  for (const r of recent) {
    energy += r.energy;
    centroid += r.centroid;
  }
  return {
    energy: energy / recent.length,
    centroid: centroid / recent.length
  };
}

function updateSpeakerProfile(speaker, feature, nowMs) {
  const prev = speakerProfiles[speaker];
  if (!prev) {
    speakerProfiles[speaker] = {
      energy: feature.energy,
      centroid: feature.centroid,
      count: 1,
      lastSeen: nowMs
    };
    return;
  }
  const n = Math.min(prev.count + 1, 12);
  speakerProfiles[speaker] = {
    energy: (prev.energy * (n - 1) + feature.energy) / n,
    centroid: (prev.centroid * (n - 1) + feature.centroid) / n,
    count: n,
    lastSeen: nowMs
  };
}

function assignSpeaker(speaker, feature, nowMs) {
  if (feature) {
    updateSpeakerProfile(speaker, feature, nowMs);
  }
  if (lastAssignedSpeaker !== speaker) {
    lastSpeakerSwitchAt = nowMs;
  }
  lastAssignedSpeaker = speaker;
  lastSegmentAt = nowMs;
  return speaker;
}

function chooseSpeakerByVoice(nowMs) {
  const feature = getRecentVoiceFeature(nowMs);
  if (!feature) {
    if (lastAssignedSpeaker && nowMs - lastSegmentAt <= sameSpeakerHoldMs) {
      return assignSpeaker(lastAssignedSpeaker, null, nowMs);
    }
    return assignSpeaker(nextAutoSpeaker(nowMs), null, nowMs);
  }

  const labels = ["A", "B", "C"];
  let bestSpeaker = null;
  let bestDist = Number.POSITIVE_INFINITY;
  const distances = {};
  const centroidScale = 2400;
  const energyScale = 0.12;

  for (const label of labels) {
    const p = speakerProfiles[label];
    if (!p) {
      continue;
    }
    const dCentroid = Math.abs(feature.centroid - p.centroid) / centroidScale;
    const dEnergy = Math.abs(feature.energy - p.energy) / energyScale;
    const dist = dCentroid + dEnergy;
    distances[label] = dist;
    if (dist < bestDist) {
      bestDist = dist;
      bestSpeaker = label;
    }
  }

  const threshold = 0.78;
  if (bestSpeaker && bestDist <= threshold) {
    if (lastAssignedSpeaker && bestSpeaker !== lastAssignedSpeaker) {
      const sinceSwitch = nowMs - lastSpeakerSwitchAt;
      const currentDist = distances[lastAssignedSpeaker];
      const isStrongSwitch =
        bestDist <= strongSwitchDist &&
        (typeof currentDist !== "number" || currentDist - bestDist >= strongSwitchMargin);

      if (sinceSwitch < switchCooldownMs && !isStrongSwitch) {
        return assignSpeaker(lastAssignedSpeaker, feature, nowMs);
      }
    }
    return assignSpeaker(bestSpeaker, feature, nowMs);
  }

  for (const label of labels) {
    if (!speakerProfiles[label]) {
      return assignSpeaker(label, feature, nowMs);
    }
  }

  if (lastAssignedSpeaker && nowMs - lastSegmentAt <= sameSpeakerHoldMs) {
    return assignSpeaker(lastAssignedSpeaker, feature, nowMs);
  }

  const fallback = bestSpeaker || nextAutoSpeaker(nowMs);
  return assignSpeaker(fallback, feature, nowMs);
}

function nextAutoSpeaker(nowMs) {
  if (!lastSegmentAt) {
    lastSegmentAt = nowMs;
    return ["A", "B", "C"][autoSpeakerIndex];
  }

  const gap = nowMs - lastSegmentAt;
  // Rotate assumed speaker when there is a longer pause between utterances.
  if (gap > 4200) {
    autoSpeakerIndex = (autoSpeakerIndex + 1) % 3;
  }
  lastSegmentAt = nowMs;
  return ["A", "B", "C"][autoSpeakerIndex];
}

function renderSegments() {
  if (!segments.length) {
    transcriptEl.value = "";
    return;
  }

  const turns = buildTurns(segments);
  transcriptEl.value = turns
    .map((t) => {
      const from = formatWallClock(t.startMs);
      const to = formatWallClock(t.endMs);
      const durationSec = Math.max(0, (t.endMs - t.startMs) / 1000);
      return from + " - " + to + " | Speaker " + t.speaker + " (" + durationSec.toFixed(1) + "s): " + t.text;
    })
    .join("\\n");
}

function parseEditedTranscript() {
  const raw = (transcriptEl.value || "").trim();
  if (!raw) {
    return [];
  }

  const lines = raw.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);
  const parsed = [];
  const speakerLinePattern = new RegExp("^(?:\\\\d{2}:\\\\d{2}:\\\\d{2}\\\\s*-\\\\s*\\\\d{2}:\\\\d{2}:\\\\d{2}\\\\s*\\\\|\\\\s*)?Speaker\\\\s*([ABC])(?:\\\\s*\\\\([^)]*\\\\))?\\\\s*:\\\\s*(.+)$", "i");
  for (const line of lines) {
    const m = line.match(speakerLinePattern);
    if (m) {
      parsed.push({
        speaker: m[1].toUpperCase(),
        text: (m[2] || "").trim()
      });
      continue;
    }

    // Fallback: assume untagged line belongs to current inferred speaker.
    parsed.push({
      speaker: "A",
      text: line
    });
  }

  return parsed.filter((item) => item.text);
}

function formatWallClock(offsetMs) {
  if (!recordingWallStart) {
    return "--:--:--";
  }
  const dt = new Date(recordingWallStart + Math.max(0, offsetMs || 0));
  return dt.toTimeString().slice(0, 8);
}

function buildTurns(items) {
  const turns = [];
  const maxTurnGapMs = 2600;
  for (const seg of items) {
    const startMs = typeof seg.startMs === "number" ? seg.startMs : 0;
    const endMs = typeof seg.endMs === "number" ? seg.endMs : startMs;
    const last = turns[turns.length - 1];
    const isContinuous =
      last &&
      last.speaker === seg.speaker &&
      startMs - last.endMs <= maxTurnGapMs;

    if (isContinuous) {
      last.endMs = Math.max(last.endMs, endMs);
      last.text = (last.text + " " + seg.text).trim();
      continue;
    }

    turns.push({
      speaker: seg.speaker,
      text: seg.text,
      startMs,
      endMs
    });
  }
  return turns;
}

function addSegment(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return;
  }
  const now = Date.now();
  const startMs = Math.max(0, now - recordingStart - 800);
  const endMs = Math.max(startMs, now - recordingStart);
  const speaker = chooseSpeakerByVoice(now);
  segments.push({ speaker, text: trimmed, startMs, endMs });
  renderSegments();
}

function cleanupRecognition() {
  if (recognition) {
    try { recognition.stop(); } catch {}
    recognition = null;
  }
}

function startSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    recStatusEl.textContent = "Recording audio only (browser has no speech recognition API).";
    return;
  }

  recognition = new SR();
  recognition.lang = "th-TH";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const r = event.results[i];
      if (!r.isFinal) continue;
      const text = r[0] && r[0].transcript ? r[0].transcript : "";
      addSegment(text);
    }
  };

  recognition.onerror = (event) => {
    recStatusEl.textContent = "Speech recognition warning: " + event.error;
  };

  recognition.onend = () => {
    if (isRecording) {
      try { recognition.start(); } catch {}
    }
  };

  try {
    recognition.start();
  } catch {}
}

async function uploadAudio(blob) {
  const fd = new FormData();
  fd.append("audio", blob, "meeting-" + Date.now() + ".webm");
  const response = await fetch("/ai/playground/record/upload", {
    method: "POST",
    body: fd
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Audio upload failed");
  }
  return data;
}

async function analyzeSegments() {
  const model = DEFAULT_MODEL;
  const turns = buildTurns(segments);
  const response = await fetch("/ai/playground/diarize-analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, segments: turns, language: "Thai" })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || data.message || "Analyze failed");
  }
  return data;
}

async function startRecording() {
  if (isRecording) return;
  setRecordingControls(true);
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(mediaStream);
    audioChunks = [];
    segments = [];
    voiceFrames = [];
    speakerProfiles = {};
    autoSpeakerIndex = 0;
    lastSegmentAt = 0;
    lastAssignedSpeaker = null;
    lastSpeakerSwitchAt = 0;
    renderSegments();
    recordingStart = Date.now();
    recordingWallStart = recordingStart;
    startVoiceAnalysis(mediaStream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start(300);
    isRecording = true;
    recStatusEl.textContent = "Recording... auto speaker grouping is running.";
    startSpeechRecognition();
  } catch (error) {
    setRecordingControls(false);
    recStatusEl.textContent = error instanceof Error ? error.message : "Cannot start recording";
  }
}

async function stopRecording() {
  if (!isRecording || !mediaRecorder) return;

  isRecording = false;
  setRecordingControls(false);
  recStatusEl.textContent = "Stopping...";
  cleanupRecognition();
  stopVoiceAnalysis();

  await new Promise((resolve) => {
    mediaRecorder.onstop = resolve;
    mediaRecorder.stop();
  });

  mediaStream.getTracks().forEach((t) => t.stop());
  const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

  try {
    const uploaded = await uploadAudio(audioBlob);
    audioInfoEl.textContent = "Saved: " + uploaded.fileName + " (" + Math.round(uploaded.size / 1024) + " KB)";
    recStatusEl.textContent = "Recording completed. Edit transcript if needed, then click Analyze Transcript.";
  } catch (error) {
    recStatusEl.textContent = error instanceof Error ? error.message : "Failed to process recording";
  }
}

async function analyzeRecordingTranscript() {
  try {
    const edited = parseEditedTranscript();
    if (!edited.length) {
      throw new Error("Please add transcript lines before analyze");
    }

    recStatusEl.textContent = "Analyzing transcript with Qwen...";
    segments = edited.map((item) => ({
      speaker: item.speaker,
      text: item.text
    }));

    const analyzed = await analyzeSegments();
    promptEl.value = analyzed.transcript || "";
    setActiveScreen("prompt");
    stopTyping();
    typewrite(analyzed.summary || "", () => setStatus("Done"));
    recStatusEl.textContent = "Transcript analyzed.";
  } catch (error) {
    recStatusEl.textContent = error instanceof Error ? error.message : "Analyze failed";
  }
}

async function generate() {
  const prompt = promptEl.value.trim();
  const model = DEFAULT_MODEL;
  if (!prompt) {
    setStatus("Please enter a prompt first.");
    return;
  }

  stopTyping();
  setBusy(true);
  startStatusPulse();
  resultEl.textContent = "";

  try {
    const response = await fetch("/ai/playground/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, model })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || data.message || "Request failed");
    }

    const text = data.output || "(no output)";
    typewrite(text, () => stopStatusPulse("Done"));
  } catch (error) {
    resultEl.textContent = "";
    stopStatusPulse(error instanceof Error ? error.message : "Failed to generate response");
  } finally {
    setBusy(false);
  }
}

startRecBtn.addEventListener("click", startRecording);
stopRecBtn.addEventListener("click", stopRecording);
analyzeRecBtn.addEventListener("click", analyzeRecordingTranscript);
sendBtn.addEventListener("click", generate);
clearBtn.addEventListener("click", () => {
  stopTyping();
  stopStatusPulse("");
  promptEl.value = "";
  resultEl.textContent = "Ready.";
  segments = [];
  recordingWallStart = 0;
  voiceFrames = [];
  speakerProfiles = {};
  autoSpeakerIndex = 0;
  lastSegmentAt = 0;
  lastAssignedSpeaker = null;
  lastSpeakerSwitchAt = 0;
  setRecordingControls(false);
  renderSegments();
  recStatusEl.textContent = "";
  audioInfoEl.textContent = "";
  setBusy(false);
  promptEl.focus();
});

promptEl.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    generate();
  }
});

screenTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveScreen(btn.dataset.screenTab || "prompt");
  });
});

setRecordingControls(false);
renderSegments();
setActiveScreen("prompt");
setupMobileMenu();
`);
});

aiRouter.get("/playground/page", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Prompt Playground</title>
  ${BRAND_FONT_HEAD_HTML}
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            ${BRAND_TAILWIND_FONT_FAMILY}
          },
          colors: {
            deep: "#13233f",
            mint: "#14a37f"
          },
          boxShadow: {
            panel: "0 30px 80px rgba(19, 35, 63, 0.12)",
            card: "0 16px 35px rgba(19, 35, 63, 0.10)"
          }
        }
      },
      darkMode: "class"
    };
  </script>
  <script>
    (function () {
      const storageKey = "theme-preference";
      const stored = localStorage.getItem(storageKey);
      const preference = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
      const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const useDark = preference === "dark" || (preference === "system" && systemDark);

      document.documentElement.classList.toggle("dark", useDark);
      document.documentElement.style.colorScheme = useDark ? "dark" : "light";
    })();
  </script>
  <style>
    body {
      background-color: #ffffff;
    }

    html.dark body {
      background-color: #020617;
      color: #e2e8f0;
    }

    .result.loading {
      background: linear-gradient(110deg, #eef5f6 8%, #ddebed 18%, #eef5f6 33%);
      background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite;
    }

    html.dark .result.loading {
      background: linear-gradient(110deg, #0f172a 8%, #1e293b 18%, #0f172a 33%);
      background-size: 200% 100%;
    }

    @keyframes shimmer {
      to {
        background-position-x: -200%;
      }
    }
  </style>
</head>
<body class="font-sans antialiased bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
  <button id="menuToggle" type="button" class="fixed top-4 left-4 z-50 grid h-10 w-10 place-items-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 lg:hidden" aria-controls="mobileMenu" aria-expanded="false" aria-label="Open navigation menu">
    <svg id="menuIconOpen" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
    <svg id="menuIconClose" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="hidden h-5 w-5">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  </button>

  <aside id="mobileMenu" class="fixed left-0 top-0 z-40 h-screen w-64 -translate-x-full border-r border-gray-200 bg-white p-4 shadow-xl transition-transform duration-300 dark:border-slate-700 dark:bg-slate-900 lg:translate-x-0">
    <div class="mb-4 flex items-center gap-3 border-b border-gray-200 pb-4 dark:border-slate-700">
      <div class="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-lg font-extrabold text-white">A</div>
      <div>
        <p class="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">Kora</p>
        <p class="text-xs text-gray-500 dark:text-slate-400">Meeting Intelligence Platform</p>
      </div>
    </div>

    <nav class="space-y-2 text-sm font-semibold">
      <a data-mobile-nav-link href="/dashboard" class="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-700 transition hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">Your Organizations</a>
      <a data-mobile-nav-link href="/setup" class="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-700 transition hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">Welcome to Kora</a>
      <a data-mobile-nav-link href="/ai/playground/page" class="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-blue-700 dark:bg-blue-900/25 dark:text-blue-300">AI Playground</a>
      <a data-mobile-nav-link href="/docs" class="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-700 transition hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">API Docs</a>
      <a data-mobile-nav-link href="/health" class="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-700 transition hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-800">Health</a>
    </nav>
  </aside>

  <div id="menuBackdrop" class="fixed inset-0 z-30 hidden bg-black/50 lg:hidden"></div>

  <div class="lg:ml-64">
    <header class="sticky top-0 z-20 border-b border-gray-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-950/90 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between gap-3">
        <div class="pl-12 lg:pl-0">
          <p class="text-xs uppercase tracking-[0.12em] font-semibold text-gray-500 dark:text-slate-400">Kora</p>
          <h1 class="font-display text-xl font-extrabold text-gray-900 dark:text-white">AI Prompt Playground</h1>
        </div>

        <div class="hidden items-center gap-2 md:flex">
          <a href="/dashboard" class="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Your Organizations</a>
          <a href="/setup" class="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">Welcome to Kora</a>
          <a href="/ai/playground/page" class="rounded-md border border-blue-500 bg-blue-50 px-3 py-1.5 text-sm font-semibold text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300">AI Playground</a>
          <a href="/docs" class="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">API Docs</a>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-6xl px-3 pb-12 pt-6 sm:px-6 lg:px-8">
    <section class="mt-1">
      <h1 class="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">AI Prompt Playground</h1>
      <p class="mt-1 text-base text-gray-600 dark:text-slate-400">Record, diarize, and generate with local models</p>
    </section>

    <section class="mt-4 flex flex-wrap gap-2">
      <button type="button" data-screen-tab="prompt" class="rounded-lg border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Text Prompt</button>
      <button type="button" data-screen-tab="record" class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">Record & Transcript</button>
    </section>

    <section id="promptScreen" class="mt-6 grid gap-4 lg:grid-cols-2">
      <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5">
        <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-slate-300" for="prompt">Prompt</label>
        <textarea id="prompt" placeholder="Ask anything..." class="min-h-[260px] w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed text-gray-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"></textarea>

        <div class="mt-3 flex flex-wrap gap-2">
          <button id="send" class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700">Generate</button>
          <button id="clear" class="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">Clear</button>
        </div>
      </div>

      <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5">
        <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-slate-300">Result</label>
        <div id="result" class="result max-h-[62vh] min-h-[360px] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-sm leading-relaxed text-gray-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100">Ready.</div>
        <div id="status" class="mt-2 min-h-[1.2em] text-sm text-gray-500 dark:text-slate-400"></div>
      </div>
    </section>

    <section id="recordScreen" class="mt-6 hidden">
      <div class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800 sm:p-5">
        <label class="mb-2 block text-sm font-semibold text-gray-700 dark:text-slate-300">Record Meeting</label>
        <p class="text-xs text-gray-500 dark:text-slate-400">Record first, then edit transcript lines if speech or translation is incorrect.</p>

        <div class="mt-3 flex flex-wrap gap-2">
          <button id="startRec" type="button" class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700">Start Recording</button>
          <button id="stopRec" type="button" class="hidden rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700">Stop Recording</button>
          <button id="analyzeRec" type="button" class="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-600 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-blue-900/20">Analyze Transcript</button>
        </div>

        <div id="recordingStatus" class="mt-3 min-h-[1.2em] text-xs text-gray-500 dark:text-slate-400"></div>
        <div id="audioInfo" class="mt-2 min-h-[1.2em] text-xs text-gray-500 dark:text-slate-400"></div>
        <textarea id="speakerTranscript" class="mt-3 min-h-[220px] w-full resize-y rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-xs leading-relaxed text-gray-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" placeholder="Speaker A: ...&#10;Speaker B: ..."></textarea>
      </div>
    </section>
    </main>
  </div>

  <script src="/ai/playground/page.js" defer></script>
</body>
</html>`);
});
