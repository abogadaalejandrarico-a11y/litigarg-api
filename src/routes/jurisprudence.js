import express from "express";
import authMiddlewares from "../middlewares/auth.js";
import { searchJurisprudence } from "../services/jurisprudenceSearch.js";
import {
  listJurisprudenceByTopic,
  listJurisprudenceTopics,
  saveJurisprudenceSources
} from "../services/jurisprudenceLibrary.js";

const router = express.Router();

router.post("/search", authMiddlewares, async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: "Consulta requerida" });
    }

    const result = await searchJurisprudence(query);
    await saveJurisprudenceSources(result.sources || [], query);
    res.json(result);
  } catch (error) {
    console.error("ERROR BUSCANDO JURISPRUDENCIA:", error);
    res.status(500).json({
      error: error.message || "Error buscando jurisprudencia"
    });
  }
});

router.get("/topics", authMiddlewares, async (req, res) => {
  try {
    const topics = await listJurisprudenceTopics();
    res.json({ topics });
  } catch (error) {
    console.error("ERROR LISTANDO TEMAS:", error);
    res.status(500).json({ error: "Error cargando temas jurisprudenciales" });
  }
});

router.get("/topics/:topic", authMiddlewares, async (req, res) => {
  try {
    const sources = await listJurisprudenceByTopic(req.params.topic);
    res.json({
      topic: req.params.topic,
      sources
    });
  } catch (error) {
    console.error("ERROR CARGANDO TEMA:", error);
    res.status(500).json({ error: "Error cargando precedentes del tema" });
  }
});

export default router;
