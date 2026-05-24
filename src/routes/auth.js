import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { readDB, writeDB } from "../db/db.js";
import authMiddlewares from "../middlewares/auth.js";
import { getActiveSubscription } from "../services/subscription.js";

const router = express.Router();

// 🔥 REGISTER
router.post("/register", async (req, res) => {
  try {
    const { email, password, username } = req.body;
    const cleanUsername = (username || "").trim();

    if (!cleanUsername || cleanUsername.length > 10) {
      return res.status(400).json({
        error: "El nombre de usuario debe tener máximo 10 caracteres"
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
      created_at: new Date().toISOString()
    };

    db.users.push(newUser);
    await writeDB(db);

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

    const user = db.users.find(u => u.email === email);

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

router.get("/me", authMiddlewares, async (req, res) => {
  try {
    const db = await readDB();
    const user = db.users.find(u => Number(u.id) === Number(req.user.userId));

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    const subscription = await getActiveSubscription(user.id);

    res.json({
      user: {
        id: user.id,
        username: user.username || null,
        email: user.email
      },
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            expiresAt: subscription.expiresAt
          }
        : null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error consultando perfil" });
  }
});

export default router;
