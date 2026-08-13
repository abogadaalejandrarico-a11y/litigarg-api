import express from "express";
import authMiddlewares from "../middlewares/auth.js";
import { isAdminUser } from "../services/adminAccess.js";
import { getAiConfig, saveAiConfig } from "../services/aiConfig.js";
import { hasGptAccess } from "../services/subscription.js";
import { getBasePrompt } from "../services/openai.js";
import { ensureAuthorshipRecord } from "../services/authorship.js";

const router = express.Router();

function normalizeGptUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

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
      activeGptUrl: config.activeGptUrl || "",
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
    const { activeRules, customRules, activeGptUrl } = req.body;
    const cleanGptUrl = String(activeGptUrl || "").trim();
    const normalizedGptUrl = normalizeGptUrl(cleanGptUrl);

    if (cleanGptUrl && !normalizedGptUrl) {
      return res.status(400).json({ error: "El enlace del GPT debe ser una URL segura que empiece por https://" });
    }

    const config = await saveAiConfig({
      customRules: activeRules ?? customRules,
      activeGptUrl: normalizedGptUrl,
      userId: req.user.userId
    });

    res.json({
      message: "Configuración de IA guardada",
      customRules: config.customRules || "",
      activeGptUrl: config.activeGptUrl || "",
      updatedAt: config.updatedAt || null
    });
  } catch (error) {
    console.error("ERROR GUARDANDO CONFIGURACION IA:", error);
    res.status(500).json({ error: "Error guardando configuración de IA" });
  }
});

router.get("/gpt-link", authMiddlewares, async (req, res) => {
  try {
    const allowed = isAdminUser(req.user) || await hasGptAccess(req.user.userId);

    if (!allowed) {
      return res.status(403).json({ error: "Tu prueba gratuita de 24 horas finalizo. Activa Premium para ingresar a LitigARG." });
    }

    const config = await getAiConfig();
    const url = normalizeGptUrl(config.activeGptUrl);

    if (!url) {
      return res.status(404).json({ error: "El acceso activo de LitigARG aun no esta configurado" });
    }

    res.json({ url });
  } catch (error) {
    console.error("ERROR CARGANDO ENLACE GPT:", error);
    res.status(500).json({ error: "Error cargando acceso a LitigARG" });
  }
});

export default router;
