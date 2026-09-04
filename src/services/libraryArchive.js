import path from "node:path";
import AdmZip from "adm-zip";

const MAX_ARCHIVE_FILES = 250;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;
const SUPPORTED_EXTENSIONS = new Set([
  ".pdf", ".docx", ".txt", ".md", ".csv", ".json", ".html", ".htm", ".xml", ".rtf",
  ".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".cs", ".cpp", ".c", ".h", ".go",
  ".rb", ".php", ".sql", ".css", ".scss", ".yml", ".yaml", ".log"
]);

const MIME_TYPES = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".json": "application/json",
  ".csv": "text/csv",
  ".html": "text/html",
  ".htm": "text/html",
  ".xml": "application/xml",
  ".md": "text/markdown"
};

function normalizeEntryPath(value = "") {
  return String(value).replace(/\\/g, "/").replace(/^\.\//, "");
}

function isUnsafePath(entryPath) {
  const segments = entryPath.split("/");
  return !entryPath || entryPath.startsWith("/") || /^[a-zA-Z]:/.test(entryPath) || segments.includes("..");
}

export function getArchiveLimits() {
  return { maxFiles: MAX_ARCHIVE_FILES, maxFileBytes: MAX_FILE_BYTES, maxTotalBytes: MAX_TOTAL_BYTES };
}

export function readLibraryArchive(file) {
  if (!file?.buffer) throw new Error("Archivo ZIP requerido");

  let entries;
  try {
    entries = new AdmZip(file.buffer).getEntries();
  } catch {
    throw new Error("El ZIP no es válido o está dañado.");
  }

  if (entries.length > MAX_ARCHIVE_FILES * 4) {
    throw new Error("El ZIP contiene demasiadas entradas.");
  }

  const files = [];
  const skipped = [];
  let totalBytes = 0;

  for (const entry of entries) {
    if (entry.isDirectory) continue;

    const entryPath = normalizeEntryPath(entry.entryName);
    if (isUnsafePath(entryPath)) {
      throw new Error(`El ZIP contiene una ruta insegura: ${entry.entryName}`);
    }

    if (files.length >= MAX_ARCHIVE_FILES) {
      throw new Error(`El ZIP supera el máximo de ${MAX_ARCHIVE_FILES} documentos admitidos.`);
    }

    const extension = path.extname(entryPath).toLowerCase();
    if (extension === ".zip") {
      skipped.push({ path: entryPath, reason: "ZIP anidado no admitido" });
      continue;
    }
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      skipped.push({ path: entryPath, reason: "formato no admitido" });
      continue;
    }

    const size = Number(entry.header?.size || 0);
    const compressedSize = Number(entry.header?.compressedSize || 0);
    if (size > MAX_FILE_BYTES) {
      skipped.push({ path: entryPath, reason: "archivo mayor de 25 MB" });
      continue;
    }
    if (compressedSize > 0 && size / compressedSize > MAX_COMPRESSION_RATIO) {
      throw new Error(`El ZIP contiene un archivo con compresión sospechosa: ${entryPath}`);
    }

    totalBytes += size;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error("El contenido descomprimido del ZIP supera 150 MB.");
    }

    let buffer;
    try {
      buffer = entry.getData();
    } catch {
      throw new Error(`No se pudo abrir ${entryPath}. El ZIP puede estar cifrado o dañado.`);
    }

    files.push({
      originalname: entryPath,
      mimetype: MIME_TYPES[extension] || "text/plain",
      size: buffer.length,
      buffer
    });
  }

  if (!files.length) {
    throw new Error("El ZIP no contiene documentos compatibles.");
  }

  return { files, skipped };
}
