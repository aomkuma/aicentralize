import type { TFunction } from 'i18next'
import type { ProjectMemoryItem, ProjectMemoryItemType, Tenant } from '../types'

const STUDENT_CATEGORY_CODES = new Set(['STUDENT', 'TEACHER'])

export type PersonalKnowledgePersona = 'student' | 'general'

export function resolvePersonalKnowledgePersona(tenant?: Tenant | null): PersonalKnowledgePersona {
  const code = tenant?.tenantCategory?.code?.trim().toUpperCase()
  if (code && STUDENT_CATEGORY_CODES.has(code)) {
    return 'student'
  }
  return 'general'
}

export function deriveTitleFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const chapterPatterns = [
  /^(บทที่\s*\d+)/i,
  /^(บท\s*\d+)/i,
  /^(หน่วยที่\s*\d+)/i,
  /^(chapter\s*\d+)/i,
  /^(unit\s*\d+)/i,
  /^(week\s*\d+)/i,
  /^(lecture\s*\d+)/i,
]

export function extractChapterLabel(title: string): string | null {
  const trimmed = title.trim()
  for (const pattern of chapterPatterns) {
    const match = trimmed.match(pattern)
    if (match?.[1]) {
      return match[1].replace(/\s+/g, ' ').trim()
    }
  }
  return null
}

export type MemoryCategoryGroup = {
  key: string
  label: string
  items: ProjectMemoryItem[]
}

export type MemorySourceGroup = {
  sourceId: string
  title: string
  documentDate?: string | null
  items: ProjectMemoryItem[]
}

const UNCATEGORIZED_SOURCE_ID = '__uncategorized__'

export function groupMemoryItemsBySource(items: ProjectMemoryItem[]): MemorySourceGroup[] {
  const groups = new Map<string, MemorySourceGroup>()

  for (const item of items) {
    const sourceId = item.sourceId ?? item.source?.id ?? UNCATEGORIZED_SOURCE_ID
    const title = item.source?.title ?? ''
    const documentDate = item.source?.documentDate ?? null
    const existing = groups.get(sourceId)

    if (existing) {
      existing.items.push(item)
      continue
    }

    groups.set(sourceId, {
      sourceId,
      title,
      documentDate,
      items: [item],
    })
  }

  return [...groups.values()].sort((left, right) => {
    if (left.sourceId === UNCATEGORIZED_SOURCE_ID) {
      return 1
    }
    if (right.sourceId === UNCATEGORIZED_SOURCE_ID) {
      return -1
    }

    const leftDate = left.documentDate ? Date.parse(left.documentDate) : 0
    const rightDate = right.documentDate ? Date.parse(right.documentDate) : 0
    if (leftDate !== rightDate) {
      return rightDate - leftDate
    }

    return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })
  })
}

export function groupMemoryItemsByCategory(
  items: ProjectMemoryItem[],
  t: TFunction,
  persona: PersonalKnowledgePersona,
): MemoryCategoryGroup[] {
  const groups = new Map<string, MemoryCategoryGroup>()

  const addToGroup = (key: string, label: string, item: ProjectMemoryItem) => {
    const existing = groups.get(key)
    if (existing) {
      existing.items.push(item)
      return
    }
    groups.set(key, { key, label, items: [item] })
  }

  for (const item of items) {
    const chapter = extractChapterLabel(item.title)
    if (chapter) {
      addToGroup(`chapter:${chapter.toLowerCase()}`, chapter, item)
      continue
    }

    const typeKey = `type:${item.type}`
    addToGroup(typeKey, memoryTypeLabel(item.type, t, persona), item)
  }

  return [...groups.values()].sort((left, right) => {
    if (left.key.startsWith('chapter:') && right.key.startsWith('chapter:')) {
      return left.label.localeCompare(right.label, undefined, { numeric: true, sensitivity: 'base' })
    }
    if (left.key.startsWith('chapter:')) {
      return -1
    }
    if (right.key.startsWith('chapter:')) {
      return 1
    }
    return left.label.localeCompare(right.label)
  })
}

export function groupMemoryItemsByType(
  items: ProjectMemoryItem[],
  typeLabel: (type: ProjectMemoryItemType) => string,
): MemoryCategoryGroup[] {
  const groups = new Map<string, MemoryCategoryGroup>()

  for (const item of items) {
    const key = item.type
    const label = typeLabel(item.type)
    const existing = groups.get(key)

    if (existing) {
      existing.items.push(item)
      continue
    }

    groups.set(key, { key, label, items: [item] })
  }

  return [...groups.values()].sort((left, right) => left.label.localeCompare(right.label))
}

function memoryTypeLabel(
  type: ProjectMemoryItemType,
  t: TFunction,
  persona: PersonalKnowledgePersona,
) {
  const prefix = persona === 'student' ? 'personalKnowledge.categories.student' : 'personalKnowledge.categories.general'
  return t(`${prefix}.${type}`, { defaultValue: t(`personalKnowledge.categories.general.${type}`) })
}

export function groupDraftItemsByCategory(
  items: Array<{ type: ProjectMemoryItemType; title: string; content: string; confidence?: string }>,
  t: TFunction,
  persona: PersonalKnowledgePersona,
) {
  const groups = new Map<string, { key: string; label: string; items: typeof items }>()

  for (const item of items) {
    const chapter = extractChapterLabel(item.title)
    const key = chapter ? `chapter:${chapter.toLowerCase()}` : `type:${item.type}`
    const label = chapter ?? memoryTypeLabel(item.type, t, persona)
    const existing = groups.get(key)
    if (existing) {
      existing.items.push(item)
    } else {
      groups.set(key, { key, label, items: [item] })
    }
  }

  return [...groups.values()]
}
