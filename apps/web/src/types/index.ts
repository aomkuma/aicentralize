export interface User {
  id: string
  email: string
  name: string
  systemRole: 'SUPER_ADMIN' | 'USER'
  createdAt: string
}

export interface Tenant {
  id: string
  slug: string
  name: string
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
  createdAt: string
  updatedAt: string
  user?: User
  tenant?: Tenant
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
    whisper: {
      enabled: boolean
      model: string
      language: string
      timeoutMs: number
    }
    generation: {
      defaultModel: string
      maxPromptChars: number
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
}

export interface TenantCreateRequest {
  name: string
}

export interface MemberAddRequest {
  userId: string
  role: 'TENANT_ADMIN' | 'MANAGER' | 'MEMBER' | 'VIEWER'
  jobTitle?: string
  department?: string
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
  items?: OverdueItem[]
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
