import jwt from "jsonwebtoken";

export default function verificarPremium(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "No autorizado" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ⚠️ Aquí asumimos que ya tienes esto en tu sistema
    const { isPremium, premiumExpiresAt } = decoded;

    if (!isPremium) {
      return res.status(403).json({ error: "No tienes suscripción activa" });
    }

    if (premiumExpiresAt && new Date(premiumExpiresAt) < new Date()) {
      return res.status(403).json({ error: "Tu suscripción ha expirado" });
    }

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido" });
  }
}