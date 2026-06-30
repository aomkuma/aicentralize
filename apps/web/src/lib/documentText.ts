type DocxTextExtractor = {
  extractRawText?: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  default?: {
    extractRawText?: (input: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }>
  }
}

export const DOCUMENT_FILE_EXTENSIONS = [
  '.txt',
  '.md',
  '.csv',
  '.tsv',
  '.docx',
  '.pdf',
  '.xlsx'
] as const

export function isDocumentFile(file: File | null) {
  if (!file) {
    return false
  }

  const lowerName = file.name.toLowerCase()
  if (DOCUMENT_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
    return true
  }

  return (
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.type === 'application/pdf' ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'text/plain' ||
    file.type === 'text/csv'
  )
}

export function isAudioVideoFile(file: File | null) {
  if (!file || isDocumentFile(file)) {
    return false
  }

  const lowerName = file.name.toLowerCase()
  return (
    file.type.startsWith('audio/') ||
    file.type.startsWith('video/') ||
    /\.(mp3|wav|m4a|aac|ogg|webm|mp4|mov|mkv|flac)$/i.test(lowerName)
  )
}

export function formatFileLastModified(timestamp: number, locale: string) {
  if (!timestamp) {
    return ''
  }

  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return date.toLocaleString(locale)
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
  const jszipModule = await import('jszip')
  const loadAsync = jszipModule.default.loadAsync

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

export async function extractFileText(file: File) {
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

export function describeDocumentFileError(file: File, error: unknown, t: (key: string) => string) {
  const message = error instanceof Error ? error.message : ''
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith('.pdf')) {
    if (message.includes('image-only') || message.includes('unsupported encoding')) {
      return t('meetings.fileReadErrors.pdfImageOnly')
    }
    return t('meetings.fileReadErrors.pdfGeneric')
  }

  if (lowerName.endsWith('.docx')) {
    return t('meetings.fileReadErrors.docxGeneric')
  }

  if (lowerName.endsWith('.xlsx')) {
    if (message.includes('Invalid XLSX structure')) {
      return t('meetings.fileReadErrors.xlsxInvalid')
    }
    return t('meetings.fileReadErrors.xlsxGeneric')
  }

  if (lowerName.endsWith('.csv') || lowerName.endsWith('.tsv')) {
    return t('meetings.fileReadErrors.csvGeneric')
  }

  if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
    return t('meetings.fileReadErrors.textGeneric')
  }

  if (message.startsWith('Unsupported file type:')) {
    return t('meetings.fileReadErrors.unsupportedType')
  }

  return message || t('meetings.errors.documentExtractionFailed')
}

export const MEETING_STUDIO_FILE_ACCEPT = [
  'audio/*',
  'video/*',
  '.txt',
  '.md',
  '.csv',
  '.tsv',
  '.docx',
  '.pdf',
  '.xlsx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv'
].join(',')
