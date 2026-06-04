import express from "express";
import multer from "multer";
import authMiddlewares from "../middlewares/auth.js";
import { getUserPlan } from "../services/subscription.js";
import { canUseDailyFeature, incrementDailyUsage } from "../services/usage.js";
import { extractDocumentText } from "../services/documentText.js";
import { generarRespuestaLegal } from "../services/openai.js";
import {
  findRelevantDocuments,
  formatDocumentContext
} from "../services/documentLibrary.js";
import {
  addInlineSourceLinks,
  formatSourcesForPrompt,
  searchJurisprudence,
  shouldSearchJurisprudence
} from "../services/jurisprudenceSearch.js";
import {
  findRelevantJurisprudence,
  saveJurisprudenceSources
} from "../services/jurisprudenceLibrary.js";
import { readDB } from "../db/db.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024
  }
});

async function checkAccess(userId, kind = "message") {
  const plan = await getUserPlan(userId);
  const dailyAccess = await canUseDailyFeature(userId, kind);

  if (!dailyAccess.allowed) {
    return {
      allowed: false,
      plan,
      usage: dailyAccess.usage,
      counter: dailyAccess.counter
    };
  }

  return {
    allowed: true,
    plan,
    usage: dailyAccess.usage,
    counter: dailyAccess.counter
  };
}

async function finishUsage(userId, kind = "message") {
  return incrementDailyUsage(userId, kind);
}

function limitMessage(kind, planName) {
  const feature = kind === "file" ? "analisis de archivos" : "preguntas";
  return `Se acabo tu limite diario de ${feature} del plan ${planName}. Podras volver a usarlo cuando se recargue tu cupo diario o cambiar a un plan superior para ampliar tus limites.`;
}

async function getUserName(userId) {
  const db = await readDB();
  const user = (db.users || []).find(item => Number(item.id) === Number(userId));

  return user?.username || user?.email?.split("@")[0] || "";
}

async function getOfficialSources(text) {
  if (!shouldSearchJurisprudence(text)) {
    return [];
  }

  try {
    const result = await searchJurisprudence(text);
    const officialSources = result.sources || [];
    await saveJurisprudenceSources(officialSources, text);

    const librarySources = await findRelevantJurisprudence(text);
    const byUrl = new Map();

    [...officialSources, ...librarySources].forEach(source => {
      if (source.url && !byUrl.has(source.url)) {
        byUrl.set(source.url, source);
      }
    });

    return [...byUrl.values()];
  } catch (error) {
    console.error("ERROR BUSCANDO FUENTES OFICIALES:", error);
    return [];
  }
}

async function getLibraryContext(text) {
  try {
    const chunks = await findRelevantDocuments(text);
    return formatDocumentContext(chunks);
  } catch (error) {
    console.error("ERROR BUSCANDO BIBLIOTECA INTERNA:", error);
    return "";
  }
}

router.post("/chat", authMiddlewares, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Mensaje requerido" });
    }

    const userId = req.user.userId;
    const access = await checkAccess(userId, "message");

    if (!access.allowed) {
      return res.status(403).json({
        code: "DAILY_LIMIT_REACHED",
        error: limitMessage("message", access.plan.name),
        usage: access.usage,
        freeUsage: access.usage.messages
      });
    }

    const userName = await getUserName(userId);
    const sourceSearchNeeded = shouldSearchJurisprudence(message);
    const sources = await getOfficialSources(message);
    const libraryContext = await getLibraryContext(message);
    const respuesta = await generarRespuestaLegal(message, {
      userName,
      libraryContext,
      sourcesContext: sources.length
        ? formatSourcesForPrompt(sources)
        : sourceSearchNeeded
          ? "Busqueda oficial realizada: no se encontraron providencias suficientemente pertinentes para citar con seguridad en esta respuesta. Debes decirlo expresamente y no inventar ni forzar jurisprudencia."
          : ""
    });
    const linkedAnswer = addInlineSourceLinks(respuesta, sources);
    const updatedUsage = await finishUsage(userId, "message");

    res.json({
      answer: linkedAnswer,
      sources,
      isPremium: access.plan.id !== "free",
      plan: access.plan,
      usage: updatedUsage,
      freeUsage: updatedUsage.messages
    });

  } catch (error) {
    console.error("ERROR OPENAI:", error);
    res.status(500).json({ error: "Error con OpenAI" });
  }
});

router.post("/analyze-file", authMiddlewares, upload.single("file"), async (req, res) => {
  try {
    const userId = req.user.userId;
    const prompt = req.body.prompt || "Analiza este documento desde la perspectiva de litigacion penal y argumentacion juridica.";
    const access = await checkAccess(userId, "file");

    if (!access.allowed) {
      return res.status(403).json({
        code: "DAILY_LIMIT_REACHED",
        error: limitMessage("file", access.plan.name),
        usage: access.usage,
        freeUsage: access.usage.messages
      });
    }

    const documentText = await extractDocumentText(req.file);

    if (!documentText) {
      return res.status(400).json({ error: "No pude extraer texto del documento." });
    }

    const message = `
${prompt}

Nombre del archivo: ${req.file.originalname}

Contenido del documento:
${documentText}
    `.trim();

    const userName = await getUserName(userId);
    const sourceQuery = `${prompt}\n${req.file.originalname}\n${documentText.slice(0, 3000)}`;
    const sourceSearchNeeded = shouldSearchJurisprudence(sourceQuery);
    const sources = await getOfficialSources(sourceQuery);
    const libraryContext = await getLibraryContext(sourceQuery);
    const respuesta = await generarRespuestaLegal(message, {
      userName,
      libraryContext,
      sourcesContext: sources.length
        ? formatSourcesForPrompt(sources)
        : sourceSearchNeeded
          ? "Busqueda oficial realizada: no se encontraron providencias suficientemente pertinentes para citar con seguridad en esta respuesta. Debes decirlo expresamente y no inventar ni forzar jurisprudencia."
          : ""
    });
    const linkedAnswer = addInlineSourceLinks(respuesta, sources);
    const updatedUsage = await finishUsage(userId, "file");

    res.json({
      answer: linkedAnswer,
      fileName: req.file.originalname,
      sources,
      isPremium: access.plan.id !== "free",
      plan: access.plan,
      usage: updatedUsage,
      freeUsage: updatedUsage.messages
    });
  } catch (error) {
    console.error("ERROR ANALIZANDO ARCHIVO:", error);
    res.status(500).json({
      error: error.message || "Error analizando archivo"
    });
  }
});

export default router;
