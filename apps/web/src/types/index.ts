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
export type AiRunOperation = 'MINUTE_EXTRACTION' | 'RETRIEVAL_QUERY' | 'ASK_AI_ANSWER' | 'REMINDER_RUN'
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
