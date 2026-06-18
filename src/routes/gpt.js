import express from "express";
import multer from "multer";
import authMiddlewares from "../middlewares/auth.js";
import { getUserPlan } from "../services/subscription.js";
import { getPlanAudioMaxBytes, getPlanVideoMaxBytes } from "../services/plans.js";
import { canUseDailyFeature, incrementDailyUsage } from "../services/usage.js";
import { extractDocumentText, isSupportedAudioFile, isSupportedImageFile, isSupportedVideoFile } from "../services/documentText.js";
import { generarRespuestaLegal, generarRespuestaLegalConImagen, transcribirAudio } from "../services/openai.js";
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
import {
  findRelevantGuidance,
  formatGuidanceContext
} from "../services/learning.js";
import { getChatMemoryContext } from "../services/chats.js";
import { readDB } from "../db/db.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024
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
  const feature = kind === "file"
    ? "analisis de archivos"
    : kind === "audio"
      ? "analisis de audios"
      : kind === "video"
        ? "analisis de videos"
      : "preguntas";
  return `Se acabo tu limite diario de ${feature} del plan ${planName}. Podras volver a usarlo cuando se recargue tu cupo diario o cambiar a un plan superior para ampliar tus limites.`;
}

async function getUserName(userId) {
  const db = await readDB();
  const user = (db.users || []).find(item => Number(item.id) === Number(userId));

  return user?.username || user?.email?.split("@")[0] || "";
}

