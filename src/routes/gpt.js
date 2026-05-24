import express from "express";
import authMiddlewares from "../middlewares/auth.js";
import { isPremiumActive } from "../services/subscription.js";
import { getFreeUsage, incrementFreeUsage } from "../services/usage.js";
import { generarRespuestaLegal } from "../services/openai.js";

const router = express.Router();

router.post("/chat", authMiddlewares, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Mensaje requerido" });
    }

    const userId = req.user.userId;

    const premium = await isPremiumActive(userId);
    const freeUsage = await getFreeUsage(userId);

    if (!premium && freeUsage.remaining <= 0) {
      return res.status(403).json({
        code: "FREE_LIMIT_REACHED",
        error: "Ya usaste tus preguntas gratis. Activa Premium para seguir usando LitigARG.",
        freeUsage
      });
    }

    const respuesta = await generarRespuestaLegal(message);
    const updatedFreeUsage = premium
      ? freeUsage
      : await incrementFreeUsage(userId);

    res.json({
      answer: respuesta,
      isPremium: premium,
      freeUsage: updatedFreeUsage
    });

  } catch (error) {
    console.error("ERROR OPENAI:", error);
    res.status(500).json({ error: "Error con OpenAI" });
  }
});

export default router;
