import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { readDB, writeDB } from "../db/db.js";
import authMiddlewares from "../middlewares/auth.js";
import { getActiveSubscription, getGptTrialAccess, getUserPlan } from "../services/subscription.js";
import { isAdminUser } from "../services/adminAccess.js";
import {
  sendAccountCreatedEmail,
  sendPasswordChangedEmail,
  sendPasswordResetEmail
} from "../services/email.js";

const router = express.Router();
const TERMS_VERSION = "LitigARG julio 2026";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function findUserByEmail(users, email) {
  const cleanEmail = normalizeEmail(email);
  return users.find(user => normalizeEmail(user.email) === cleanEmail);
}

function maskEmailForLogs(email) {
  const cleanEmail = normalizeEmail(email);
  const [name = "", domain = ""] = cleanEmail.split("@");

  if (!domain) return "correo-invalido";

  const visibleName = name.length <= 2 ? name[0] || "*" : `${name.slice(0, 2)}***`;
  return `${visibleName}@${domain}`;
}

function hashResetToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getRequestIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || req.ip || req.socket?.remoteAddress || null;
}

function getAppBaseUrl(req) {
  const configuredUrl = process.env.APP_URL || process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL;

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
}

// 🔥 REGISTER
router.post("/register", async (req, res) => {
  try {
    const { email, password, username, termsAccepted, termsVersion } = req.body;
    const cleanUsername = (username || "").trim();

    if (!cleanUsername || cleanUsername.length > 10) {
      return res.status(400).json({
        error: "El nombre de usuario debe tener máximo 10 caracteres"
      });
    }

    if (termsAccepted !== true) {
      return res.status(400).json({
        error: "Debes aceptar los terminos y condiciones para crear tu cuenta"
      });
    }

    const db = await readDB();

    const existingUser = db.users.find(u => u.email === email);

    if (existingUser) {
      return res.status(400).json({ error: "El correo ya existe" });
    }

    const existingUsername = db.users.find(u =>
      (u.username || "").toLowerCase() === cleanUsername.toLowerCase()
    );

    if (existingUsername) {
      return res.status(400).json({ error: "Ese nombre de usuario ya existe" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: db.users.length + 1,
      username: cleanUsername,
      email,
      password: hashedPassword,
      termsAcceptedAt: new Date().toISOString(),
      termsVersion: termsVersion || TERMS_VERSION,
      termsAcceptedIp: getRequestIp(req),
      termsAcceptedUserAgent: req.get("user-agent") || null,
      created_at: new Date().toISOString()
    };

    db.users.push(newUser);
    await writeDB(db);

    try {
      await sendAccountCreatedEmail(newUser);
    } catch (error) {
      console.error("ERROR ENVIANDO CORREO DE CUENTA:", error);
    }

    res.json({ message: "Usuario creado", userId: newUser.id });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en registro" });
  }
});

// 🔥 LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const db = await readDB();

    const user = findUserByEmail(db.users, email);

    if (!user) {
      return res.status(400).json({ error: "Usuario no encontrado" });
    }

    const passwordHash = user.password || user.password_hash;
    const validPassword = passwordHash
      ? await bcrypt.compare(password, passwordHash)
      : false;

    if (!validPassword) {
      return res.status(400).json({ error: "Contraseña incorrecta" });
    }

    const subscription = (db.subscriptions || []).find(sub =>
      sub.userId === user.id &&
      sub.status === "active" &&
      new Date(sub.expiresAt) > new Date()
    );

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        username: user.username || null,
        isPremium: !!subscription,
        premiumExpiresAt: subscription ? subscription.expiresAt : null
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en login" });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const db = await readDB();
    const user = findUserByEmail(db.users, email);

    if (user) {
      console.log(`RECUPERACION DE CONTRASENA: cuenta encontrada ${maskEmailForLogs(email)}`);

      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetUrl = `${getAppBaseUrl(req)}/?resetToken=${resetToken}`;

      user.resetTokenHash = hashResetToken(resetToken);
      user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await writeDB(db);

      try {
        await sendPasswordResetEmail(user, resetUrl);
      } catch (error) {
        console.error("ERROR ENVIANDO CORREO DE RECUPERACION:", error);
      }
    } else {
      console.log(`RECUPERACION DE CONTRASENA: sin cuenta registrada ${maskEmailForLogs(email)}`);
    }

    res.json({
      message: "Si el correo existe, recibirás un enlace para recuperar tu contraseña."
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error solicitando recuperación de contraseña" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword, confirmPassword } = req.body;

    if (!token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({
        error: "Escribe una contraseña nueva de mínimo 6 caracteres"
      });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({
        error: "La nueva contraseña y la confirmación no coinciden"
      });
    }

    const tokenHash = hashResetToken(token);
    const db = await readDB();
    const user = db.users.find(u =>
      (u.resetTokenHash || u.reset_token_hash) === tokenHash &&
      new Date(u.resetTokenExpiresAt || u.reset_token_expires_at || 0) > new Date()
    );

    if (!user) {
      return res.status(400).json({ error: "El enlace no es válido o ya expiró" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    delete user.password_hash;
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    delete user.reset_token_hash;
    delete user.reset_token_expires_at;
    await writeDB(db);

    sendPasswordChangedEmail(user).catch(error =>
      console.error("ERROR ENVIANDO CORREO DE CONTRASEÑA:", error)
    );

    res.json({ message: "Contraseña actualizada. Ya puedes iniciar sesión." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error restableciendo contraseña" });
  }
});

router.get("/me", authMiddlewares, async (req, res) => {
  try {
    const db = await readDB();
    const user = db.users.find(u => Number(u.id) === Number(req.user.userId));

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const subscription = await getActiveSubscription(user.id);
    const admin = isAdminUser(user);
    const plan = await getUserPlan(user.id);
    const trial = admin || subscription ? { active: false, expiresAt: null } : await getGptTrialAccess(user.id);

    res.json({
      user: {
        id: user.id,
        username: user.username || null,
        email: user.email,
        isAdmin: admin
          },
      subscription: admin
        ? {
            plan: "admin",
            status: "active",
            expiresAt: null
          }
        : subscription
        ? {
            plan: plan.id,
            status: subscription.status,
            expiresAt: subscription.expiresAt
          }
        : null,
      plan: {
        id: plan.id,
        name: plan.name,
        messagesPerDay: plan.messagesPerDay,
        filesPerDay: plan.filesPerDay,
        audiosPerDay: plan.audiosPerDay,
        audioMaxMb: plan.audioMaxMb,
        videosPerDay: plan.videosPerDay,
        videoMaxMb: plan.videoMaxMb,
        chatLimit: plan.chatLimit
      },
      trial: {
        active: !!trial.active,
        expiresAt: trial.expiresAt || null
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error consultando perfil" });
  }
});

router.patch("/me", authMiddlewares, async (req, res) => {
  try {
    const { username } = req.body;
    const cleanUsername = (username || "").trim();

    if (!cleanUsername || cleanUsername.length > 10) {
      return res.status(400).json({
        error: "El nombre de usuario debe tener máximo 10 caracteres"
      });
    }

    const db = await readDB();
    const user = db.users.find(u => Number(u.id) === Number(req.user.userId));

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const existingUsername = db.users.find(u =>
      Number(u.id) !== Number(user.id) &&
      (u.username || "").toLowerCase() === cleanUsername.toLowerCase()
    );

    if (existingUsername) {
      return res.status(400).json({ error: "Ese nombre de usuario ya existe" });
    }

    user.username = cleanUsername;
    await writeDB(db);

    res.json({
      message: "Usuario actualizado",
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error actualizando perfil" });
  }
});

router.patch("/password", authMiddlewares, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({
        error: "Escribe tu contraseña actual y una nueva de mínimo 6 caracteres"
      });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({
        error: "La nueva contraseña y la confirmación no coinciden"
      });
    }

    const db = await readDB();
    const user = db.users.find(u => Number(u.id) === Number(req.user.userId));

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const passwordHash = user.password || user.password_hash;
    const validPassword = passwordHash
      ? await bcrypt.compare(currentPassword, passwordHash)
      : false;

    if (!validPassword) {
      return res.status(400).json({ error: "Contraseña actual incorrecta" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    delete user.password_hash;
    await writeDB(db);

    try {
      await sendPasswordChangedEmail(user);
    } catch (error) {
      console.error("ERROR ENVIANDO CORREO DE CONTRASENA:", error);
    }

    res.json({ message: "Contraseña actualizada" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error cambiando contraseña" });
  }
});

export default router;
