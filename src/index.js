import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/auth.js";
import gptRoutes from "./routes/gpt.js";
import paymentRoutes from "./routes/payments.js";
import adminRoutes from "./routes/admin.js";
import contraFiscaliaRoutes from "./routes/contraFiscalia.js";

dotenv.config();

const app = express();

console.log("🔥 INDEX.JS CARGADO EN RENDER");

// Middlewares
app.use(cors());
app.use(express.json());

// ✅ Ruta principal
app.get("/", (req, res) => {
  return res.status(200).send("Litigarg API funcionando 🚀");
});

// ✅ Rutas API
app.use("/api/auth", authRoutes);
app.use("/api/gpt", gptRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/gpt/contra-fiscalia", contraFiscaliaRoutes);

// ✅ Puerto
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});