import express from "express";
import multer from "multer";
import authMiddlewares from "../middlewares/auth.js";
import { getUserPlan } from "../services/subscription.js";
import { getPlanAudioMaxBytes, getPlanVideoMaxBytes } from "../services/plans.js";
import { canUseDailyFeature, incrementDailyUsage } from "../services/usage.js";
import { extractDocumentText, hasMeaningfulDocumentText, isSupportedAudioFile, isSupportedImageFile, isSupportedVideoFile } from "../services/documentText.js";
import { extraerContextoJuridicoParaBusqueda, generarRespuestaLegal, generarRespuestaLegalConDocumento, generarRespuestaLegalConImagen, generarRespuestaLegalConTextoDocumento, transcribirAudio } from "../services/openai.js";
import {
  findRelevantDocuments,
  formatDocumentContext,
  getRequiredLibraryRules
} from "../services/documentLibrary.js";
import {
  addInlineSourceLinks,
  enforceVerifiedJudicialCitations,
  formatSourcesForPrompt,
  searchJurisprudence,
  shouldSearchJurisprudence
} from "../services/jurisprudenceSearch.js";

function requestedDecisionCount(text = "") {
  const normalized = String(text || "").toLowerCase();
  const wordCounts = { una: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5 };
  const match = normalized.match(/\b(\d+|una?|dos|tres|cuatro|cinco)\s+(?:sentencias?|providencias?|fallos?)\b/);
  return match ? (Number(match[1]) || wordCounts[match[1]] || 0) : 0;
}

function buildSourcesContext(sources, query, searchNeeded) {
  const base = sources.length
    ? formatSourcesForPrompt(sources)
    : searchNeeded
      ? "Busqueda oficial realizada: no se encontraron providencias suficientemente pertinentes para citar con seguridad en esta respuesta. Debes decirlo expresamente y no inventar ni forzar jurisprudencia."
      : "";
  const requested = requestedDecisionCount(query);
  const verifiedDecisions = sources.filter(source => source.sourceType === "jurisprudence").length;

  if (!requested || verifiedDecisions >= requested) return base;
  return `${base}\n\nCONTROL OBLIGATORIO: el usuario solicito ${requested} providencia(s), pero solo hay ${verifiedDecisions} providencia(s) verificadas y pertinentes en las fuentes admitidas. No completes la cantidad con memoria ni con referencias aproximadas. Indica expresamente la insuficiencia y entrega solo las verificadas.`.trim();
}
import {
  findRelevantJurisprudence,
  saveJurisprudenceSources
} from "../services/jurisprudenceLibrary.js";
import {
  findRelevantGuidance,
  formatGuidanceContext
} from "../services/learning.js";
import { getChatMemoryContext } from "../services/chats.js";
import { isAdminUserId } from "../services/adminAccess.js";
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

  if (!(await isAdminUserId(userId))) {
    return {
      allowed: false,
      adminOnly: true,
      plan,
      usage: null,
      counter: null
    };
  }
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

function adminOnlyMessage() {
  return "Por ahora la IA independiente de LitigARG esta disponible solo para la cuenta administradora mientras terminamos su preparacion para salir al mercado.";
}

