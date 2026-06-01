import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const MAX_DOCUMENT_CHARS = 18000;
const MAX_LIBRARY_CHARS = 300000;

export async function extractDocumentText(file, options = {}) {
  if (!file) {
    throw new Error("Archivo requerido");
  }

  const maxChars = options.maxChars || MAX_DOCUMENT_CHARS;
  const mimeType = file.mimetype;
  const name = file.originalname || "documento";

  if (mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    const parser = new PDFParse({ data: file.buffer });

    try {
      const result = await parser.getText();
      return cleanText(result.text, maxChars);
    } finally {
      await parser.destroy();
    }
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.toLowerCase().endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return cleanText(result.value, maxChars);
  }

  if (mimeType?.startsWith("text/") || name.toLowerCase().endsWith(".txt")) {
    return cleanText(file.buffer.toString("utf8"), maxChars);
  }

  throw new Error("Formato no soportado. Usa PDF, Word .docx o texto .txt");
}

export function getLibraryTextLimit() {
  return MAX_LIBRARY_CHARS;
}

function cleanText(text, maxChars = MAX_DOCUMENT_CHARS) {
  return (text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}
