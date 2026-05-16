import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import gptRoutes from "./routes/gpt.js";
import paymentRoutes from "./routes/payments.js";
import adminRoutes from "./routes/admin.js";
import contraFiscaliaRoutes from "./routes/contraFiscalia.js";

dotenv.config();

console.log("🔥 INDEX.JS CARGADO EN RENDER");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// 🔥 Ruta base (robusta)
app.get("/", (req, res) => {
  res.send("Litigarg API funcionando 🚀");
});

// Rutas API
app.use("/api/auth", authRoutes);
app.use("/api/gpt", gptRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/gpt/contra-fiscalia", contraFiscaliaRoutes);

// Servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
