import express from "express";
import multer from "multer";
import authMiddlewares from "../middlewares/auth.js";
import { isPremiumActive } from "../services/subscription.js";
import { getFreeUsage, incrementFreeUsage } from "../services/usage.js";
import { extractDocumentText } from "../services/documentText.js";
import { generarRespuestaLegal } from "../services/openai.js";
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
    const respuesta = await generarRespuestaLegal(message, { userName });
    const updatedFreeUsage = await finishUsage(userId, access.premium, access.freeUsage);

    res.json({
      answer: respuesta,
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
    const respuesta = await generarRespuestaLegal(message, { userName });
    const updatedFreeUsage = await finishUsage(userId, access.premium, access.freeUsage);

    res.json({
      answer: respuesta,
      fileName: req.file.originalname,
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
