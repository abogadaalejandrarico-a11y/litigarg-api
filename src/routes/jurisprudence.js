import express from "express";
import authMiddlewares from "../middlewares/auth.js";
import { searchJurisprudence } from "../services/jurisprudenceSearch.js";
import {
  listJurisprudenceByTopic,
  listJurisprudenceTopics,
  saveJurisprudenceSources
} from "../services/jurisprudenceLibrary.js";

const router = express.Router();
const CSJ_BACKEND_URL = "https://consultaprovidenciasbk.cortesuprema.gov.co";

function decodeOfficialPath(encodedPath = "") {
  const officialPath = Buffer.from(encodedPath, "base64url").toString("utf8");

  if (!officialPath.startsWith("/var/www/html/Index/PENAL/")) {
    throw new Error("Ruta de providencia no permitida");
  }

  if (!/\.(pdf|doc|docx)$/i.test(officialPath)) {
    throw new Error("Tipo de archivo no permitido");
  }

  return officialPath;
}

function getContentType(fileName = "") {
  if (/\.pdf$/i.test(fileName)) return "application/pdf";
  if (/\.docx$/i.test(fileName)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (/\.doc$/i.test(fileName)) return "application/msword";
  return "application/octet-stream";
}

router.get("/download/:encodedPath", async (req, res) => {
  try {
    const officialPath = decodeOfficialPath(req.params.encodedPath);
    const fileName = officialPath.split("/").pop() || "providencia";
    const response = await fetch(`${CSJ_BACKEND_URL}/downloadFile`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ path: officialPath })
    });

    if (!response.ok) {
      return res.status(502).send("No fue posible cargar la providencia oficial.");
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader("Content-Type", getContentType(fileName));
    res.setHeader("Content-Disposition", `inline; filename="${fileName.replace(/"/g, "")}"`);
    res.send(buffer);
  } catch (error) {
    console.error("ERROR DESCARGANDO PROVIDENCIA:", error);
    res.status(400).send("Enlace de providencia invalido.");
  }
});

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
