const STRUCTURAL_MARKER_LINE =
  /^\[(?:Page|Part|Section|Rows|Sheet) [^\]]+\]$|^# [^\n]+$/;

export function splitIntoStructuralSections(text: string): string[] {
  const lines = text.split('\n');
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (STRUCTURAL_MARKER_LINE.test(line.trim()) && current.length > 0) {
      const joined = current.join('\n').trim();
      if (joined) {
        sections.push(joined);
      }
      current = [line];
      continue;
    }

    current.push(line);
  }

  const tail = current.join('\n').trim();
  if (tail) {
    sections.push(tail);
  }

  return sections.length ? sections : [text.trim()].filter(Boolean);
}

function charSplitWithOverlap(
  text: string,
  charLimit: number,
  overlap: number,
  maxChunks: number,
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
      const paragraphBreak = text.lastIndexOf('\n\n', hardEnd);
      const lineBreak = text.lastIndexOf('\n', hardEnd);
      const sentenceBreak = text.lastIndexOf('. ', hardEnd);
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
  },
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
  let buffer = '';

  const flushBuffer = () => {
    const next = buffer.trim();
    if (next) {
      chunks.push(next);
    }
    buffer = '';
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
        options.maxChunks - chunks.length,
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
    return chunks.length
      ? chunks
      : charSplitWithOverlap(trimmed, options.charLimit, options.overlap, options.maxChunks);
  }

  return chunks.slice(0, options.maxChunks);
}

function segmentBlocksIntoParts(blocks: string[], labelPrefix: string, targetChars: number) {
  const parts: string[] = [];
  let buffer = '';
  let partIndex = 0;

  const flush = () => {
    const trimmed = buffer.trim();
    if (!trimmed) {
      return;
    }
    partIndex += 1;
    parts.push(`[${labelPrefix} ${partIndex}]\n${trimmed}`);
    buffer = '';
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

export function segmentPlainText(text: string, targetChars = 10_000) {
  if (!text.trim()) {
    return text;
  }

  if (/^\[Page \d+\]/m.test(text) || STRUCTURAL_MARKER_LINE.test(text)) {
    return text;
  }

  const blocks = text.split(/\n{2,}/);
  const parts = segmentBlocksIntoParts(blocks, 'Part', targetChars);
  return parts.length ? parts.join('\n\n') : text;
}

export const MEETING_ANALYSIS_CHUNK_CHAR_LIMIT = 12_000;
export const MEETING_ANALYSIS_CHUNK_OVERLAP = 800;
export const MEETING_ANALYSIS_MAX_CHUNKS = 80;

export function buildMeetingAnalysisChunks(text: string) {
  const prepared = segmentPlainText(text);
  return buildAiExtractionChunks(prepared, {
    charLimit: MEETING_ANALYSIS_CHUNK_CHAR_LIMIT,
    overlap: MEETING_ANALYSIS_CHUNK_OVERLAP,
    maxChunks: MEETING_ANALYSIS_MAX_CHUNKS,
  });
}