function buildResponseGuidance(message = "") {
  const normalized = String(message || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (/(sistema penal oral acusatorio|sistema acusatorio|ley 906|audiencias preliminares|acusacion|preparatoria|juicio oral)/.test(normalized) && /(estructura|ensen|explica|muestra|toda)/.test(normalized)) {
    return [
      "La usuaria pidio una estructura integral del Sistema Penal Oral Acusatorio colombiano. No respondas en cuatro bloques generales ni en un resumen corto.",
      "Entrega una arquitectura estrategica amplia, similar a un mapa de litigacion: idea matriz, indagacion/investigacion, audiencias preliminares, imputacion, medida de aseguramiento, acusacion escrita, formulacion de acusacion, descubrimiento, preparatoria, juicio oral, practica probatoria, alegatos, sentido del fallo, articulo 447, sentencia, recursos y casacion.",
      "Desarrolla cada fase con contenido suficiente, en forma de relato juridico estrategico: explica que ocurre, por que importa, que debe controlar la defensa, que riesgo suele aparecer y como se sostiene oralmente.",
      "En cada fase importante usa subtitulos y desarrolla: juez competente, objeto de la audiencia o fase, normas clave de Ley 906, punto de control, ataque defensivo y formula oral breve. No uses el rotulo Finalidad; usa Objeto y desarrollalo con contexto.",
      "No inventes articulos. Usa esta guia normativa minima: audiencias preliminares arts. 153 y 154; imputacion arts. 286 a 289 y 292; captura arts. 297 a 302; medida de aseguramiento arts. 306 a 317; acusacion arts. 336 a 343; descubrimiento arts. 344 a 347; preparatoria arts. 355 a 365; juicio oral arts. 366 a 454, en especial 371 a 374, 383 a 404, 437 a 441, 443, 446, 447 y 448; recursos arts. 176 y ss.; casacion arts. 180 a 184.",
      "En audiencias preliminares explica que existen diferentes tipos de audiencias preliminares. Si una guia oficial o interna de audiencias preliminares aparece en biblioteca o fuentes verificadas, mencionala y enlazala; si no existe enlace verificado, no inventes el vinculo y usa como soporte normativo la Ley 906 de 2004.",
      "Dentro de audiencias preliminares desarrolla las audiencias de impulso del proceso en vinetas: legalizacion de captura, formulacion de imputacion e imposicion de medida de aseguramiento. Para cada una explica objeto, norma base y control defensivo.",
      "Legalizacion de captura: explica que su objeto es evaluar si las condiciones de captura cumplen requisitos constitucionales y legales, incluyendo flagrancia u orden judicial, derechos del capturado y articulos pertinentes de Ley 906.",
      "Formulacion de imputacion: explica que su objeto es que la Fiscalia comunique al procesado los hechos juridicamente relevantes y cargos provisionales, permitiendo comprension y defensa.",
      "Imposicion de medida de aseguramiento: explica que su objeto es decidir si procede una medida provisional mientras avanza el proceso, bajo inferencia razonable, necesidad, proporcionalidad y articulos 306, 308 y siguientes de Ley 906.",
      "Primero indica brevemente: revise la biblioteca interna de LitigARG y luego contraste con fuentes oficiales externas. Si la biblioteca no arrojo fragmentos pertinentes, dilo con naturalidad sin extenderte.",
      "Si la biblioteca interna contiene una sentencia o providencia, tratala como posible fuente jurisprudencial, no como doctrina. Solo citela con enlace si aparece tambien en las fuentes externas verificadas; si no aparece, mencionala como providencia guardada pendiente de verificacion oficial.",
      "Usa las fuentes verificadas entregadas: biblioteca interna cuando haya fragmentos, Ley 906 y sentencias estructurales disponibles. Cada sentencia mencionada debe llevar enlace directo junto al nombre. No agregues providencias que no esten en fuentes.",
      "Al final incluye una tabla de mapa completo del proceso y una lista de jurisprudencia verificada con su regla util."
    ].join("\n");
  }

  return "";
}


function extractLibraryLegalReferences(libraryContext = "") {
  const text = String(libraryContext || "");
  const references = [
    ...(text.match(/\b(?:SP|AP|CP)[-\s]?\d{1,6}[-\s]?\d{4}\b/gi) || []),
    ...(text.match(/\b(?:SU|T|C)[-\s]?\d{1,4}[-\s]?(?:de\s+)?\d{2,4}\b/gi) || []),
    ...(text.match(/\brad(?:icado)?\.?\s*\d{4,8}\b/gi) || [])
  ];

  const sentenceTitles = text.match(/(?:Sentencia|Providencia|Auto)\s+(?:SU|T|C|SP|AP|CP)?[-\s]?\d{1,6}(?:[-\s](?:de\s+)?\d{2,4})?/gi) || [];

  return [...new Set([...references, ...sentenceTitles].map(item => item.replace(/\s+/g, " ").trim()).filter(Boolean))]
    .slice(0, 12)
    .join("\n");
}

function buildLibrarySearchQuery(message = "") {
  const normalized = String(message || "")
    .normalize("NFD")
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase();

  if (/(sistema penal oral acusatorio|sistema acusatorio|ley 906|audiencias preliminares|acusacion|preparatoria|juicio oral)/.test(normalized)) {
    return [
      message,
      "Sistema Penal Oral Acusatorio Ley 906 estructura del proceso penal colombiano",
      "audiencias preliminares control de garantias legalizacion de captura formulacion de imputacion medida de aseguramiento",
      "guia audiencias preliminares juez de control de garantias Consejo Superior de la Judicatura",
      "acusacion descubrimiento probatorio audiencia preparatoria juicio oral alegatos sentido del fallo sentencia recursos casacion",
      "Wilson Gomez guia practica abogado defensor control de garantias medida de aseguramiento"
    ].join("\n");
  }

  return message;
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
      .slice(0, 8);
  } catch (error) {
    console.error("ERROR BUSCANDO FUENTES OFICIALES:", error);
    return [];
  }
}

