import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import gptRoutes from "./routes/gpt.js";
import paymentRoutes from "./routes/payments.js";
import adminRoutes from "./routes/admin.js";
import contraFiscaliaRoutes from "./routes/contraFiscalia.js";
import chatRoutes from "./routes/chats.js";
import jurisprudenceRoutes from "./routes/jurisprudence.js";
import libraryRoutes from "./routes/library.js";
import configRoutes from "./routes/config.js";
import learningRoutes from "./routes/learning.js";

dotenv.config();

console.log("INDEX.JS CARGADO EN RENDER");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("frontend"));

app.use("/api/auth", authRoutes);
app.use("/api/gpt", gptRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/gpt/contra-fiscalia", contraFiscaliaRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/jurisprudence", jurisprudenceRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/config", configRoutes);
app.use("/api/learning", learningRoutes);

app.get("/", (req, res) => {
  res.sendFile("frontend/index.html", { root: process.cwd() });
});

app.get(["/success", "/failure", "/pending"], (req, res) => {
  res.sendFile("frontend/index.html", { root: process.cwd() });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
