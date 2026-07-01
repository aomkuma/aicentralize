import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Layout from '../components/Layout'
import WorkflowProgressPanel from '../components/WorkflowProgressPanel'
import { useApi } from '../hooks/useApi'
import type {
  ProjectKnowledgeAuthorityLevel,
  ProjectKnowledgeBaseline,
  ProjectKnowledgeSource,
  ProjectKnowledgeSourceType,
  ProjectMemoryItem,
  ProjectMemoryItemType,
} from '../types'

type DocxTextExtractor = {
  extractRawText?: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  default?: {
    extractRawText?: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  }
}

type JsZipModule = {
  loadAsync(data: ArrayBuffer): Promise<{
    file: (name: string) => { async: (type: 'string') => Promise<string> } | null
    folder: (name: string) => Array<{ name: string; async: (type: 'string') => Promise<string> }>
  }>
  default?: {
    loadAsync(data: ArrayBuffer): Promise<{
      file: (name: string) => { async: (type: 'string') => Promise<string> } | null
      folder: (name: string) => Array<{ name: string; async: (type: 'string') => Promise<string> }>
    }>
  }
}

const sourceTypes: ProjectKnowledgeSourceType[] = [
  'TOR',
  'PROPOSAL',
  'CONTRACT',
  'REQUIREMENT',
  'MINUTES',
  'ACTION_LOG',
  'RISK_LOG',
  'ISSUE_LOG',
  'TIMELINE',
  'TECHNICAL_NOTE',
  'OTHER',
]

const authorityLevels: ProjectKnowledgeAuthorityLevel[] = ['AUTHORITATIVE', 'SUPPORTING', 'HISTORICAL']

const HISTORY_PAGE_SIZE = 15

type KnowledgeProgressMode = 'import' | 'save' | 'extract' | 'approve' | null
type KnowledgeProgressKey =
  | 'validatingInput'
  | 'extractingDocumentText'
  | 'savingSource'
  | 'aiExtracting'
  | 'reviewingExtraction'
  | 'savingToMemory'
  | 'completed'
  | 'failed'

const progressFlowByMode: Record<Exclude<KnowledgeProgressMode, null>, KnowledgeProgressKey[]> = {
  import: ['validatingInput', 'extractingDocumentText', 'savingSource', 'aiExtracting', 'completed'],
  save: ['validatingInput', 'savingSource', 'completed'],
  extract: ['validatingInput', 'aiExtracting', 'completed'],
  approve: ['reviewingExtraction', 'savingToMemory', 'completed'],
}

function paginateItems<T>(items: T[], page: number) {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * HISTORY_PAGE_SIZE

  return {
    slice: items.slice(start, start + HISTORY_PAGE_SIZE),
    page: safePage,
    totalPages,
    total,
    from: total ? start + 1 : 0,
    to: Math.min(start + HISTORY_PAGE_SIZE, total),
  }
}

function toggleExpandedId(
  setter: Dispatch<SetStateAction<Set<string>>>,
  id: string,
) {
  setter((previous) => {
    const next = new Set(previous)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    return next
  })
}

type HistoryPaginationProps = {
  page: number
  totalPages: number
  total: number
  onPrevious: () => void
  onNext: () => void
  previousLabel: string
  nextLabel: string
  rangeLabel: string
}

function HistoryPagination({
  page,
  totalPages,
  total,
  onPrevious,
  onNext,
  previousLabel,
  nextLabel,
  rangeLabel,
}: HistoryPaginationProps) {
  if (total <= HISTORY_PAGE_SIZE) {
    return null
  }

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
      <p className="text-xs text-slate-500 dark:text-slate-400">{rangeLabel}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrevious}
          disabled={page <= 1}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {previousLabel}
        </button>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {nextLabel}
        </button>
      </div>
    </div>
  )
}

function buildSourceMeta(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(' · ')
}

function formatFileErrorMessage(fileName: string, reason: string) {
  return `${fileName}: ${reason}`
}

