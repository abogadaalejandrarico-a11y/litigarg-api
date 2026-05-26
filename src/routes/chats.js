import express from "express";
import authMiddlewares from "../middlewares/auth.js";
import {
  clearUserChats,
  deleteUserChat,
  listUserChats,
  renameUserChat,
  saveChatMessage
} from "../services/chats.js";

const router = express.Router();

router.get("/", authMiddlewares, async (req, res) => {
  try {
    const chats = await listUserChats(req.user.userId);
    res.json({ chats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error cargando historial" });
  }
});

router.post("/:chatId/messages", authMiddlewares, async (req, res) => {
  try {
    const { text, type, title } = req.body;

    if (!text || !["user", "bot"].includes(type)) {
      return res.status(400).json({ error: "Mensaje invalido" });
    }

    const chat = await saveChatMessage(req.user.userId, {
      chatId: req.params.chatId,
      title,
      text,
      type
    });

    res.json({ chat });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error guardando mensaje" });
  }
});

router.patch("/:chatId", authMiddlewares, async (req, res) => {
  try {
    const chat = await renameUserChat(req.user.userId, req.params.chatId, req.body.title);

    if (!chat) {
      return res.status(404).json({ error: "Chat no encontrado" });
    }

    res.json({ chat });
  } catch (error) {
    res.status(400).json({ error: error.message || "Error cambiando nombre" });
  }
});

router.delete("/:chatId", authMiddlewares, async (req, res) => {
  try {
    const deleted = await deleteUserChat(req.user.userId, req.params.chatId);

    if (!deleted) {
      return res.status(404).json({ error: "Chat no encontrado" });
    }

    res.json({ message: "Chat eliminado" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error eliminando chat" });
  }
});

router.delete("/", authMiddlewares, async (req, res) => {
  try {
    await clearUserChats(req.user.userId);
    res.json({ message: "Historial eliminado" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error eliminando historial" });
  }
});

export default router;
