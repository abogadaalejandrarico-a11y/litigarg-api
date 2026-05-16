import { readDB } from "../db/db.js";

export async function isPremiumActive(userId) {
  const db = await readDB();

  const sub = db.subscriptions
    .filter(s => s.userId === userId && s.status === "active")
    .sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt))[0];

  if (!sub) return false;

  return new Date(sub.expiresAt) > new Date();
}