function describeFileProcessingError(file: File, error: unknown, t: (key: string) => string) {
  const message = error instanceof Error ? error.message : ''
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith('.pdf')) {
    if (message.includes('image-only') || message.includes('unsupported encoding')) {
      return t('projectKnowledge.fileReadErrors.pdfImageOnly')
    }
    return t('projectKnowledge.fileReadErrors.pdfGeneric')
  }

  if (lowerName.endsWith('.docx')) {
    return t('projectKnowledge.fileReadErrors.docxGeneric')
  }

  if (lowerName.endsWith('.xlsx')) {
    if (message.includes('Invalid XLSX structure')) {
      return t('projectKnowledge.fileReadErrors.xlsxInvalid')
    }
    return t('projectKnowledge.fileReadErrors.xlsxGeneric')
  }

  if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv')) {
    return t('projectKnowledge.fileReadErrors.csvGeneric')
  }

  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    return t('projectKnowledge.fileReadErrors.textGeneric')
  }

  if (message.startsWith('Unsupported file type:')) {
    return t('projectKnowledge.fileReadErrors.unsupportedType')
  }

  return message || t('projectKnowledge.importFailed')
}

function deriveTitleFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function toDateInputValue(timestamp: number) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;')
}

function decodePdfTextChunk(value: string) {
  return value
    .replace(/\\([()\\])/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\([0-7]{1,3})/g, (_, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))
}

async function extractDocxText(file: File) {
  const mammothModule = (await import('mammoth/mammoth.browser')) as DocxTextExtractor
  const extractRawText = mammothModule.extractRawText ?? mammothModule.default?.extractRawText

  if (!extractRawText) {
    throw new Error('DOCX extractor is not available')
  }

  const extracted = await extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return extracted.value.trim()
}

async function extractXlsxText(file: File) {
  // @ts-expect-error Local fallback path used because jszip is present in the workspace but not declared as a direct web dependency.
  const jszipModule = (await import('../../../../node_modules/.pnpm/jszip@3.10.1/node_modules/jszip/dist/jszip.js')) as unknown as JsZipModule
  const loadAsync = jszipModule.loadAsync ?? jszipModule.default?.loadAsync
  if (!loadAsync) {
    throw new Error('XLSX extractor is not available')
  }

  const zip = await loadAsync(await file.arrayBuffer())
  const sharedStringsXml = await zip.file('xl/sharedStrings.xml')?.async('string')
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string')
  const workbookRelsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string')

  if (!workbookXml || !workbookRelsXml) {
    throw new Error('Invalid XLSX structure')
  }

  const parser = new DOMParser()
  const sharedStringsDoc = sharedStringsXml ? parser.parseFromString(sharedStringsXml, 'application/xml') : null
  const workbookDoc = parser.parseFromString(workbookXml, 'application/xml')
  const workbookRelsDoc = parser.parseFromString(workbookRelsXml, 'application/xml')

  const sharedStrings = sharedStringsDoc
    ? Array.from(sharedStringsDoc.getElementsByTagName('si')).map((si) =>
      Array.from(si.getElementsByTagName('t')).map((node) => node.textContent ?? '').join('')
    )
    : []

  const relationshipMap = new Map<string, string>()
  Array.from(workbookRelsDoc.getElementsByTagName('Relationship')).forEach((rel) => {
    const id = rel.getAttribute('Id')
    const target = rel.getAttribute('Target')
    if (id && target) {
      relationshipMap.set(id, target.startsWith('xl/') ? target : `xl/${target.replace(/^\//, '')}`)
    }
  })

  const sheetNodes = Array.from(workbookDoc.getElementsByTagName('sheet'))
  const sheetTexts: string[] = []

  for (const sheet of sheetNodes) {
    const name = sheet.getAttribute('name') ?? 'Sheet'
    const relationshipId = sheet.getAttribute('r:id') ?? sheet.getAttribute('id')
    if (!relationshipId) {
      continue
    }

    const sheetPath = relationshipMap.get(relationshipId)
    if (!sheetPath) {
      continue
    }

    const sheetXml = await zip.file(sheetPath)?.async('string')
    if (!sheetXml) {
      continue
    }

    const sheetDoc = parser.parseFromString(sheetXml, 'application/xml')
    const rowTexts = Array.from(sheetDoc.getElementsByTagName('row')).map((row) => {
      const cells = Array.from(row.getElementsByTagName('c')).map((cell) => {
        const cellType = cell.getAttribute('t')
        if (cellType === 'inlineStr') {
          return Array.from(cell.getElementsByTagName('t')).map((node) => node.textContent ?? '').join(' ').trim()
        }

        const valueNode = cell.getElementsByTagName('v')[0]
        const rawValue = valueNode?.textContent?.trim() ?? ''
        if (!rawValue) {
          return ''
        }

        if (cellType === 's') {
          const index = Number.parseInt(rawValue, 10)
          return Number.isFinite(index) ? (sharedStrings[index] ?? '') : rawValue
        }

        return rawValue
      }).filter(Boolean)

      return cells.join(' | ').trim()
    }).filter(Boolean)

    if (rowTexts.length) {
      sheetTexts.push(`# ${name}\n${rowTexts.join('\n')}`)
    }
  }

  return sheetTexts.join('\n\n').trim()
}

