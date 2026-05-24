import { readDB, writeDB } from "../db/db.js";

export function getPlanDays(plan) {
  if (plan === "premium_anual") return 365;
  return 30;
}

export async function isPremiumActive(userId) {
  const db = await readDB();

  const sub = (db.subscriptions || [])
    .filter(s => Number(s.userId) === Number(userId) && s.status === "active")
    .sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt))[0];

  if (!sub) return false;

  return new Date(sub.expiresAt) > new Date();
}

export async function activatePremiumSubscription(userId, plan, paymentId = null) {
  const db = await readDB();

  db.subscriptions = db.subscriptions || [];

  const expires = new Date();
  expires.setDate(expires.getDate() + getPlanDays(plan));

  const subscription = {
    id: db.subscriptions.length + 1,
    userId: Number(userId),
    plan,
    status: "active",
    paymentId,
    expiresAt: expires.toISOString(),
    created_at: new Date().toISOString()
  };

  db.subscriptions.push(subscription);
  await writeDB(db);

  return subscription;
}
