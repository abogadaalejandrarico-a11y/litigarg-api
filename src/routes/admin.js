import express from "express";
import { readDB, writeDB } from "../db/db.js";

const router = express.Router();

router.post("/activate-premium", async (req, res) => {
  const { userId, plan } = req.body;

  if (!userId || !plan) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  let days = 30;
  if (plan === "premium_anual") days = 365;

  const expires = new Date();
  expires.setDate(expires.getDate() + days);

  const db = await readDB();

  db.subscriptions.push({
    id: db.subscriptions.length + 1,
    userId: Number(userId),
    plan,
    status: "active",
    expiresAt: expires.toISOString(),
    created_at: new Date().toISOString()
  });

  await writeDB(db);

  res.json({ message: "Premium activado", expiresAt: expires.toISOString() });
});

export default router;