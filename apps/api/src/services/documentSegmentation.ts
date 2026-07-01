/** Target size for one structural segment before AI chunk packing (similar to a PDF page batch). */
export const DOCUMENT_SEGMENT_TARGET_CHARS = 10_000;

const STRUCTURAL_MARKER_LINE =
  /^\[(?:Page|Part|Section|Rows|Sheet) [^\]]+\]$|^# [^\n]+$/;

export function hasStructuralMarkers(text: string) {
  return STRUCTURAL_MARKER_LINE.test(text);
}

export function splitIntoStructuralSections(text: string): string[] {
  const lines = text.split("\n");
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (STRUCTURAL_MARKER_LINE.test(line.trim()) && current.length > 0) {
      const joined = current.join("\n").trim();
      if (joined) {
        sections.push(joined);
      }
      current = [line];
      continue;
    }

    current.push(line);
  }

  const tail = current.join("\n").trim();
  if (tail) {
    sections.push(tail);
  }

  return sections.length ? sections : [text.trim()].filter(Boolean);
}

function charSplitWithOverlap(
  text: string,
  charLimit: number,
  overlap: number,
  maxChunks: number
): string[] {
  if (text.length <= charLimit) {
    return [text];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length && chunks.length < maxChunks) {
    const hardEnd = Math.min(start + charLimit, text.length);
    let end = hardEnd;

    if (hardEnd < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", hardEnd);
      const lineBreak = text.lastIndexOf("\n", hardEnd);
      const sentenceBreak = text.lastIndexOf(". ", hardEnd);
      const softEnd = Math.max(paragraphBreak, lineBreak, sentenceBreak);

      if (softEnd > start + Math.floor(charLimit * 0.6)) {
        end = softEnd + (softEnd === sentenceBreak ? 1 : 0);
      }
    }

    const chunk = text.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= text.length) {
      break;
    }

    start = Math.max(0, end - overlap);
  }

  return chunks;
}

export function buildAiExtractionChunks(
  text: string,
  options: {
    charLimit: number;
    overlap: number;
    maxChunks: number;
  }
): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.length <= options.charLimit) {
    return [trimmed];
  }

  const sections = splitIntoStructuralSections(trimmed);
  const chunks: string[] = [];
  let buffer = "";

  const flushBuffer = () => {
    const next = buffer.trim();
    if (next) {
      chunks.push(next);
    }
    buffer = "";
  };

  for (const section of sections) {
    if (chunks.length >= options.maxChunks) {
      break;
    }

    if (section.length > options.charLimit) {
      flushBuffer();
      for (const piece of charSplitWithOverlap(
        section,
        options.charLimit,
        options.overlap,
        options.maxChunks - chunks.length
      )) {
        chunks.push(piece);
        if (chunks.length >= options.maxChunks) {
          return chunks;
        }
      }
      continue;
    }

    if (buffer.length + section.length + 2 > options.charLimit && buffer) {
      flushBuffer();
    }

    buffer = buffer ? `${buffer}\n\n${section}` : section;
  }

  flushBuffer();

  if (chunks.length <= 1) {
    return chunks.length ? chunks : charSplitWithOverlap(trimmed, options.charLimit, options.overlap, options.maxChunks);
  }

  return chunks.slice(0, options.maxChunks);
}

function segmentBlocksIntoParts(
  blocks: string[],
  labelPrefix: string,
  targetChars = DOCUMENT_SEGMENT_TARGET_CHARS
) {
  const parts: string[] = [];
  let buffer = "";
  let partIndex = 0;

  const flush = () => {
    const trimmed = buffer.trim();
    if (!trimmed) {
      return;
    }
    partIndex += 1;
    parts.push(`[${labelPrefix} ${partIndex}]\n${trimmed}`);
    buffer = "";
  };

  for (const block of blocks) {
    const paragraph = block.trim();
    if (!paragraph) {
      continue;
    }

    if (paragraph.length > targetChars) {
      flush();
      let start = 0;
      while (start < paragraph.length) {
        partIndex += 1;
        const slice = paragraph.slice(start, start + targetChars).trim();
        if (slice) {
          parts.push(`[${labelPrefix} ${partIndex}]\n${slice}`);
        }
        start += targetChars;
      }
      continue;
    }

    if (buffer.length + paragraph.length + 2 > targetChars && buffer) {
      flush();
    }

    buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }

  flush();
  return parts;
}

