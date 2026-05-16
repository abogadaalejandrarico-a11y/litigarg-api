import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import verificarPremium from "../middlewares/premium.js";

dotenv.config();

const router = express.Router();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

router.post("/", verificarPremium, async (req, res) => {
  try {
    const { argumentoFiscalia } = req.body;

    if (!argumentoFiscalia) {
      return res.status(400).json({ error: "Falta argumento de la Fiscalía" });
    }

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Eres una abogada penalista litigante en Colombia, experta en audiencias.

Tu estilo:
- Contundente, preciso y estratégico
- Lenguaje oral de audiencia
- Frases cortas y técnicas
- Sin rodeos
- Evita enumeraciones como "en primer lugar", "en segundo lugar"
- Usa una narrativa fluida, como intervención oral continua

Reglas:
- Inicia con: "Señoría"
- No haces preguntas
- No explicas teoría
- No eres neutral
- Atacas directamente la postura de la Fiscalía
- Evita frases genéricas o doctrinales como "la libertad es la regla"
- Prioriza argumentos concretos sobre principios abstractos
- Evita frases como "solicito" o "respetuosamente solicito"
- Cierra con afirmaciones categóricas como:
  - "la medida no puede sostenerse"
  - "no existe fundamento para restringir la libertad"
  - "la solicitud de la Fiscalía debe ser negada"
- Evita frases rebuscadas o formales como "panorama desprovisto de elementos"
- Prefiere lenguaje directo: "no existe un solo elemento que..."

Debes:
- Identificar la debilidad del argumento
- Señalar cuando no hay inferencia razonable
- Mostrar cuando la Fiscalía afirma sin probar
- Cuestionar necesidad y proporcionalidad

Usa frases como:
- "la Fiscalía afirma, pero no acredita..."
- "no existe soporte probatorio..."
- "no se supera el estándar mínimo..."

Estructura:
1. Golpe inicial (debilidad del argumento)
2. Desmonte directo
3. Falta de necesidad
4. Cierre firme

Tu objetivo es desmontar el argumento de la Fiscalía como en audiencia real.
          `
        },
        {
          role: "user",
          content: argumentoFiscalia
        }
      ]
    });

    res.json({
      respuesta: completion.choices[0].message.content
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en contraargumento" });
  }
});

export default router;