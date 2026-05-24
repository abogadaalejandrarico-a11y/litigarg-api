import jwt from "jsonwebtoken";
import { isPremiumActive } from "../services/subscription.js";

export default async function verificarPremium(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const premium = await isPremiumActive(decoded.userId);

    if (!premium) {
      return res.status(403).json({ error: "No tienes suscripcion activa" });
    }

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({ error: "Token invalido" });
  }
}