async function getLibraryContext(text) {
  try {
    const normalized = String(text || "")
      .normalize("NFD")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .toLowerCase();
    const isBroadSpoaQuery = /(sistema penal oral acusatorio|sistema acusatorio|ley 906|audiencias preliminares|acusacion|preparatoria|juicio oral)/.test(normalized);
    const chunks = await findRelevantDocuments(text, isBroadSpoaQuery ? 12 : undefined);
    const formatted = formatDocumentContext(chunks);

    if (formatted) {
      return {
        context: ["Revision de biblioteca interna realizada antes de acudir a fuentes externas. Fragmentos internos pertinentes encontrados:", formatted].join("\n\n"),
        sources: [...new Map(chunks.map(chunk => [String(chunk.documentId), {
          id: chunk.documentId,
          title: chunk.title || "Documento interno",
          sourceType: "internal_library",
          category: chunk.category || "biblioteca",
          topics: chunk.topics || []
        }])).values()]
      };
    }

    return { context: "Revision de biblioteca interna realizada antes de acudir a fuentes externas: no se encontraron fragmentos internos suficientemente pertinentes para esta consulta.", sources: [] };
  } catch (error) {
    console.error("ERROR BUSCANDO BIBLIOTECA INTERNA:", error);
    return { context: "Revision de biblioteca interna intentada, pero hubo un error consultandola. No inventes material interno.", sources: [] };
  }
}

