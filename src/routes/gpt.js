import express from "express";
import authMiddlewares from "../middlewares/auth.js";
import { isPremiumActive } from "../services/subscription.js";
import { generarRespuestaLegal } from "../services/openai.js";

const router = express.Router();

router.post("/chat", authMiddlewares, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Mensaje requerido" });
    }

    const userId = req.user.userId;

    // const premium = await isPremiumActive(userId);

// if (!premium) {
//   return res.status(403).json({
//     error: "No tienes suscripción activa"
//   });
// }

    const respuesta = await generarRespuestaLegal(message);

    res.json({
      answer: respuesta
    });

  } catch (error) {
    console.error("ERROR OPENAI:", error);
    res.status(500).json({ error: "Error con OpenAI" });
  }
});

export default router;