function normalizeForSourceScore(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function scoreResponseSource(source = {}, query = "") {
  const haystack = normalizeForSourceScore([
    source.title,
    source.extract,
    source.snippet,
    source.fileName,
    source.topics?.join(" ")
  ].filter(Boolean).join(" "));
  const terms = normalizeForSourceScore(query)
    .split(/\s+/)
    .filter(term => term.length > 4);

  let score = Number(source.relevanceScore || 0);

  if (source.official) score += 8;
  if (source.verified) score += 5;
  if (source.extractVerified || source.sourceType === "law") score += 4;
  if (source.year && Number(source.year) >= 2020) score += 1;
  if (source.sourceType === "jurisprudence" && source.readStatus !== "read" && !source.citationVerified) score -= 20;
  if (["repository_search", "secondary_reference"].includes(source.sourceType)) score -= 30;

  for (const term of terms.slice(0, 10)) {
    if (haystack.includes(term)) score += 1;
  }

  return score;
}

async function getOfficialSources(text) {
  if (!shouldSearchJurisprudence(text)) {
    return [];
  }

  try {
    const result = await searchJurisprudence(text);
    const officialSources = result.answerSources || [];
    await saveJurisprudenceSources(officialSources, text);

    const librarySources = officialSources.length >= 2
      ? []
      : await findRelevantJurisprudence(text, 3);
    const byUrl = new Map();

    [...officialSources, ...librarySources].forEach(source => {
      const canBeCited = source.sourceType === "law" ||
        (source.sourceType === "jurisprudence" && source.readStatus === "read" && source.extractVerified) ||
        (source.sourceType === "jurisprudence" && source.citationVerified);

      if (canBeCited && source.url && !byUrl.has(source.url)) {
        byUrl.set(source.url, source);
      }
    });

    return [...byUrl.values()]
      .sort((a, b) => scoreResponseSource(b, text) - scoreResponseSource(a, text))
      .slice(0, 4);
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

async function getLearningContext(text) {
  try {
    const guidance = await findRelevantGuidance(text);
    return formatGuidanceContext(guidance);
  } catch (error) {
    console.error("ERROR BUSCANDO APRENDIZAJES:", error);
    return "";
  }
}

router.post("/chat", authMiddlewares, async (req, res) => {
  try {
    const { message, conversationId } = req.body;

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
    const learningContext = await getLearningContext(message);
    const conversationContext = await getChatMemoryContext(userId, conversationId, {
      excludeLatestUserText: message
    });
    const respuesta = await generarRespuestaLegal(message, {
      userName,
      conversationContext,
      libraryContext,
      learningContext,
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
    const conversationId = req.body.conversationId || "";
    const isVideo = isSupportedVideoFile(req.file);
    const isAudio = !isVideo && isSupportedAudioFile(req.file);
    const accessKind = isVideo ? "video" : isAudio ? "audio" : "file";
    const access = await checkAccess(userId, accessKind);

    if (!access.allowed) {
      return res.status(403).json({
        code: "DAILY_LIMIT_REACHED",
        error: limitMessage(accessKind, access.plan.name),
        usage: access.usage,
        freeUsage: access.usage.messages
      });
    }

    const userName = await getUserName(userId);
    const isImage = isSupportedImageFile(req.file);
    const maxAudioBytes = getPlanAudioMaxBytes(access.plan.id, { admin: access.plan.id === "admin" });
    const maxVideoBytes = getPlanVideoMaxBytes(access.plan.id, { admin: access.plan.id === "admin" });
    let message = "";
    let sourceQuery = `${prompt}\n${req.file.originalname}`;
    let respuesta = "";
    const visibleUserMessage = `Documento adjunto: ${req.file.originalname}${prompt ? `\n\n${prompt}` : ""}`;

    if (isVideo) {
      if (!maxVideoBytes || req.file.size > maxVideoBytes) {
        const maxMb = Math.round(maxVideoBytes / 1024 / 1024);
        return res.status(400).json({
          error: `Tu plan permite videos de hasta ${maxMb} MB.`
        });
      }

      const transcription = await transcribirAudio(req.file);

      if (!transcription) {
        return res.status(400).json({ error: "No pude extraer o transcribir el audio del video." });
      }

      message = `
${prompt}

Nombre del archivo: ${req.file.originalname}

Transcripcion del audio del video:
${transcription}
      `.trim();
      sourceQuery = `${prompt}\n${req.file.originalname}\n${transcription.slice(0, 3000)}`;
    } else if (isAudio) {
      if (!maxAudioBytes || req.file.size > maxAudioBytes) {
        const maxMb = Math.round(maxAudioBytes / 1024 / 1024);
        return res.status(400).json({
          error: `Tu plan permite audios de hasta ${maxMb} MB.`
        });
      }

      const transcription = await transcribirAudio(req.file);

      if (!transcription) {
        return res.status(400).json({ error: "No pude transcribir el audio." });
      }

      message = `
${prompt}

Nombre del archivo: ${req.file.originalname}

Transcripcion del audio:
${transcription}
      `.trim();
      sourceQuery = `${prompt}\n${req.file.originalname}\n${transcription.slice(0, 3000)}`;
    } else if (isImage) {
      message = `
${prompt}

Nombre del archivo: ${req.file.originalname}

Tipo de archivo: imagen cargada por el usuario.
      `.trim();
    } else {
      const documentText = await extractDocumentText(req.file);

      if (!documentText) {
        return res.status(400).json({ error: "No pude extraer texto del documento." });
      }

      message = `
${prompt}

Nombre del archivo: ${req.file.originalname}

Contenido del documento:
${documentText}
      `.trim();
      sourceQuery = `${prompt}\n${req.file.originalname}\n${documentText.slice(0, 3000)}`;
    }

    const sourceSearchNeeded = shouldSearchJurisprudence(sourceQuery);
    const sources = await getOfficialSources(sourceQuery);
    const libraryContext = await getLibraryContext(sourceQuery);
    const learningContext = await getLearningContext(sourceQuery);
    const conversationContext = await getChatMemoryContext(userId, conversationId, {
      excludeLatestUserText: visibleUserMessage
    });
    const answerOptions = {
      userName,
      conversationContext,
      libraryContext,
      learningContext,
      sourcesContext: sources.length
        ? formatSourcesForPrompt(sources)
        : sourceSearchNeeded
          ? "Busqueda oficial realizada: no se encontraron providencias suficientemente pertinentes para citar con seguridad en esta respuesta. Debes decirlo expresamente y no inventar ni forzar jurisprudencia."
          : ""
    };

    if (isImage) {
      respuesta = await generarRespuestaLegalConImagen(req.file, message, answerOptions);
    } else {
      respuesta = await generarRespuestaLegal(message, answerOptions);
    }

    const linkedAnswer = addInlineSourceLinks(respuesta, sources);
    const updatedUsage = await finishUsage(userId, accessKind);

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
