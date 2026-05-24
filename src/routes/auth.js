import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { readDB, writeDB } from "../db/db.js";

const router = express.Router();

// 🔥 REGISTER
router.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    const db = await readDB();

    const existingUser = db.users.find(u => u.email === email);

    if (existingUser) {
      return res.status(400).json({ error: "El correo ya existe" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = {
      id: db.users.length + 1,
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

export default router;
