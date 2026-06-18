import express from "express";
import multer from "multer";
import authMiddlewares from "../middlewares/auth.js";
import { isAdminUser } from "../services/adminAccess.js";
import { extractDocumentText, getLibraryTextLimit } from "../services/documentText.js";
import {
  findRelevantDocuments,
  getLibraryDocument,
  updateLibraryDocument,
  deleteLibraryDocument,
  formatDocumentContext,
  listLibraryDocuments,
  saveLibraryDocument
} from "../services/documentLibrary.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

function canManageLibrary(user) {
  return isAdminUser(user);
}

function requireLibraryAdmin(req, res, next) {
  if (!canManageLibrary(req.user)) {
    return res.status(403).json({ error: "Solo la cuenta creadora puede administrar la biblioteca" });
  }

  next();
}

router.get("/admin-status", authMiddlewares, (req, res) => {
  res.json({ canManageLibrary: canManageLibrary(req.user) });
});

router.get("/", authMiddlewares, requireLibraryAdmin, async (req, res) => {
  try {
    const documents = await listLibraryDocuments();
    res.json({ documents });
  } catch (error) {
    console.error("ERROR LISTANDO BIBLIOTECA:", error);
    res.status(500).json({ error: "Error cargando biblioteca" });
  }
});

router.post("/upload", authMiddlewares, requireLibraryAdmin, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Archivo requerido" });
    }

    const text = await extractDocumentText(req.file, {
      maxChars: getLibraryTextLimit()
    });

    const document = await saveLibraryDocument({
      file: req.file,
      text,
      userId: req.user.userId,
      title: req.body.title,
      author: req.body.author,
      category: req.body.category,
      tags: req.body.tags,
      description: req.body.description
    });

    res.json({
      message: "Documento guardado en biblioteca",
      document
    });
  } catch (error) {
    console.error("ERROR SUBIENDO A BIBLIOTECA:", error);
    res.status(500).json({
      error: error.message || "Error guardando documento en biblioteca"
    });
  }
});

router.post("/search", authMiddlewares, requireLibraryAdmin, async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: "Consulta requerida" });
    }

    const chunks = await findRelevantDocuments(query);

    res.json({
      results: chunks,
      context: formatDocumentContext(chunks)
    });
  } catch (error) {
    console.error("ERROR BUSCANDO EN BIBLIOTECA:", error);
    res.status(500).json({ error: "Error buscando en biblioteca" });
  }
});

router.get("/:id/download", authMiddlewares, requireLibraryAdmin, async (req, res) => {
  try {
    const document = await getLibraryDocument(req.params.id);
    const content = (document.chunks || [])
      .sort((a, b) => Number(a.chunkIndex || 0) - Number(b.chunkIndex || 0))
      .map(chunk => chunk.content)
      .join("\n\n");
    const safeName = String(document.title || document.fileName || "documento-biblioteca")
      .replace(/[^a-z0-9 _.-]/gi, "_")
      .slice(0, 90);

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.txt"`);
    res.send(content || document.textPreview || "");
  } catch (error) {
    console.error("ERROR DESCARGANDO DOCUMENTO DE BIBLIOTECA:", error);
    res.status(500).json({
      error: error.message || "Error descargando documento de biblioteca"
    });
  }
});

router.patch("/:id", authMiddlewares, requireLibraryAdmin, async (req, res) => {
  try {
    const document = await updateLibraryDocument(req.params.id, {
      title: req.body.title,
      author: req.body.author,
      category: req.body.category,
      tags: req.body.tags,
      description: req.body.description
    });

    res.json({
      message: "Documento actualizado en biblioteca",
      document
    });
  } catch (error) {
    console.error("ERROR EDITANDO DOCUMENTO DE BIBLIOTECA:", error);
    res.status(500).json({
      error: error.message || "Error editando documento de biblioteca"
    });
  }
});

router.delete("/:id", authMiddlewares, requireLibraryAdmin, async (req, res) => {
  try {
    const document = await deleteLibraryDocument(req.params.id);

    res.json({
      message: "Documento eliminado de biblioteca",
      document
    });
  } catch (error) {
    console.error("ERROR ELIMINANDO DOCUMENTO DE BIBLIOTECA:", error);
    res.status(500).json({
      error: error.message || "Error eliminando documento de biblioteca"
    });
  }
});

export default router;
