import express from "express";
import multer from "multer";
import authMiddlewares from "../middlewares/auth.js";
import { isPremiumActive } from "../services/subscription.js";
import { getFreeUsage, incrementFreeUsage } from "../services/usage.js";
import { extractDocumentText } from "../services/documentText.js";
import { generarRespuestaLegal } from "../services/openai.js";
import {
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

async function checkAccess(userId) {
  const premium = await isPremiumActive(userId);
  const freeUsage = await getFreeUsage(userId);

  if (!premium && freeUsage.remaining <= 0) {
    return {
      allowed: false,
      premium,
      freeUsage
    };
  }

  return {
    allowed: true,
    premium,
    freeUsage
  };
}

async function finishUsage(userId, premium, freeUsage) {
  return premium
    ? freeUsage
    : await incrementFreeUsage(userId);
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

router.post("/chat", authMiddlewares, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Mensaje requerido" });
    }

    const userId = req.user.userId;

    const access = await checkAccess(userId);

    if (!access.allowed) {
      return res.status(403).json({
        code: "FREE_LIMIT_REACHED",
        error: "Se acabó tu límite de uso gratuito. Para seguir disfrutando de LitigARG, debes adquirir la experiencia Premium o esperar 24 horas para acceder nuevamente al uso gratuito limitado.",
        freeUsage: access.freeUsage
      });
    }

    const userName = await getUserName(userId);
    const sources = await getOfficialSources(message);
    const respuesta = await generarRespuestaLegal(message, {
      userName,
      sourcesContext: formatSourcesForPrompt(sources)
    });
    const updatedFreeUsage = await finishUsage(userId, access.premium, access.freeUsage);

    res.json({
      answer: respuesta,
      sources,
      isPremium: access.premium,
      freeUsage: updatedFreeUsage
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
    const access = await checkAccess(userId);

    if (!access.allowed) {
      return res.status(403).json({
        code: "FREE_LIMIT_REACHED",
        error: "Se acabó tu límite de uso gratuito. Para seguir disfrutando de LitigARG, debes adquirir la experiencia Premium o esperar 24 horas para acceder nuevamente al uso gratuito limitado.",
        freeUsage: access.freeUsage
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
    const sources = await getOfficialSources(sourceQuery);
    const respuesta = await generarRespuestaLegal(message, {
      userName,
      sourcesContext: formatSourcesForPrompt(sources)
    });
    const updatedFreeUsage = await finishUsage(userId, access.premium, access.freeUsage);

    res.json({
      answer: respuesta,
      fileName: req.file.originalname,
      sources,
      isPremium: access.premium,
      freeUsage: updatedFreeUsage
    });
  } catch (error) {
    console.error("ERROR ANALIZANDO ARCHIVO:", error);
    res.status(500).json({
      error: error.message || "Error analizando archivo"
    });
  }
});

export default router;
