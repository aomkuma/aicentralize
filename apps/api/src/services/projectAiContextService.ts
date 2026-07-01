import { FeelingLogAnalysisAudience } from "@prisma/client";
import { prisma } from "../lib/prisma";

const TEAM_PULSE_LOOKBACK_DAYS = 14;
const MAX_MEMORY_ITEMS = 35;
const MAX_MEETINGS = 25;
const MAX_MINUTE_VERSIONS = 20;
const MAX_GENERAL_NOTES = 30;
const MAX_LEADERSHIP_INSIGHTS = 12;

export type ProjectAiEvidenceRow = {
  chunkId: string;
  sourceType: string;
  sourceRowId?: string | null;
  projectId: string;
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
  minuteVersionId: string;
  minuteApprovedAt: string;
  snippet: string;
  vectorScore: number;
  lexicalScore: number;
  sourceBoost: number;
  recencyBoost: number;
  hybridScore: number;
};

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function truncate(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, max - 1)}…`;
}

function readOpenQuestionsFromSnapshot(snapshotJson: unknown): string[] {
  if (!snapshotJson || typeof snapshotJson !== "object" || Array.isArray(snapshotJson)) {
    return [];
  }

  return parseStringArray((snapshotJson as { openQuestions?: unknown }).openQuestions);
}

export function scoreLexicalMatch(text: string, query: string): number {
  const normalizedText = text.toLowerCase();
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    return 0;
  }

  const hits = tokens.filter((token) => normalizedText.includes(token)).length;
  return hits / tokens.length;
}

function buildEvidenceRow(input: {
  chunkId: string;
  sourceType: string;
  projectId: string;
  snippet: string;
  question: string;
  sourceRowId?: string | null;
  meetingId?: string;
  meetingTitle?: string;
  meetingDate?: string;
  minuteVersionId?: string;
  minuteApprovedAt?: string;
  sourceBoost?: number;
  recencyBoost?: number;
  directMatchBoost?: number;
}): ProjectAiEvidenceRow {
  const lexicalScore = scoreLexicalMatch(input.snippet, input.question);
  const sourceBoost = input.sourceBoost ?? 0.1;
  const recencyBoost = input.recencyBoost ?? 0.04;
  const directMatchBoost = input.directMatchBoost ?? 0;

  return {
    chunkId: input.chunkId,
    sourceType: input.sourceType,
    sourceRowId: input.sourceRowId,
    projectId: input.projectId,
    meetingId: input.meetingId ?? "",
    meetingTitle: input.meetingTitle ?? "",
    meetingDate: input.meetingDate ?? "",
    minuteVersionId: input.minuteVersionId ?? "",
    minuteApprovedAt: input.minuteApprovedAt ?? "",
    snippet: input.snippet,
    vectorScore: 0,
    lexicalScore,
    sourceBoost,
    recencyBoost,
    hybridScore: lexicalScore * 0.72 + sourceBoost + recencyBoost + directMatchBoost
  };
}

export async function buildProjectAiSupplementText(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      tenantId: true,
      description: true
    }
  });

  if (!project) {
    return "";
  }

  const teamPulseSince = new Date(Date.now() - TEAM_PULSE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const [
    memoryItems,
    generalNotes,
    meetings,
    minuteVersions,
    leadershipInsights,
    tenantMood
  ] = await Promise.all([
    prisma.projectMemoryItem.findMany({
      where: {
        projectId,
        status: "APPROVED"
      },
      orderBy: { updatedAt: "desc" },
      take: MAX_MEMORY_ITEMS,
      select: {
        id: true,
        type: true,
        title: true,
        content: true,
        effectiveDate: true,
        approvedAt: true
      }
    }),
    prisma.projectGeneralNote.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: MAX_GENERAL_NOTES,
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
      }
    }),
    prisma.meeting.findMany({
      where: { projectId },
      orderBy: { sessionAt: "desc" },
      take: MAX_MEETINGS,
      select: {
        id: true,
        title: true,
        sessionAt: true,
        status: true,
        summary: true,
        agenda: true
      }
    }),
    prisma.minuteVersion.findMany({
      where: {
        meeting: { projectId }
      },
      orderBy: { approvedAt: "desc" },
      take: MAX_MINUTE_VERSIONS,
      select: {
        id: true,
        approvedAt: true,
        summary: true,
        risksJson: true,
        snapshotJson: true,
        meeting: {
          select: {
            id: true,
            title: true,
            sessionAt: true
          }
        }
      }
    }),
    project.tenantId
      ? prisma.feelingLogAnalysis.findMany({
        where: {
          audience: FeelingLogAnalysisAudience.LEADERSHIP,
          createdAt: { gte: teamPulseSince },
          feelingLog: {
            tenantId: project.tenantId,
            processedAt: { not: null }
          }
        },
        orderBy: { createdAt: "desc" },
        take: MAX_LEADERSHIP_INSIGHTS,
        select: {
          id: true,
          title: true,
          summary: true,
          interpretation: true,
          recommendation: true,
          riskLevel: true,
          createdAt: true,
          feelingLog: {
            select: {
              emoji: true,
              createdAt: true
            }
          }
        }
      })
      : Promise.resolve([]),
    project.tenantId
      ? prisma.communicationSentimentSnapshot.findFirst({
        where: {
          tenantId: project.tenantId,
          memberUserId: null
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          moodState: true,
          moodScore: true,
          stressScore: true,
          frictionScore: true,
          urgencyScore: true,
          confidence: true,
          summary: true,
          themesJson: true,
          caveatsJson: true,
          windowStart: true,
          windowEnd: true,
          sampleCount: true
        }
      })
      : Promise.resolve(null)
  ]);

  const lines: string[] = [];

  if (project.description?.trim()) {
    lines.push("- projectDescription:");
    lines.push(`  ${truncate(project.description, 600)}`);
  }

  lines.push("- approvedProjectMemory:");
  if (!memoryItems.length) {
    lines.push("  - (none)");
  } else {
    for (const item of memoryItems) {
      lines.push(
        `  - type=${item.type} | title=${item.title} | approvedAt=${item.approvedAt?.toISOString() ?? "unknown"} | content=${truncate(item.content, 280)}`
      );
    }
  }

  lines.push("- generalNotes (public and private):");
  if (!generalNotes.length) {
    lines.push("  - (none)");
  } else {
    for (const note of generalNotes) {
      lines.push(
        `  - visibility=${note.visibility} | title=${note.title} | author=${note.author.name} | createdAt=${note.createdAt.toISOString()} | content=${truncate(note.content, 280)}`
      );
    }
  }

  lines.push("- recentMeetings:");
  if (!meetings.length) {
    lines.push("  - (none)");
  } else {
    for (const meeting of meetings) {
      lines.push(
        `  - meetingId=${meeting.id} | title=${meeting.title} | sessionAt=${meeting.sessionAt.toISOString()} | status=${meeting.status} | summary=${truncate(meeting.summary, 180)}`
      );
    }
  }

  lines.push("- approvedMinuteRisksAndOpenQuestions:");
  if (!minuteVersions.length) {
    lines.push("  - (none)");
  } else {
    for (const version of minuteVersions) {
      const risks = parseStringArray(version.risksJson);
      const openQuestions = readOpenQuestionsFromSnapshot(version.snapshotJson);
      if (!risks.length && !openQuestions.length) {
        continue;
      }

      lines.push(
        `  - meeting=${version.meeting.title} | approvedAt=${version.approvedAt.toISOString()} | summary=${truncate(version.summary, 160)}`
      );
      for (const risk of risks) {
        lines.push(`    risk: ${risk}`);
      }
      for (const question of openQuestions) {
        lines.push(`    openQuestion: ${question}`);
      }
    }
  }

  lines.push("- anonymizedTeamPulse (no author identity, no raw journal text):");
  if (!leadershipInsights.length) {
    lines.push("  - (none)");
  } else {
    for (const insight of leadershipInsights) {
      lines.push(
        `  - riskLevel=${insight.riskLevel ?? "unknown"} | emoji=${insight.feelingLog.emoji ?? "-"} | title=${insight.title} | summary=${truncate(insight.summary, 180)} | interpretation=${truncate(insight.interpretation, 180)}`
      );
    }
  }

  lines.push("- tenantCommunicationMood (aggregate only, no individual identity):");
  if (!tenantMood) {
    lines.push("  - (none)");
  } else {
    const themes = parseStringArray(tenantMood.themesJson).slice(0, 8).join(", ");
    lines.push(
      `  - moodState=${tenantMood.moodState} | moodScore=${tenantMood.moodScore} | stressScore=${tenantMood.stressScore} | frictionScore=${tenantMood.frictionScore} | urgencyScore=${tenantMood.urgencyScore} | sampleCount=${tenantMood.sampleCount} | summary=${truncate(tenantMood.summary, 220)} | themes=${themes || "(none)"}`
    );
  }

  return lines.join("\n");
}

export async function retrieveProjectAiSupplementEvidence(input: {
  projectId: string;
  question: string;
  limit: number;
}): Promise<ProjectAiEvidenceRow[]> {
  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
      tenantId: true,
      description: true
    }
  });

  if (!project) {
    return [];
  }

  const teamPulseSince = new Date(Date.now() - TEAM_PULSE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const evidence: ProjectAiEvidenceRow[] = [];

  const [memoryItems, generalNotes, meetings, minuteVersions, leadershipInsights, tenantMood] = await Promise.all([
    prisma.projectMemoryItem.findMany({
      where: { projectId: input.projectId, status: "APPROVED" },
      orderBy: { updatedAt: "desc" },
      take: MAX_MEMORY_ITEMS,
      select: { id: true, type: true, title: true, content: true, approvedAt: true }
    }),
    prisma.projectGeneralNote.findMany({
      where: { projectId: input.projectId },
      orderBy: { createdAt: "desc" },
      take: MAX_GENERAL_NOTES,
      select: {
        id: true,
        title: true,
        content: true,
        visibility: true,
        author: { select: { name: true } }
      }
    }),
    prisma.meeting.findMany({
      where: { projectId: input.projectId },
      orderBy: { sessionAt: "desc" },
      take: MAX_MEETINGS,
      select: { id: true, title: true, sessionAt: true, status: true, summary: true }
    }),
    prisma.minuteVersion.findMany({
      where: { meeting: { projectId: input.projectId } },
      orderBy: { approvedAt: "desc" },
      take: MAX_MINUTE_VERSIONS,
      select: {
        id: true,
        approvedAt: true,
        summary: true,
        risksJson: true,
        snapshotJson: true,
        meeting: { select: { id: true, title: true, sessionAt: true } }
      }
    }),
    project.tenantId
      ? prisma.feelingLogAnalysis.findMany({
        where: {
          audience: FeelingLogAnalysisAudience.LEADERSHIP,
          createdAt: { gte: teamPulseSince },
          feelingLog: { tenantId: project.tenantId, processedAt: { not: null } }
        },
        orderBy: { createdAt: "desc" },
        take: MAX_LEADERSHIP_INSIGHTS,
        select: {
          id: true,
          title: true,
          summary: true,
          interpretation: true,
          riskLevel: true,
          feelingLog: { select: { emoji: true } }
        }
      })
      : Promise.resolve([]),
    project.tenantId
      ? prisma.communicationSentimentSnapshot.findFirst({
        where: { tenantId: project.tenantId, memberUserId: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          moodState: true,
          summary: true,
          themesJson: true,
          moodScore: true,
          stressScore: true
        }
      })
      : Promise.resolve(null)
  ]);

  if (project.description?.trim()) {
    evidence.push(buildEvidenceRow({
      chunkId: `project-meta:${project.id}`,
      sourceType: "PROJECT_METADATA",
      projectId: project.id,
      snippet: `Project description: ${project.description.trim()}`,
      question: input.question,
      sourceBoost: 0.08
    }));
  }

  for (const item of memoryItems) {
    evidence.push(buildEvidenceRow({
      chunkId: `project-memory-live:${item.id}`,
      sourceType: "PROJECT_MEMORY",
      sourceRowId: item.id,
      projectId: input.projectId,
      snippet: `[${item.type}] ${item.title} | ${item.content}`,
      question: input.question,
      minuteApprovedAt: item.approvedAt?.toISOString() ?? "",
      sourceBoost: 0.12
    }));
  }

  for (const note of generalNotes) {
    evidence.push(buildEvidenceRow({
      chunkId: `project-general-note-live:${note.id}`,
      sourceType: "PROJECT_GENERAL_NOTE",
      sourceRowId: note.id,
      projectId: input.projectId,
      snippet: `[General note:${note.visibility}] ${note.title} | author: ${note.author.name} | ${note.content}`,
      question: input.question,
      sourceBoost: note.visibility === "PUBLIC" ? 0.1 : 0.09
    }));
  }

  for (const meeting of meetings) {
    evidence.push(buildEvidenceRow({
      chunkId: `meeting-catalog:${meeting.id}`,
      sourceType: "MEETING_METADATA",
      sourceRowId: meeting.id,
      projectId: input.projectId,
      meetingId: meeting.id,
      meetingTitle: meeting.title,
      meetingDate: meeting.sessionAt.toISOString(),
      snippet: `Meeting ${meeting.title} | status ${meeting.status} | ${meeting.summary}`,
      question: input.question,
      sourceBoost: 0.07
    }));
  }

  for (const version of minuteVersions) {
    const risks = parseStringArray(version.risksJson);
    const openQuestions = readOpenQuestionsFromSnapshot(version.snapshotJson);

    for (const [index, risk] of risks.entries()) {
      evidence.push(buildEvidenceRow({
        chunkId: `minute-risk:${version.id}:${index + 1}`,
        sourceType: "KEY_POINT",
        sourceRowId: version.id,
        projectId: input.projectId,
        meetingId: version.meeting.id,
        meetingTitle: version.meeting.title,
        meetingDate: version.meeting.sessionAt.toISOString(),
        minuteVersionId: version.id,
        minuteApprovedAt: version.approvedAt.toISOString(),
        snippet: `[Risk] ${risk} | meeting: ${version.meeting.title}`,
        question: input.question,
        sourceBoost: 0.11
      }));
    }

    for (const [index, questionText] of openQuestions.entries()) {
      evidence.push(buildEvidenceRow({
        chunkId: `minute-open-question:${version.id}:${index + 1}`,
        sourceType: "KEY_POINT",
        sourceRowId: version.id,
        projectId: input.projectId,
        meetingId: version.meeting.id,
        meetingTitle: version.meeting.title,
        meetingDate: version.meeting.sessionAt.toISOString(),
        minuteVersionId: version.id,
        minuteApprovedAt: version.approvedAt.toISOString(),
        snippet: `[Open question] ${questionText} | meeting: ${version.meeting.title}`,
        question: input.question,
        sourceBoost: 0.11
      }));
    }
  }

  for (const insight of leadershipInsights) {
    evidence.push(buildEvidenceRow({
      chunkId: `team-pulse:${insight.id}`,
      sourceType: "TEAM_PULSE_AGGREGATE",
      sourceRowId: insight.id,
      projectId: input.projectId,
      snippet: [
        "[Team pulse aggregate]",
        `riskLevel: ${insight.riskLevel ?? "unknown"}`,
        `emoji: ${insight.feelingLog.emoji ?? "-"}`,
        `title: ${insight.title}`,
        `summary: ${insight.summary}`,
        `interpretation: ${insight.interpretation}`
      ].join(" | "),
      question: input.question,
      sourceBoost: 0.06
    }));
  }

  if (tenantMood) {
    const themes = parseStringArray(tenantMood.themesJson).join(", ");
    evidence.push(buildEvidenceRow({
      chunkId: `tenant-mood:${tenantMood.id}`,
      sourceType: "COMMUNICATION_MOOD_AGGREGATE",
      sourceRowId: tenantMood.id,
      projectId: input.projectId,
      snippet: [
        "[Tenant communication mood aggregate]",
        `moodState: ${tenantMood.moodState}`,
        `moodScore: ${tenantMood.moodScore}`,
        `stressScore: ${tenantMood.stressScore}`,
        `summary: ${tenantMood.summary}`,
        `themes: ${themes}`
      ].join(" | "),
      question: input.question,
      sourceBoost: 0.05
    }));
  }

  return evidence
    .filter((row) => row.hybridScore > 0.08)
    .sort((a, b) => b.hybridScore - a.hybridScore)
    .slice(0, input.limit);
}