async function buildInternalKnowledgeContext(query) {
  const [rules, library] = await Promise.all([
    getRequiredLibraryRules(),
    getLibraryContext(buildLibrarySearchQuery(query))
  ]);
  return {
    context: [rules.context, library.context].filter(Boolean).join("\n\n"),
    sources: [...rules.sources, ...library.sources.filter(source =>
      !rules.sources.some(rule => String(rule.id) === String(source.id))
    )]
  };
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
      if (access.adminOnly) {
        return res.status(403).json({
          code: "ADMIN_ONLY_INDEPENDENT_AI",
          error: adminOnlyMessage()
        });
      }

      return res.status(403).json({
        code: "DAILY_LIMIT_REACHED",
        error: limitMessage("message", access.plan.name),
        usage: access.usage,
        freeUsage: access.usage.messages
      });
    }

    const userName = await getUserName(userId);
    const internalKnowledge = await buildInternalKnowledgeContext(message);
    const libraryContext = internalKnowledge.context;
    const libraryLegalReferences = extractLibraryLegalReferences(libraryContext);
    const officialSourceQuery = libraryLegalReferences
      ? message + "\n\nReferencias detectadas en biblioteca interna para verificar en fuentes oficiales:\n" + libraryLegalReferences
      : message;
    const sourceSearchNeeded = shouldSearchJurisprudence(officialSourceQuery);
    const sources = await getOfficialSources(officialSourceQuery);
    const learningContext = await getLearningContext(message);
    const conversationContext = await getChatMemoryContext(userId, conversationId, {
      excludeLatestUserText: message
    });
    const respuesta = await generarRespuestaLegal(message, {
      userName,
      conversationContext,
      libraryContext,
      learningContext,
      responseGuidance: buildResponseGuidance(message),
      sourcesContext: buildSourcesContext(sources, message, sourceSearchNeeded)
    });
    const linkedAnswer = addInlineSourceLinks(enforceVerifiedJudicialCitations(respuesta, sources), sources);
    const updatedUsage = await finishUsage(userId, "message");

    res.json({
      answer: linkedAnswer,
      sources,
      internalSources: internalKnowledge.sources,
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
    if (!req.file) {
      return res.status(400).json({
        code: "FILE_REQUIRED",
        error: "No se recibio ningun archivo. Selecciona un documento e intenta nuevamente."
      });
    }

    const userId = req.user.userId;
    const prompt = req.body.prompt || "Analiza este documento desde la perspectiva de litigacion penal y argumentacion juridica.";
    const conversationId = req.body.conversationId || "";
    const isVideo = isSupportedVideoFile(req.file);
    const isAudio = !isVideo && isSupportedAudioFile(req.file);
    const accessKind = isVideo ? "video" : isAudio ? "audio" : "file";
    const access = await checkAccess(userId, accessKind);

    if (!access.allowed) {
      if (access.adminOnly) {
        return res.status(403).json({
          code: "ADMIN_ONLY_INDEPENDENT_AI",
          error: adminOnlyMessage()
        });
      }

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
    let documentContext = "";
    let useDocumentReasoning = false;
    let usePdfVision = false;
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
      documentContext = [
        `Imagen adjunta: ${req.file.originalname}`,
        "La imagen debe examinarse visualmente antes de formular conclusiones juridicas."
      ].join("\n");
      message = `
${prompt}

Nombre del archivo: ${req.file.originalname}

Tipo de archivo: imagen cargada por el usuario.
      `.trim();
    } else {
      useDocumentReasoning = true;
      const documentText = await extractDocumentText(req.file);

      if (!hasMeaningfulDocumentText(documentText)) {
        const isPdf = req.file.mimetype === "application/pdf" || req.file.originalname.toLowerCase().endsWith(".pdf");

        if (!isPdf) {
          return res.status(422).json({
            code: "DOCUMENT_TEXT_NOT_EXTRACTABLE",
            error: "El documento no contiene suficiente texto extraible para analizarlo. Verifica el archivo o sube una version con texto legible."
          });
        }

        usePdfVision = true;
        documentContext = [
          `Archivo PDF escaneado: ${req.file.originalname}`,
          "La extraccion convencional no encontro texto suficiente.",
          "El PDF completo se adjunta como entrada visual para leer sus paginas antes de responder."
        ].join("\n");
        message = `
${prompt}

Nombre del archivo: ${req.file.originalname}

Este PDF parece estar escaneado. Lee visualmente todas las paginas adjuntas antes de analizarlo. Basa la respuesta en el contenido real del archivo y distingue cualquier texto ilegible o dato incierto.
        `.trim();
        sourceQuery = `${prompt}\n${req.file.originalname}\nPDF escaneado para lectura visual`;
      } else {
        documentContext = [
          `Archivo: ${req.file.originalname}`,
          `Texto extraido: ${documentText.length} caracteres.`,
          "El contenido completo disponible para analizar aparece delimitado en el mensaje del usuario."
        ].join("\n");
        message = `
${prompt}

Nombre del archivo: ${req.file.originalname}

INICIO DEL CONTENIDO EXTRAIDO DEL DOCUMENTO
${documentText}
FIN DEL CONTENIDO EXTRAIDO DEL DOCUMENTO

Instruccion obligatoria: analiza el contenido delimitado arriba. El archivo fue recibido y su texto esta disponible en esta solicitud; no digas que no tienes acceso al adjunto.
        `.trim();
        sourceQuery = `${prompt}\n${req.file.originalname}\n${documentText.slice(0, 3000)}`;
      }
    }

    if (usePdfVision) {
      const preliminaryLegalContext = await extraerContextoJuridicoParaBusqueda(req.file, prompt);
      if (preliminaryLegalContext) {
        sourceQuery = `${prompt}\n${req.file.originalname}\n${preliminaryLegalContext}`;
        documentContext = `${documentContext}\n\nAnalisis preliminar usado exclusivamente para buscar fuentes:\n${preliminaryLegalContext}`;
      }
    }

    const internalKnowledge = await buildInternalKnowledgeContext(sourceQuery);
    const libraryContext = internalKnowledge.context;
    const libraryLegalReferences = extractLibraryLegalReferences(libraryContext);
    const officialSourceQuery = libraryLegalReferences
      ? sourceQuery + "\n\nReferencias detectadas en biblioteca interna para verificar en fuentes oficiales:\n" + libraryLegalReferences
      : sourceQuery;
    const sourceSearchNeeded = shouldSearchJurisprudence(officialSourceQuery);
    const sources = await getOfficialSources(officialSourceQuery);
    const learningContext = await getLearningContext(sourceQuery);
    const conversationContext = await getChatMemoryContext(userId, conversationId, {
      excludeLatestUserText: visibleUserMessage
    });
    const answerOptions = {
      userName,
      conversationContext,
      libraryContext,
      learningContext,
      documentContext,
      sourcesContext: buildSourcesContext(sources, prompt, sourceSearchNeeded)
    };

    if (isImage) {
      respuesta = await generarRespuestaLegalConImagen(req.file, message, answerOptions);
    } else if (usePdfVision) {
      respuesta = await generarRespuestaLegalConDocumento(req.file, message, answerOptions);
    } else if (useDocumentReasoning) {
      respuesta = await generarRespuestaLegalConTextoDocumento(message, answerOptions);
    } else {
      respuesta = await generarRespuestaLegal(message, answerOptions);
    }

    const linkedAnswer = addInlineSourceLinks(enforceVerifiedJudicialCitations(respuesta, sources), sources);
    const updatedUsage = await finishUsage(userId, accessKind);

    res.json({
      answer: linkedAnswer,
      fileName: req.file.originalname,
      sources,
      internalSources: internalKnowledge.sources,
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