async function extractPdfText(file: File) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const binary = Array.from(bytes).map((byte) => String.fromCharCode(byte)).join('')
  const textParts: string[] = []

  const literalMatches = binary.matchAll(/\(([^()]*(?:\\.[^()]*)*)\)\s*Tj/g)
  for (const match of literalMatches) {
    textParts.push(decodePdfTextChunk(match[1]))
  }

  const arrayMatches = binary.matchAll(/\[(.*?)\]\s*TJ/gs)
  for (const match of arrayMatches) {
    const chunkMatches = match[1].matchAll(/\(([^()]*(?:\\.[^()]*)*)\)/g)
    const combined = Array.from(chunkMatches).map((chunk) => decodePdfTextChunk(chunk[1])).join('')
    if (combined.trim()) {
      textParts.push(combined)
    }
  }

  const cleaned = textParts
    .join('\n')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!cleaned) {
    throw new Error('PDF text extraction failed. This PDF may be image-only or use unsupported encoding.')
  }

  return cleaned
}

async function extractFileText(file: File) {
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    return (await file.text()).trim()
  }

  if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv')) {
    return (await file.text()).trim()
  }

  if (lowerName.endsWith('.docx')) {
    return extractDocxText(file)
  }

  if (lowerName.endsWith('.pdf')) {
    return extractPdfText(file)
  }

  if (lowerName.endsWith('.xlsx')) {
    return extractXlsxText(file)
  }

  throw new Error(`Unsupported file type: ${file.name}`)
}

