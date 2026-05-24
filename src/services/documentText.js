import { createRequire } from "module";
import mammoth from "mammoth";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const MAX_DOCUMENT_CHARS = 18000;

export async function extractDocumentText(file) {
  if (!file) {
    throw new Error("Archivo requerido");
  }

  const mimeType = file.mimetype;
  const name = file.originalname || "documento";

  if (mimeType === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    const result = await pdfParse(file.buffer);
    return cleanText(result.text);
  }

  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.toLowerCase().endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return cleanText(result.value);
  }

  if (mimeType?.startsWith("text/") || name.toLowerCase().endsWith(".txt")) {
    return cleanText(file.buffer.toString("utf8"));
  }

  throw new Error("Formato no soportado. Usa PDF, Word .docx o texto .txt");
}

function cleanText(text) {
  return (text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_DOCUMENT_CHARS);
}
