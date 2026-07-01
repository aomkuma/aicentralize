import mammoth from "mammoth";
import * as XLSX from "xlsx";

// pdf-parse v1 exposes a callable default export under CommonJS.
const pdfParse = require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string }>;

const KNOWLEDGE_TEXT_MAX_CHARS = 120_000;

const SUPPORTED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".csv",
  ".tsv",
  ".docx",
  ".pdf",
  ".xlsx"
]);

export class DocumentReadError extends Error {
  constructor(
    public readonly code:
      | "UNSUPPORTED_FILE_TYPE"
      | "FILE_TOO_SHORT"
      | "PDF_NO_TEXT"
      | "DOCUMENT_READ_FAILED",
    message: string
  ) {
    super(message);
    this.name = "DocumentReadError";
  }
}

function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot).toLowerCase();
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clipKnowledgeText(text: string) {
  if (text.length <= KNOWLEDGE_TEXT_MAX_CHARS) {
    return text;
  }

  return `${text.slice(0, KNOWLEDGE_TEXT_MAX_CHARS).trim()}\n\n[Truncated for knowledge import limit]`;
}

async function extractPdfText(buffer: Buffer) {
  try {
    const parsed = await pdfParse(buffer);
    const text = normalizeExtractedText(parsed.text ?? "");
    if (!text) {
      throw new DocumentReadError(
        "PDF_NO_TEXT",
        "PDF text extraction failed. This PDF may be image-only or use unsupported encoding."
      );
    }
    return text;
  } catch (error) {
    if (error instanceof DocumentReadError) {
      throw error;
    }
    throw new DocumentReadError(
      "DOCUMENT_READ_FAILED",
      error instanceof Error ? error.message : "PDF text extraction failed."
    );
  }
}

async function extractDocxText(buffer: Buffer) {
  try {
    const extracted = await mammoth.extractRawText({ buffer });
    return normalizeExtractedText(extracted.value ?? "");
  } catch (error) {
    throw new DocumentReadError(
      "DOCUMENT_READ_FAILED",
      error instanceof Error ? error.message : "DOCX text extraction failed."
    );
  }
}

function extractXlsxText(buffer: Buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetTexts: string[] = [];

    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) {
        continue;
      }

      const rows = XLSX.utils.sheet_to_csv(sheet, { FS: " | " }).trim();
      if (rows) {
        sheetTexts.push(`# ${name}\n${rows}`);
      }
    }

    return normalizeExtractedText(sheetTexts.join("\n\n"));
  } catch (error) {
    throw new DocumentReadError(
      "DOCUMENT_READ_FAILED",
      error instanceof Error ? error.message : "XLSX text extraction failed."
    );
  }
}

export function deriveTitleFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSupportedKnowledgeDocument(fileName: string) {
  return SUPPORTED_EXTENSIONS.has(extensionOf(fileName));
}

export async function extractDocumentText(buffer: Buffer, fileName: string): Promise<string> {
  const extension = extensionOf(fileName);

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new DocumentReadError("UNSUPPORTED_FILE_TYPE", `Unsupported file type: ${fileName}`);
  }

  let text = "";

  if (extension === ".txt" || extension === ".md" || extension === ".csv" || extension === ".tsv") {
    text = normalizeExtractedText(buffer.toString("utf8"));
  } else if (extension === ".docx") {
    text = await extractDocxText(buffer);
  } else if (extension === ".pdf") {
    text = await extractPdfText(buffer);
  } else if (extension === ".xlsx") {
    text = extractXlsxText(buffer);
  }

  if (text.length < 20) {
    throw new DocumentReadError("FILE_TOO_SHORT", "The extracted text is too short to create project knowledge.");
  }

  return clipKnowledgeText(text);
}