export default function ProjectKnowledgePage() {
  const { t, i18n } = useTranslation()
  const { projectId } = useParams<{ projectId?: string }>()
  const { get, post, isLoading, error } = useApi()

  const [baseline, setBaseline] = useState<ProjectKnowledgeBaseline | null>(null)
  const [sources, setSources] = useState<ProjectKnowledgeSource[]>([])
  const [memoryItems, setMemoryItems] = useState<ProjectMemoryItem[]>([])
  const [sourceType, setSourceType] = useState<ProjectKnowledgeSourceType>('REQUIREMENT')
  const [authorityLevel, setAuthorityLevel] = useState<ProjectKnowledgeAuthorityLevel>('SUPPORTING')
  const [title, setTitle] = useState('')
  const [documentDate, setDocumentDate] = useState('')
  const [versionLabel, setVersionLabel] = useState('')
  const [contentText, setContentText] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [notice, setNotice] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [sourcesPage, setSourcesPage] = useState(1)
  const [memoryPage, setMemoryPage] = useState(1)
  const [expandedSourceIds, setExpandedSourceIds] = useState<Set<string>>(() => new Set())
  const [expandedMemoryIds, setExpandedMemoryIds] = useState<Set<string>>(() => new Set())
  const [guidedStep, setGuidedStep] = useState(1)
  const [hoveredGuideStep, setHoveredGuideStep] = useState<number | null>(null)
  const [progressMode, setProgressMode] = useState<KnowledgeProgressMode>(null)
  const [progressKey, setProgressKey] = useState<KnowledgeProgressKey>('validatingInput')
  const [progressDetail, setProgressDetail] = useState('')

  const fetchKnowledge = useCallback(async () => {
    if (!projectId) {
      return
    }

    const [baselineData, sourceData, memoryData] = await Promise.all([
      get<ProjectKnowledgeBaseline>(`/projects/${projectId}/knowledge/baseline`),
      get<ProjectKnowledgeSource[]>(`/projects/${projectId}/knowledge/sources`),
      get<ProjectMemoryItem[]>(`/projects/${projectId}/knowledge/memory`),
    ])

    if (baselineData) {
      setBaseline(baselineData)
    }
    if (Array.isArray(sourceData)) {
      setSources(sourceData)
    }
    if (Array.isArray(memoryData)) {
      setMemoryItems(memoryData)
    }
  }, [get, projectId])

  useEffect(() => {
    void fetchKnowledge()
  }, [fetchKnowledge])

  const sortedMemoryItems = useMemo(() => {
    return [...memoryItems].sort((left, right) => {
      const leftTime = left.approvedAt ?? ''
      const rightTime = right.approvedAt ?? ''
      if (leftTime !== rightTime) {
        return rightTime.localeCompare(leftTime)
      }
      return left.title.localeCompare(right.title, i18n.language)
    })
  }, [memoryItems, i18n.language])

  const sourcesPagination = useMemo(
    () => paginateItems(sources, sourcesPage),
    [sources, sourcesPage],
  )

  const memoryPagination = useMemo(
    () => paginateItems(sortedMemoryItems, memoryPage),
    [sortedMemoryItems, memoryPage],
  )

  useEffect(() => {
    if (sourcesPage > sourcesPagination.totalPages) {
      setSourcesPage(sourcesPagination.totalPages)
    }
  }, [sourcesPage, sourcesPagination.totalPages])

  useEffect(() => {
    if (memoryPage > memoryPagination.totalPages) {
      setMemoryPage(memoryPagination.totalPages)
    }
  }, [memoryPage, memoryPagination.totalPages])

  const guidedSteps = useMemo(
    () => [
      {
        title: t('projectKnowledge.guide.steps.step1.title'),
        description: t('projectKnowledge.guide.steps.step1.description'),
      },
      {
        title: t('projectKnowledge.guide.steps.step2.title'),
        description: t('projectKnowledge.guide.steps.step2.description'),
      },
      {
        title: t('projectKnowledge.guide.steps.step3.title'),
        description: t('projectKnowledge.guide.steps.step3.description'),
      },
    ],
    [t],
  )

  const stepOneComplete = sources.length > 0 || contentText.trim().length >= 20 || selectedFiles.length > 0
  const stepTwoComplete = sources.some(
    (source) =>
      (source.extractions?.length ?? 0) > 0 ||
      source.status === 'EXTRACTED' ||
      source.status === 'REVIEWED' ||
      source.status === 'APPROVED',
  )
  const stepThreeComplete =
    (baseline?.approvedMemoryCount ?? 0) > 0 ||
    memoryItems.some((item) => item.status === 'APPROVED')

  const activeGuideStep = hoveredGuideStep ?? guidedStep
  const activeGuideStepData = guidedSteps[activeGuideStep - 1] ?? guidedSteps[0]

  const progressSteps = useMemo(() => {
    if (!progressMode) {
      return []
    }

    return progressFlowByMode[progressMode].map((key) => ({
      key,
      label: t(`projectKnowledge.progress.steps.${key}`),
    }))
  }, [progressMode, t])

  const updateProgress = (
    mode: Exclude<KnowledgeProgressMode, null>,
    key: KnowledgeProgressKey,
    detail?: string,
  ) => {
    setProgressMode(mode)
    setProgressKey(key)
    if (detail !== undefined) {
      setProgressDetail(detail)
    }
  }

  if (!projectId) {
    return <Navigate to="/projects" replace />
  }

  const handleCreateSource = async () => {
    const cleanTitle = title.trim()
    const cleanContent = contentText.trim()

    updateProgress('save', 'validatingInput')

    if (cleanTitle.length < 2 || cleanContent.length < 20) {
      setNotice(t('projectKnowledge.validation'))
      updateProgress('save', 'failed')
      return
    }

    setNotice('')
    updateProgress('save', 'savingSource', cleanTitle)

    const created = await post<ProjectKnowledgeSource>(`/projects/${projectId}/knowledge/sources`, {
      sourceType,
      title: cleanTitle,
      contentText: cleanContent,
      documentDate: documentDate ? new Date(documentDate).toISOString() : undefined,
      versionLabel: versionLabel.trim() || undefined,
      authorityLevel,
    })

    if (created) {
      setTitle('')
      setDocumentDate('')
      setVersionLabel('')
      setContentText('')
      setNotice(t('projectKnowledge.sourceCreated'))
      setGuidedStep(2)
      updateProgress('save', 'completed', cleanTitle)
      await fetchKnowledge()
      return
    }

    updateProgress('save', 'failed', cleanTitle)
  }

  const handleImportFiles = async () => {
    if (!selectedFiles.length) {
      setNotice(t('projectKnowledge.selectFilesFirst'))
      return
    }

    setIsImporting(true)
    setNotice('')
    updateProgress('import', 'validatingInput', t('projectKnowledge.progress.fileCount', { count: selectedFiles.length }))

    try {
      let importedCount = 0
      const failedFiles: string[] = []

      for (const file of selectedFiles) {
        try {
          updateProgress('import', 'extractingDocumentText', file.name)
          const extractedText = (await extractFileText(file)).trim()
          if (extractedText.length < 20) {
            failedFiles.push(formatFileErrorMessage(file.name, t('projectKnowledge.fileTooShort')))
            continue
          }

          const derivedTitle = deriveTitleFromFileName(file.name).slice(0, 180)
          updateProgress('import', 'savingSource', file.name)
          const source = await post<ProjectKnowledgeSource>(`/projects/${projectId}/knowledge/sources`, {
            sourceType,
            title: derivedTitle,
            contentText: extractedText,
            documentDate: file.lastModified ? new Date(file.lastModified).toISOString() : undefined,
            versionLabel: versionLabel.trim() || undefined,
            authorityLevel,
          })

          if (!source) {
            failedFiles.push(formatFileErrorMessage(file.name, t('projectKnowledge.importFailed')))
            continue
          }

          updateProgress('import', 'aiExtracting', file.name)
          const extraction = await post(`/projects/${projectId}/knowledge/sources/${source.id}/extract`)
          if (!extraction) {
            failedFiles.push(formatFileErrorMessage(file.name, t('projectKnowledge.extractFailed')))
            continue
          }

          importedCount += 1
        } catch (fileError) {
          failedFiles.push(formatFileErrorMessage(file.name, describeFileProcessingError(file, fileError, t)))
        }
      }

      setSelectedFiles([])
      if (failedFiles.length) {
        const summary = importedCount > 0
          ? t('projectKnowledge.filesImportedWithFailures', { successCount: importedCount, failedCount: failedFiles.length })
          : t('projectKnowledge.filesAllFailed', { failedCount: failedFiles.length })
        setNotice([summary, ...failedFiles].join('\n'))
      } else {
        setNotice(t('projectKnowledge.filesImported', { count: importedCount }))
      }

      if (importedCount > 0) {
        setGuidedStep(2)
        updateProgress('import', 'completed')
      } else {
        updateProgress('import', 'failed')
      }

      await fetchKnowledge()
    } catch (uploadError) {
      setNotice(uploadError instanceof Error ? uploadError.message : t('projectKnowledge.importFailed'))
      updateProgress('import', 'failed')
    } finally {
      setIsImporting(false)
    }
  }

  const handleExtract = async (sourceId: string) => {
    const source = sources.find((item) => item.id === sourceId)
    updateProgress('extract', 'validatingInput', source?.title)
    setNotice('')
    updateProgress('extract', 'aiExtracting', source?.title)

    const result = await post(`/projects/${projectId}/knowledge/sources/${sourceId}/extract`)
    if (result) {
      setNotice(t('projectKnowledge.extracted'))
      setGuidedStep(2)
      updateProgress('extract', 'completed', source?.title)
      await fetchKnowledge()
      return
    }

    updateProgress('extract', 'failed', source?.title)
  }

  const handleApprove = async (sourceId: string) => {
    const source = sources.find((item) => item.id === sourceId)
    updateProgress('approve', 'reviewingExtraction', source?.title)
    setNotice('')
    updateProgress('approve', 'savingToMemory', source?.title)

    const result = await post(`/projects/${projectId}/knowledge/sources/${sourceId}/approve`)
    if (result) {
      setNotice(t('projectKnowledge.approved'))
      setGuidedStep(3)
      updateProgress('approve', 'completed', source?.title)
      await fetchKnowledge()
      return
    }

    updateProgress('approve', 'failed', source?.title)
  }

  const handleFileSelection = (files: File[]) => {
    setSelectedFiles(files)

    const firstFile = files[0]
    if (!firstFile) {
      return
    }

    if (!title.trim()) {
      setTitle(deriveTitleFromFileName(firstFile.name).slice(0, 180))
    }

    if (!documentDate) {
      setDocumentDate(toDateInputValue(firstFile.lastModified))
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-7xl px-3 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-600 dark:text-blue-300">
              {t('common.appName')}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
              {t('projectKnowledge.title')}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-400">
              {t('projectKnowledge.description')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/continuity/${projectId}`}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t('projectKnowledge.openContinuity')}
            </Link>
            <Link
              to="/projects"
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {t('navigation.projects')}
            </Link>
          </div>
        </div>

        {baseline && (
          <section className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t('projectKnowledge.baselineStatus')}
              </p>
              <h2 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
                {t(`projectKnowledge.status.${baseline.status}`)}
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {baseline.projectName}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('projectKnowledge.approvedMemory')}</p>
              <p className="mt-2 text-3xl font-bold text-emerald-600">{baseline.approvedMemoryCount}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('projectKnowledge.needsReview')}</p>
              <p className="mt-2 text-3xl font-bold text-amber-600">{baseline.needsReviewCount}</p>
            </div>
          </section>
        )}

        <section className="mb-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:p-5 shadow-sm dark:border-sky-900/60 dark:bg-sky-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700 dark:text-sky-300">
              {t('projectKnowledge.guide.label')}
            </p>
            <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
              {t('common.step', { current: guidedStep, total: 3 })}
            </span>
          </div>

          <ol className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {guidedSteps.map((step, index) => {
              const stepNumber = index + 1
              const isActive = guidedStep === stepNumber
              const isComplete = [stepOneComplete, stepTwoComplete, stepThreeComplete][index]

              return (
                <li key={step.title}>
                  <button
                    type="button"
                    onClick={() => setGuidedStep(stepNumber)}
                    onMouseEnter={() => setHoveredGuideStep(stepNumber)}
                    onMouseLeave={() => setHoveredGuideStep(null)}
                    onFocus={() => setHoveredGuideStep(stepNumber)}
                    onBlur={() => setHoveredGuideStep(null)}
                    className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                      isActive
                        ? 'border-sky-400 bg-white shadow-sm dark:border-sky-500 dark:bg-slate-900'
                        : 'border-sky-100 bg-white/60 hover:bg-white dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-900'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                        isComplete
                          ? 'bg-emerald-500 text-white'
                          : isActive
                            ? 'bg-sky-600 text-white'
                            : 'bg-sky-100 text-sky-700 dark:bg-slate-800 dark:text-sky-300'
                      }`}
                    >
                      {isComplete ? '✓' : stepNumber}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t('common.step', { current: stepNumber, total: 3 })}
                      </span>
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {step.title}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>

          <div className="mt-3 rounded-xl border border-sky-100 bg-white p-3 text-sm text-slate-700 shadow-sm dark:border-sky-900/50 dark:bg-slate-900 dark:text-slate-200">
            <p className="font-semibold text-slate-900 dark:text-white">{activeGuideStepData.title}</p>
            <p className="mt-1 text-slate-600 dark:text-slate-400">{activeGuideStepData.description}</p>
          </div>
        </section>

        {progressMode && progressSteps.length > 0 && (
          <div className="mb-5">
            <WorkflowProgressPanel
              title={t('projectKnowledge.progress.title')}
              subtitle={t('projectKnowledge.progress.subtitle')}
              detail={progressDetail || undefined}
              steps={progressSteps}
              activeKey={progressKey}
              failedHint={progressKey === 'failed' ? t('projectKnowledge.progress.failedHint') : undefined}
            />
          </div>
        )}

        {(notice || error) && (
          <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${
            error
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-200'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-200'
          } whitespace-pre-line`}>
            {error?.message || notice}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t('projectKnowledge.addSource')}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {t('projectKnowledge.addSourceHelp')}
            </p>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.sourceType')}</span>
                <select
                  value={sourceType}
                  onChange={(event) => setSourceType(event.target.value as ProjectKnowledgeSourceType)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                >
                  {sourceTypes.map((type) => (
                    <option key={type} value={type}>{t(`projectKnowledge.sourceTypes.${type}`)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.authority')}</span>
                <select
                  value={authorityLevel}
                  onChange={(event) => setAuthorityLevel(event.target.value as ProjectKnowledgeAuthorityLevel)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                >
                  {authorityLevels.map((level) => (
                    <option key={level} value={level}>{t(`projectKnowledge.authorityLevels.${level}`)}</option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.fileUpload')}</span>
                <input
                  type="file"
                  multiple
                  accept=".txt,.md,.csv,.tsv,.docx,.pdf,.xlsx"
                  onChange={(event) => handleFileSelection(Array.from(event.target.files ?? []))}
                  className="mt-1 block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-slate-800 dark:text-slate-300"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {t('projectKnowledge.fileUploadHelp')}
                </p>
                {!!selectedFiles.length && (
                  <div className="mt-2 rounded-md bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {selectedFiles.map((file) => (
                      <div key={`${file.name}-${file.lastModified}`}>
                        {file.name} · {new Date(file.lastModified).toLocaleDateString(i18n.language)}
                      </div>
                    ))}
                  </div>
                )}
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.versionLabel')}</span>
                <input
                  value={versionLabel}
                  onChange={(event) => setVersionLabel(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  placeholder="v1.0"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => void handleImportFiles()}
                  disabled={isLoading || isImporting}
                  className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isImporting ? t('common.loading') : t('projectKnowledge.importFiles')}
                </button>
              </div>
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.sourceTitle')}</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  placeholder={t('projectKnowledge.sourceTitlePlaceholder')}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.documentDate')}</span>
                <input
                  type="date"
                  value={documentDate}
                  onChange={(event) => setDocumentDate(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                />
              </label>
              <div className="hidden sm:block" />
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{t('projectKnowledge.contentText')}</span>
                <textarea
                  value={contentText}
                  onChange={(event) => setContentText(event.target.value)}
                  rows={12}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                  placeholder={t('projectKnowledge.contentPlaceholder')}
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => void handleCreateSource()}
              disabled={isLoading || isImporting}
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? t('common.loading') : t('projectKnowledge.saveSource')}
            </button>
          </section>

          <section className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('projectKnowledge.sources')}</h2>
              <div className="mt-3 space-y-2">
                {sourcesPagination.slice.map((source) => {
                  const latestExtraction = source.extractions?.[0]
                  const extractedCount = latestExtraction?.extractionJson.items?.length ?? 0
                  const isExpanded = expandedSourceIds.has(source.id)

                  return (
                    <div key={source.id} className="rounded-md border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => toggleExpandedId(setExpandedSourceIds, source.id)}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        aria-expanded={isExpanded}
                      >
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${isExpanded ? 'rotate-90' : ''}`}
                        />
                        <span className="min-w-0 flex-1 truncate font-semibold text-slate-900 dark:text-white">
                          {source.title}
                        </span>
                        <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {t(`projectKnowledge.sourceStatuses.${source.status}`)}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-700">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {buildSourceMeta([
                              t(`projectKnowledge.sourceTypes.${source.sourceType}`),
                              t(`projectKnowledge.authorityLevels.${source.authorityLevel}`),
                              source.documentDate ? new Date(source.documentDate).toLocaleDateString(i18n.language) : null,
                            ])}
                          </p>
                          {latestExtraction && (
                            <div className="mt-2 rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-800/80">
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {t('projectKnowledge.draftPreview')}
                              </p>
                              <p className="mt-1 text-slate-600 dark:text-slate-300">
                                {t('projectKnowledge.extractedItems', { count: extractedCount })}
                              </p>
                              <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {t('projectKnowledge.overview')}
                              </p>
                              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                                {latestExtraction.extractionJson.overview}
                              </p>
                              {extractedCount > 0 ? (
                                <div className="mt-3 space-y-2">
                                  {latestExtraction.extractionJson.items?.slice(0, 6).map((item, index) => (
                                    <div key={`${source.id}-${index}`} className="rounded border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                        {t(`projectKnowledge.memoryTypes.${item.type}`)}
                                      </p>
                                      <p className="mt-1 font-medium text-slate-900 dark:text-white">{item.title}</p>
                                      <p className="mt-1 text-slate-600 dark:text-slate-300">{item.content}</p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                                  {t('projectKnowledge.emptyDraft')}
                                </p>
                              )}
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => void handleExtract(source.id)}
                              disabled={isLoading || isImporting}
                              className="rounded-md border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60 dark:border-blue-700 dark:text-blue-200 dark:hover:bg-blue-950/30"
                            >
                              {t('projectKnowledge.extract')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleApprove(source.id)}
                              disabled={isLoading || isImporting || !latestExtraction}
                              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {t('projectKnowledge.approveBaseline')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {!sources.length && (
                  <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {t('projectKnowledge.noSources')}
                  </p>
                )}
              </div>
              <HistoryPagination
                page={sourcesPagination.page}
                totalPages={sourcesPagination.totalPages}
                total={sourcesPagination.total}
                onPrevious={() => setSourcesPage((current) => Math.max(1, current - 1))}
                onNext={() => setSourcesPage((current) => Math.min(sourcesPagination.totalPages, current + 1))}
                previousLabel={t('common.back')}
                nextLabel={t('common.next')}
                rangeLabel={t('projectKnowledge.paginationRange', {
                  from: sourcesPagination.from,
                  to: sourcesPagination.to,
                  total: sourcesPagination.total,
                })}
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{t('projectKnowledge.approvedMemoryTitle')}</h2>
              <div className="mt-3 space-y-2">
                {memoryPagination.slice.map((item) => {
                  const isExpanded = expandedMemoryIds.has(item.id)

                  return (
                    <div key={item.id} className="rounded-md border border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        onClick={() => toggleExpandedId(setExpandedMemoryIds, item.id)}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        aria-expanded={isExpanded}
                      >
                        <ChevronRight
                          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${isExpanded ? 'rotate-90' : ''}`}
                        />
                        <span className="min-w-0 flex-1 truncate font-semibold text-slate-900 dark:text-white">
                          {item.title}
                        </span>
                        <span className="shrink-0 rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                          {t(`projectKnowledge.memoryTypes.${item.type}`)}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-slate-200 px-3 py-3 text-sm dark:border-slate-700">
                          <p className="text-slate-600 dark:text-slate-300">{item.content}</p>
                          {item.source && (
                            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                              {t('projectKnowledge.source')}: {item.source.title}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                {!memoryItems.length && (
                  <p className="rounded-md border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    {t('projectKnowledge.noMemory')}
                  </p>
                )}
              </div>
              <HistoryPagination
                page={memoryPagination.page}
                totalPages={memoryPagination.totalPages}
                total={memoryPagination.total}
                onPrevious={() => setMemoryPage((current) => Math.max(1, current - 1))}
                onNext={() => setMemoryPage((current) => Math.min(memoryPagination.totalPages, current + 1))}
                previousLabel={t('common.back')}
                nextLabel={t('common.next')}
                rangeLabel={t('projectKnowledge.paginationRange', {
                  from: memoryPagination.from,
                  to: memoryPagination.to,
                  total: memoryPagination.total,
                })}
              />
            </div>
          </section>
        </div>
      </div>
    </Layout>
  )
}
