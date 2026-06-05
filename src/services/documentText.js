import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const MAX_DOCUMENT_CHARS = 18000;
const MAX_LIBRARY_CHARS = 300000;
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".html",
  ".htm",
  ".xml",
  ".rtf",
  ".js",
  ".ts",
  ".jsx",
  ".tsx",
  ".py",
  ".java",
  ".cs",
  ".cpp",
  ".c",
  ".h",
  ".go",
  ".rb",
  ".php",
  ".sql",
  ".css",
  ".scss",
  ".yml",
  ".yaml",
  ".log"
]);
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp"
]);
const IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp"
]);
const AUDIO_EXTENSIONS = new Set([
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".m4a",
  ".wav",
  ".webm",
  ".ogg"
]);
const AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/mpga",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "video/mp4",
  "video/webm"
]);

export async function extractDocumentText(file, options = {}) {
  if (!file) {
    throw new Error("Archivo requerido");
  }

  const maxChars = options.maxChars || MAX_DOCUMENT_CHARS;
  const mimeType = file.mimetype;
  const name = file.originalname || "documento";
  const lowerName = name.toLowerCase();

  if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
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
    lowerName.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    return cleanText(result.value, maxChars);
  }

  if (mimeType?.startsWith("text/") || hasTextExtension(lowerName)) {
    return cleanText(file.buffer.toString("utf8"), maxChars);
  }

  throw new Error("Formato no soportado. Usa PDF, Word .docx o archivos de texto, codigo, CSV, JSON, HTML, Markdown, XML, YAML o SQL.");
}

export function getLibraryTextLimit() {
  return MAX_LIBRARY_CHARS;
}

export function isSupportedImageFile(file) {
  if (!file) {
    return false;
  }

  const mimeType = file.mimetype || "";
  const name = (file.originalname || "").toLowerCase();

  return IMAGE_MIME_TYPES.has(mimeType) || [...IMAGE_EXTENSIONS].some(extension => name.endsWith(extension));
}

export function isSupportedAudioFile(file) {
  if (!file) {
    return false;
  }

  const mimeType = file.mimetype || "";
  const name = (file.originalname || "").toLowerCase();

  return AUDIO_MIME_TYPES.has(mimeType) || [...AUDIO_EXTENSIONS].some(extension => name.endsWith(extension));
}

function cleanText(text, maxChars = MAX_DOCUMENT_CHARS) {
  return (text || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function hasTextExtension(name) {
  return [...TEXT_EXTENSIONS].some(extension => name.endsWith(extension));
}
