export interface User {
  id: string
  email: string
  name: string
  phone?: string
  role?: 'ADMIN' | 'PM' | 'MEMBER'
  systemRole: 'SUPER_ADMIN' | 'MODERATOR' | 'USER'
  mustChangePassword?: boolean
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface Tenant {
  id: string
  slug: string
  name: string
  isActive?: boolean
  createdBy: User
  createdAt: string
  updatedAt: string
}

export interface TenantMembership {
  id: string
  tenantId: string
  userId: string
  role: 'TENANT_ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER'
  jobTitle?: string
  department?: string
  isActive?: boolean
  createdAt: string
  updatedAt: string
  user?: User
  tenant?: Tenant
}

export type AdminTenant = Omit<Tenant, 'createdBy'> & {
  createdBy?: Pick<User, 'id' | 'name' | 'email'>
  _count?: {
    memberships: number
    projects: number
  }
}

export interface Project {
  id: string
  name: string
  slug: string
  tenantId?: string
  createdAt: string
  updatedAt: string
}

export type ProjectKnowledgeSourceType =
  | 'TOR'
  | 'PROPOSAL'
  | 'CONTRACT'
  | 'REQUIREMENT'
  | 'MINUTES'
  | 'ACTION_LOG'
  | 'RISK_LOG'
  | 'ISSUE_LOG'
  | 'TIMELINE'
  | 'TECHNICAL_NOTE'
  | 'OTHER'

export type ProjectKnowledgeAuthorityLevel = 'AUTHORITATIVE' | 'SUPPORTING' | 'HISTORICAL'
export type ProjectKnowledgeSourceStatus = 'UPLOADED' | 'EXTRACTED' | 'REVIEWED' | 'APPROVED' | 'REJECTED'
export type ProjectMemoryItemType =
  | 'OVERVIEW'
  | 'SCOPE'
  | 'REQUIREMENT'
  | 'DECISION'
  | 'RISK'
  | 'ISSUE'
  | 'ACTION'
  | 'MILESTONE'
  | 'GLOSSARY'
  | 'ASSUMPTION'
  | 'OPEN_QUESTION'
  | 'STAKEHOLDER'

export interface ProjectKnowledgeBaseline {
  projectId: string
  projectName: string
  status: 'NO_BASELINE' | 'NEEDS_REVIEW' | 'BASELINE_READY'
  approvedMemoryCount: number
  needsReviewCount: number
  sourceCounts: Array<{ status: ProjectKnowledgeSourceStatus; count: number }>
  memoryCounts: Array<{ type: ProjectMemoryItemType; count: number }>
  lastUpdated?: string | null
}

export interface ProjectKnowledgeSource {
  id: string
  projectId: string
  sourceType: ProjectKnowledgeSourceType
  title: string
  contentText: string
  documentDate?: string | null
  versionLabel?: string | null
  authorityLevel: ProjectKnowledgeAuthorityLevel
  status: ProjectKnowledgeSourceStatus
  createdAt: string
  updatedAt: string
  uploadedBy?: Pick<User, 'id' | 'name' | 'email'> | null
  extractions?: Array<{
    id: string
    extractionJson: {
      overview?: string
      items?: Array<{
        type: ProjectMemoryItemType
        title: string
        content: string
        confidence?: string
      }>
    }
    confidence: string
    createdAt: string
  }>
  _count?: {
    memoryItems?: number
  }
}

export interface ProjectMemoryItem {
  id: string
  projectId: string
  sourceId?: string | null
  type: ProjectMemoryItemType
  title: string
  content: string
  status: 'DRAFT' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED'
  effectiveDate?: string | null
  approvedAt?: string | null
  source?: {
    id: string
    title: string
    sourceType: ProjectKnowledgeSourceType
    authorityLevel: ProjectKnowledgeAuthorityLevel
    documentDate?: string | null
  } | null
  approvedBy?: Pick<User, 'id' | 'name' | 'email'> | null
}

export interface ProjectGeneralNote {
  id: string
  projectId: string
  title: string
  content: string
  visibility: 'PUBLIC' | 'PRIVATE'
  createdAt: string
  updatedAt: string
  author: Pick<User, 'id' | 'name' | 'email'>
}

export interface Meeting {
  id: string
  title: string
  projectId: string
  recordingUrl?: string
  createdAt: string
  updatedAt: string
}

export interface AuthResponse {
  user: User
  accessToken: string
  refreshToken: string
}

export interface SystemSettings {
  ai: {
    asrMode: 'whisper' | 'browser' | 'hybrid'
    generation: {
      defaultModel: string
      maxPromptChars: number
      provider: 'ollama' | 'openai' | 'anthropic' | 'gemini'
      fallbackProviders: Array<'ollama' | 'openai' | 'anthropic' | 'gemini'>
    }
    whisper: {
      enabled: boolean
      model: string
      language: string
      timeoutMs: number
    }
  }
  security: {
    forceMfaForSuperAdmin: boolean
    sessionTtlHours: number
  }
  notifications: {
    emailEnabled: boolean
    digestEnabled: boolean
    escalationEnabled: boolean
  }
  integrations: {
    ollamaEnabled: boolean
    whisperEnabled: boolean
  }
  aiProviders: {
    accounts: AiProviderAccount[]
  }
}

export interface AiProviderAccount {
  id: string
  provider: 'ollama' | 'openai' | 'anthropic' | 'gemini'
  accountName: string
  label?: string
  model?: string
  baseUrl?: string
  organization?: string
  apiKeyMasked: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface TenantCreateRequest {
  name: string
  slug?: string
}

export interface MemberAddRequest {
  userId: string
  role: 'TENANT_ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER'
  jobTitle?: string
  department?: string
}

export interface MemberOnboardRequest {
  name: string
  email: string
  phone: string
  tenantRole: 'TENANT_ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER'
  userRole?: 'ADMIN' | 'PM' | 'MEMBER'
  jobTitle: string
  department?: string
}

export interface MemberOnboardResponse extends TenantMembership {
  temporaryPassword?: string | null
  invitationEmailSent?: boolean
  invitationEmailError?: string
  inviteUrl?: string
}

export interface UserInvitation {
  id: string
  email: string
  name: string
  tenantRole: 'TENANT_ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER'
  jobTitle: string
  expiresAt: string
  emailLastAttemptAt?: string | null
  emailSentAt?: string | null
  emailLastError?: string | null
  createdAt: string
  inviteUrl?: string
}

export type PlatformUser = User & {
  _count?: {
    tenantMemberships: number
  }
}

// Continuity Dashboard Types
export interface ProjectContinuitySummary {
  projectId: string
  projectName: string
  totalOpenItems: number
  totalOverdueItems: number
  totalDueSoonItems: number
  lastUpdated: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
}

export interface OverdueItem {
  id: string
  title: string
  dueDate?: string
  status: string
  owner?: User
  ownerId?: string
  projectId: string
}

export interface OverdueByOwner {
  ownerId?: string
  ownerName?: string
  ownerEmail?: string
  count: number
  items: OverdueItem[]
}

export interface OverdueByProject {
  projectId: string
  projectName: string
  count: number
  items: OverdueItem[]
}

export interface MissingOwnerItem {
  id: string
  title: string
  status: string
  type: 'ACTION_ITEM' | 'MINUTE_DRAFT'
  projectId: string
  projectName?: string
  meetingId?: string
  meetingTitle?: string
  missingReason?: string
  notes?: string
}

export interface RecentApprovedMeeting {
  id: string
  title: string
  projectId: string
  projectName: string
  actionItemCount: number
  approvedAt: string
}

export interface ProjectMemorySnapshot {
  projectId: string
  projectName: string
  lastSnapshotDate: string
  summary: string
  keyTopics: string[]
  participantCount: number
  meetingCount: number
  actionItemCount: number
}

// Reminder Types
export type ReminderEscalationLevel = 'DUE_SOON' | 'OVERDUE' | 'OVERDUE_SHORT' | 'OVERDUE_ESCALATE'

export interface ReminderDigest {
  id: string
  projectId: string
  project?: {
    id: string
    code?: string
    name: string
  }
  windowStart: string
  windowEnd: string
  totalOpen: number
  totalDueSoon: number
  totalOverdue: number
  totalEscalated: number
  createdAt: string
}

export interface ReminderDigestDetail extends ReminderDigest {
  overdueByOwner?: OverdueByOwner[]
  items?: Array<OverdueItem & {
    description?: string
    ownerName?: string
    ownerEmail?: string
    meetingId?: string
    meetingTitle?: string
    severity?: ReminderEscalationLevel
  }>
}

// AI Run Log Types
export type AiRunOperation = 'MINUTE_EXTRACTION' | 'RETRIEVAL_QUERY' | 'ASK_AI_ANSWER' | 'REMINDER_RUN' | 'MORNING_BRIEFING' | 'FEELING_LOG_ANALYSIS'
export type AiRunStatus = 'SUCCESS' | 'FAILED'

export interface AiRunLog {
  id: string
  operation: AiRunOperation
  status: AiRunStatus
  userId?: string
  projectId?: string
  meetingId?: string
  model?: string
  promptVersion?: string
  durationMs?: number
  retrievedIds?: string[]
  trace?: Record<string, unknown>
  errorMessage?: string
  createdAt: string
}

export interface AiRunLogWithContext extends AiRunLog {
  userName?: string
  projectName?: string
  meetingTitle?: string
}

export interface AskAiQueryLog {
  id: string
  userId: string
  projectId?: string
  meetingId?: string
  question: string
  answer: string
  confidence: string
  model?: string
  retrievedEvidenceIds?: unknown
  usedEvidenceJson?: unknown
  retrievalDebugJson?: unknown
  createdAt: string
  user?: {
    id: string
    name?: string
    email?: string
  }
  project?: {
    id: string
    code?: string
    name?: string
  }
  meeting?: {
    id: string
    title?: string
    sessionAt?: string
  }
}

export type CommunicationMoodState = 'CALM' | 'NEEDS_ATTENTION' | 'HIGH_PRESSURE' | 'INSUFFICIENT_DATA'

export interface CommunicationSentimentSnapshot {
  id: string
  tenantId: string
  memberUserId?: string | null
  windowStart: string
  windowEnd: string
  sampleCount: number
  moodScore: number
  stressScore: number
  frictionScore: number
  urgencyScore: number
  confidence: string
  summary: string
  themes: string[]
  signals: string[]
  caveats: string[]
  suggestions: string[]
  moodState: CommunicationMoodState
  batchId: string
  createdAt: string
}

export type MorningBriefingAckMood = 'GOT_IT' | 'I_KNOW' | 'RUDENESS'

export interface MorningBriefing {
  id: string
  tenantId: string
  userId: string
  briefingDate: string
  status: 'GENERATED' | 'FAILED'
  roleScope: string
  headline: string
  summary: string
  sections: Array<{ title: string; items: string[] }>
  evidence: Array<{
    actionItemId: string
    task: string
    projectId: string
    projectName: string
    meetingId: string
    meetingTitle: string
    assigneeId: string
    assigneeName: string
    dueDate: string
    priority: string
    status: string
    category: string
  }>
  actionItemIds: string[]
  generatedAt: string
  acknowledgement?: {
    id: string
    mood: MorningBriefingAckMood
    score: number
    reviewAgain?: boolean | null
    createdAt: string
  } | null
}

export type FeelingLogAnalysisAudience = 'PERSONAL' | 'LEADERSHIP' | 'MENTION_TARGET'

export interface FeelingLogMention {
  id: string
  mentionLabel: string
  createdAt: string
  mentionedUser: Pick<User, 'id' | 'name' | 'email'>
}

export interface FeelingLogAnalysis {
  id: string
  audience: FeelingLogAnalysisAudience
  targetUserId?: string | null
  title: string
  summary: string
  interpretation: string
  recommendation?: string | null
  riskLevel?: string | null
  createdAt: string
}

export interface FeelingLog {
  id: string
  tenantId: string
  authorId: string
  content: string
  emoji?: string | null
  isPrivate: boolean
  createdAt: string
  updatedAt: string
  mentions: FeelingLogMention[]
  analyses: FeelingLogAnalysis[]
}

export interface FeelingLogInboxItem {
  id: string
  audience: FeelingLogAnalysisAudience
  title: string
  summary: string
  interpretation: string
  recommendation?: string | null
  riskLevel?: string | null
  createdAt: string
  emoji?: string | null
  mentionCount: number
  mentionedPeople: string[]
  targetUser?: Pick<User, 'id' | 'name' | 'email'> | null
}
