import express from "express";
import authMiddlewares from "../middlewares/auth.js";
import { searchJurisprudence } from "../services/jurisprudenceSearch.js";
import { saveJurisprudenceSources } from "../services/jurisprudenceLibrary.js";

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

export default router;