export function segmentPlainText(text: string, targetChars = DOCUMENT_SEGMENT_TARGET_CHARS) {
  if (!text.trim()) {
    return text;
  }

  if (/^\[Page \d+\]/m.test(text)) {
    return text;
  }

  if (hasStructuralMarkers(text)) {
    return text;
  }

  if (/^#{1,6}\s+/m.test(text)) {
    return segmentMarkdownText(text, targetChars);
  }

  const blocks = text.split(/\n{2,}/);
  const parts = segmentBlocksIntoParts(blocks, "Part", targetChars);
  return parts.length ? parts.join("\n\n") : text;
}

export function segmentMarkdownText(text: string, targetChars = DOCUMENT_SEGMENT_TARGET_CHARS) {
  const lines = text.split("\n");
  const sections: string[] = [];
  let currentHeading = "Introduction";
  let currentBody: string[] = [];

  const flushSection = () => {
    const body = currentBody.join("\n").trim();
    if (!body && sections.length > 0) {
      currentBody = [];
      return;
    }
    sections.push(`[Section ${currentHeading}]\n${body || currentHeading}`);
    currentBody = [];
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
    if (headingMatch) {
      flushSection();
      currentHeading = headingMatch[1].trim() || "Section";
      continue;
    }
    currentBody.push(line);
  }
  flushSection();

  const packed = segmentBlocksIntoParts(sections, "Part", targetChars);
  return packed.length ? packed.join("\n\n") : text;
}

export function segmentTabularText(
  text: string,
  options?: { sheetName?: string; targetChars?: number }
) {
  const targetChars = options?.targetChars ?? DOCUMENT_SEGMENT_TARGET_CHARS;
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  if (rows.length <= 1) {
    return text;
  }

  const sheetLabel = options?.sheetName ?? "Data";
  const segments: string[] = [];
  let buffer: string[] = [];
  let charCount = 0;
  let startRow = 1;

  const flush = (endRow: number) => {
    if (!buffer.length) {
      return;
    }
    segments.push(`[Sheet ${sheetLabel} - Rows ${startRow}-${endRow}]\n${buffer.join("\n")}`);
    buffer = [];
    charCount = 0;
    startRow = endRow + 1;
  };

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    if (charCount + row.length + 1 > targetChars && buffer.length) {
      flush(rowNumber - 1);
    }
    buffer.push(row);
    charCount += row.length + 1;
  });

  if (buffer.length) {
    flush(startRow + buffer.length - 1);
  }

  return segments.join("\n\n");
}

export function segmentXlsxSheetText(sheetName: string, sheetText: string) {
  const trimmed = sheetText.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.length <= DOCUMENT_SEGMENT_TARGET_CHARS) {
    return `# ${sheetName}\n${trimmed}`;
  }

  const rowSegments = segmentTabularText(trimmed, { sheetName });
  return rowSegments;
}

export function applyStructuralSegmentation(text: string, extension: string) {
  if (!text.trim()) {
    return text;
  }

  if (extension === ".pdf" && /^\[Page \d+\]/m.test(text)) {
    return text;
  }

  if (hasStructuralMarkers(text)) {
    return text;
  }

  switch (extension) {
    case ".md":
      return segmentMarkdownText(text);
    case ".csv":
    case ".tsv":
      return segmentTabularText(text, { sheetName: extension === ".tsv" ? "TSV" : "CSV" });
    case ".xlsx":
      return text;
    default:
      return segmentPlainText(text);
  }
}
