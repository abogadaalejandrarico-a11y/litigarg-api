import express from "express";
import authMiddlewares from "../middlewares/auth.js";
import { isAdminUser } from "../services/adminAccess.js";
import { getAiConfig, saveAiConfig } from "../services/aiConfig.js";
import { getBasePrompt } from "../services/openai.js";
import { ensureAuthorshipRecord } from "../services/authorship.js";

const router = express.Router();

function requireAdmin(req, res, next) {
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: "Solo la administradora puede configurar la IA" });
  }

  next();
}

router.get("/ai", authMiddlewares, requireAdmin, async (req, res) => {
  try {
    const config = await getAiConfig();
    const authorship = await ensureAuthorshipRecord(getBasePrompt());

    res.json({
      baseRules: getBasePrompt(),
      activeRules: config.customRules || getBasePrompt(),
      customRules: config.customRules || "",
      updatedAt: config.updatedAt || null,
      authorshipHash: authorship.base_rules_hash || authorship.baseRulesHash || null,
      authorshipCode: authorship.authorship_code || authorship.authorshipCode || null
    });
  } catch (error) {
    console.error("ERROR CARGANDO CONFIGURACION IA:", error);
    res.status(500).json({ error: "Error cargando configuración de IA" });
  }
});

router.put("/ai", authMiddlewares, requireAdmin, async (req, res) => {
  try {
    const { activeRules, customRules } = req.body;
    const config = await saveAiConfig({
      customRules: activeRules ?? customRules,
      userId: req.user.userId
    });

    res.json({
      message: "Configuración de IA guardada",
      customRules: config.customRules || "",
      updatedAt: config.updatedAt || null
    });
  } catch (error) {
    console.error("ERROR GUARDANDO CONFIGURACION IA:", error);
    res.status(500).json({ error: "Error guardando configuración de IA" });
  }
});

export default router;
