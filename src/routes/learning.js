import express from "express";
import authMiddlewares from "../middlewares/auth.js";
import { isAdminUserId } from "../services/adminAccess.js";
import {
  findRelevantGuidance,
  formatGuidanceContext,
  saveResponseFeedback
} from "../services/learning.js";

const router = express.Router();

router.post("/feedback", authMiddlewares, async (req, res) => {
  try {
    const userId = req.user.userId;
    const {
      chatId,
      userMessage,
      assistantAnswer,
      rating,
      correction,
      sources
    } = req.body;

    if (!assistantAnswer && !correction) {
      return res.status(400).json({ error: "Respuesta o correccion requerida" });
    }

    const feedback = await saveResponseFeedback({
      userId,
      chatId,
      userMessage,
      assistantAnswer,
      rating,
      correction,
      sources
    });

    res.json({
      ok: true,
      feedback,
      learned: Boolean(feedback.learnedGuidanceId)
    });
  } catch (error) {
    console.error("ERROR GUARDANDO APRENDIZAJE:", error);
    res.status(500).json({ error: "No se pudo guardar la retroalimentacion" });
  }
});

router.get("/guidance", authMiddlewares, async (req, res) => {
  try {
    const admin = await isAdminUserId(req.user.userId);

    if (!admin) {
      return res.status(403).json({ error: "Solo la administradora puede consultar aprendizajes" });
    }

    const query = req.query.q || "";
    const guidance = await findRelevantGuidance(query, 10);

    res.json({
      guidance,
      context: formatGuidanceContext(guidance)
    });
  } catch (error) {
    console.error("ERROR CONSULTANDO APRENDIZAJE:", error);
    res.status(500).json({ error: "No se pudo consultar el aprendizaje" });
  }
});

export default router;
