import express from "express";
import multer from "multer";
import authMiddlewares from "../middlewares/auth.js";
import { extractDocumentText, getLibraryTextLimit } from "../services/documentText.js";
import {
  findRelevantDocuments,
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

router.get("/", authMiddlewares, async (req, res) => {
  try {
    const documents = await listLibraryDocuments();
    res.json({ documents });
  } catch (error) {
    console.error("ERROR LISTANDO BIBLIOTECA:", error);
    res.status(500).json({ error: "Error cargando biblioteca" });
  }
});

router.post("/upload", authMiddlewares, upload.single("file"), async (req, res) => {
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

router.post("/search", authMiddlewares, async (req, res) => {
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

export default router;
