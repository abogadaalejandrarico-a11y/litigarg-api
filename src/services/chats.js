import { isPostgresEnabled, readDB, withDBClient, writeDB } from "../db/db.js";
import { isPremiumActive } from "./subscription.js";

const FREE_CHAT_LIMIT = 5;
const PREMIUM_CHAT_LIMIT = 100;

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function getChatLimit(isPremium) {
  return isPremium ? PREMIUM_CHAT_LIMIT : FREE_CHAT_LIMIT;
}

function formatChat(chat, messages) {
  return {
    id: chat.id,
    title: chat.title,
    created_at: chat.created_at,
    updated_at: chat.updated_at,
    messages: messages
      .filter(message => message.chatId === chat.id)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .map(message => ({
        id: message.id,
        text: message.text,
        type: message.type,
        sources: message.sources || [],
        created_at: message.created_at
      }))
  };
}

async function enforceHistoryLimit(db, userId) {
  const premium = await isPremiumActive(userId);
  const limit = getChatLimit(premium);

  const userChats = (db.chats || [])
    .filter(chat => Number(chat.userId) === Number(userId))
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  const allowedIds = new Set(userChats.slice(0, limit).map(chat => chat.id));

  db.chats = (db.chats || []).filter(chat =>
    Number(chat.userId) !== Number(userId) || allowedIds.has(chat.id)
  );

  db.chatMessages = (db.chatMessages || []).filter(message =>
    Number(message.userId) !== Number(userId) || allowedIds.has(message.chatId)
  );
}

export async function listUserChats(userId) {
  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const premium = await isPremiumActive(userId);
      const limit = getChatLimit(premium);

      const chatsResult = await client.query(
        `
          SELECT id, user_id, title, created_at, updated_at
          FROM chats
          WHERE user_id = $1
          ORDER BY updated_at DESC
        `,
        [userId]
      );

      const allowedChats = chatsResult.rows.slice(0, limit);
      const allowedIds = allowedChats.map(chat => chat.id);

      if (chatsResult.rows.length > limit) {
        await client.query(
          "DELETE FROM chats WHERE user_id = $1 AND NOT (id = ANY($2::text[]))",
          [userId, allowedIds]
        );
      }

      if (allowedIds.length === 0) return [];

      const messagesResult = await client.query(
        `
          SELECT id, chat_id, user_id, type, text, sources, created_at
          FROM chat_messages
          WHERE user_id = $1 AND chat_id = ANY($2::text[])
          ORDER BY created_at ASC
        `,
        [userId, allowedIds]
      );

      return allowedChats.map(chat => formatChat({
        id: chat.id,
        userId: chat.user_id,
        title: chat.title,
        created_at: chat.created_at,
        updated_at: chat.updated_at
      }, messagesResult.rows.map(message => ({
        id: message.id,
        chatId: message.chat_id,
        userId: message.user_id,
        type: message.type,
        text: message.text,
        created_at: message.created_at
      }))));
    });
  }

  const db = await readDB();
  db.chats = db.chats || [];
  db.chatMessages = db.chatMessages || [];

  await enforceHistoryLimit(db, userId);
  await writeDB(db);

  return db.chats
    .filter(chat => Number(chat.userId) === Number(userId))
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    .map(chat => formatChat(chat, db.chatMessages));
}

