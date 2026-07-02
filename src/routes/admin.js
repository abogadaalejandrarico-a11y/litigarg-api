import express from "express";
import { readDB } from "../db/db.js";
import { activatePremiumSubscription } from "../services/subscription.js";

const router = express.Router();

function verifyAdmin(req, res, next) {
  const adminSecret = process.env.ADMIN_SECRET;
  const requestSecret = req.headers["x-admin-secret"];

  if (!adminSecret || requestSecret !== adminSecret) {
    return res.status(401).json({ error: "No autorizado" });
  }

  next();
}

router.post("/activate-premium", verifyAdmin, async (req, res) => {
  const { userId, plan } = req.body;

  if (!userId || !plan) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  if (!["premium", "premium_mensual", "pro_mensual", "plus_mensual"].includes(plan)) {
    return res.status(400).json({ error: "Plan invalido" });
  }

  const db = await readDB();
  const user = db.users.find(u => u.id === Number(userId));

  if (!user) {
    return res.status(404).json({ error: "Usuario no encontrado" });
  }

  const subscription = await activatePremiumSubscription(userId, plan, "manual_admin");

  res.json({ message: "Premium activado", expiresAt: subscription.expiresAt });
});

export default router;