export async function saveChatMessage(userId, { chatId, title, text, type, sources = [] }) {
  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const now = new Date().toISOString();
      const cleanChatId = chatId ? String(chatId) : makeId("chat");
      const cleanTitle = (title || "Nuevo chat").slice(0, 60);
      const cleanSources = Array.isArray(sources) ? sources : [];

      await client.query(
        `
          INSERT INTO chats (id, user_id, title, created_at, updated_at)
          VALUES ($1, $2, $3, $4::timestamptz, $4::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            updated_at = EXCLUDED.updated_at,
            title = CASE
              WHEN chats.title = 'Nuevo chat' THEN EXCLUDED.title
              ELSE chats.title
            END
        `,
        [cleanChatId, userId, cleanTitle, now]
      );

      await client.query(
        `
          INSERT INTO chat_messages (id, chat_id, user_id, type, text, sources, created_at)
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)
        `,
        [makeId("msg"), cleanChatId, userId, type, text, JSON.stringify(cleanSources), now]
      );

      const premium = await isPremiumActive(userId);
      const limit = getChatLimit(premium);
      const oldChats = await client.query(
        `
          SELECT id
          FROM chats
          WHERE user_id = $1
          ORDER BY updated_at DESC
          OFFSET $2
        `,
        [userId, limit]
      );

      if (oldChats.rows.length > 0) {
        await client.query(
          "DELETE FROM chats WHERE user_id = $1 AND id = ANY($2::text[])",
          [userId, oldChats.rows.map(chat => chat.id)]
        );
      }

      const chatResult = await client.query(
        "SELECT id, user_id, title, created_at, updated_at FROM chats WHERE id = $1 AND user_id = $2",
        [cleanChatId, userId]
      );
      const messagesResult = await client.query(
        "SELECT id, chat_id, user_id, type, text, sources, created_at FROM chat_messages WHERE chat_id = $1 AND user_id = $2 ORDER BY created_at ASC",
        [cleanChatId, userId]
      );

      return formatChat({
        id: chatResult.rows[0].id,
        userId: chatResult.rows[0].user_id,
        title: chatResult.rows[0].title,
        created_at: chatResult.rows[0].created_at,
        updated_at: chatResult.rows[0].updated_at
      }, messagesResult.rows.map(message => ({
        id: message.id,
        chatId: message.chat_id,
        userId: message.user_id,
        type: message.type,
        text: message.text,
        sources: message.sources || [],
        created_at: message.created_at
      })));
    });
  }

  const db = await readDB();
  db.chats = db.chats || [];
  db.chatMessages = db.chatMessages || [];

  const now = new Date().toISOString();
  const cleanChatId = chatId ? String(chatId) : makeId("chat");
  let chat = db.chats.find(item =>
    item.id === cleanChatId && Number(item.userId) === Number(userId)
  );

  if (!chat) {
    chat = {
      id: cleanChatId,
      userId: Number(userId),
      title: (title || "Nuevo chat").slice(0, 60),
      created_at: now,
      updated_at: now
    };
    db.chats.push(chat);
  }

  if (title && chat.title === "Nuevo chat") {
    chat.title = title.slice(0, 60);
  }

  chat.updated_at = now;

  db.chatMessages.push({
    id: makeId("msg"),
    chatId: chat.id,
    userId: Number(userId),
    type,
    text,
    sources: Array.isArray(sources) ? sources : [],
    created_at: now
  });

  await enforceHistoryLimit(db, userId);
  await writeDB(db);

  return formatChat(chat, db.chatMessages);
}

export async function renameUserChat(userId, chatId, title) {
  const cleanTitle = (title || "").trim().slice(0, 60);

  if (!cleanTitle) {
    throw new Error("Escribe un nombre para el chat");
  }

  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const result = await client.query(
        `
          UPDATE chats
          SET title = $1, updated_at = NOW()
          WHERE id = $2 AND user_id = $3
          RETURNING id, user_id, title, created_at, updated_at
        `,
        [cleanTitle, String(chatId), userId]
      );

      if (result.rows.length === 0) return null;

      const messagesResult = await client.query(
        "SELECT id, chat_id, user_id, type, text, sources, created_at FROM chat_messages WHERE chat_id = $1 AND user_id = $2 ORDER BY created_at ASC",
        [String(chatId), userId]
      );

      return formatChat({
        id: result.rows[0].id,
        userId: result.rows[0].user_id,
        title: result.rows[0].title,
        created_at: result.rows[0].created_at,
        updated_at: result.rows[0].updated_at
      }, messagesResult.rows.map(message => ({
        id: message.id,
        chatId: message.chat_id,
        userId: message.user_id,
        type: message.type,
        text: message.text,
        sources: message.sources || [],
        created_at: message.created_at
      })));
    });
  }

  const db = await readDB();
  const chat = (db.chats || []).find(item =>
    item.id === String(chatId) && Number(item.userId) === Number(userId)
  );

  if (!chat) {
    return null;
  }

  chat.title = cleanTitle;
  chat.updated_at = new Date().toISOString();
  await writeDB(db);

  return formatChat(chat, db.chatMessages || []);
}

export async function deleteUserChat(userId, chatId) {
  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const result = await client.query(
        "DELETE FROM chats WHERE id = $1 AND user_id = $2",
        [String(chatId), userId]
      );

      return result.rowCount > 0;
    });
  }

  const db = await readDB();
  const exists = (db.chats || []).some(chat =>
    chat.id === String(chatId) && Number(chat.userId) === Number(userId)
  );

  if (!exists) {
    return false;
  }

  db.chats = (db.chats || []).filter(chat =>
    !(chat.id === String(chatId) && Number(chat.userId) === Number(userId))
  );
  db.chatMessages = (db.chatMessages || []).filter(message =>
    !(message.chatId === String(chatId) && Number(message.userId) === Number(userId))
  );

  await writeDB(db);
  return true;
}

export async function clearUserChats(userId) {
  if (isPostgresEnabled()) {
    await withDBClient(async client => {
      await client.query("DELETE FROM chats WHERE user_id = $1", [userId]);
    });
    return;
  }

  const db = await readDB();

  db.chats = (db.chats || []).filter(chat =>
    Number(chat.userId) !== Number(userId)
  );
  db.chatMessages = (db.chatMessages || []).filter(message =>
    Number(message.userId) !== Number(userId)
  );

  await writeDB(db);
}
