import { readDB, writeDB } from "../db/db.js";
import { isAdminUserId } from "./adminAccess.js";
import { getPlanConfig, isPaidPlan, normalizePlanId } from "./plans.js";

const GPT_TRIAL_HOURS = 24;
const GPT_TRIAL_MS = GPT_TRIAL_HOURS * 60 * 60 * 1000;

function getUserCreatedAt(user) {
  const value = user?.created_at || user?.createdAt || user?.termsAcceptedAt || user?.terms_accepted_at;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export async function getGptTrialAccess(userId) {
  const db = await readDB();
  const user = (db.users || []).find((item) => Number(item.id) === Number(userId));
  const createdAt = getUserCreatedAt(user);

  if (!createdAt) {
    return { active: false, expiresAt: null };
  }

  const expiresAt = new Date(createdAt.getTime() + GPT_TRIAL_MS);

  return {
    active: expiresAt > new Date(),
    expiresAt: expiresAt.toISOString()
  };
}

export async function hasGptAccess(userId) {
  if (await isAdminUserId(userId)) return true;
  if (await getActiveSubscription(userId)) return true;

  const trial = await getGptTrialAccess(userId);
  return trial.active;
}

export function getPlanDays(plan) {
  return 30;
}

export async function isPremiumActive(userId) {
  if (await isAdminUserId(userId)) return true;

  const sub = await getActiveSubscription(userId);

  if (!sub) return false;

  return new Date(sub.expiresAt) > new Date();
}

export async function getActiveSubscription(userId) {
  const db = await readDB();

  return (db.subscriptions || [])
    .filter(s =>
      Number(s.userId) === Number(userId) &&
      s.status === "active" &&
      new Date(s.expiresAt) > new Date()
    )
    .sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt))[0] || null;
}

export async function getUserPlan(userId) {
  const admin = await isAdminUserId(userId);

  if (admin) {
    return getPlanConfig("admin", { admin: true });
  }

  const subscription = await getActiveSubscription(userId);
  const plan = subscription && isPaidPlan(subscription.plan)
    ? normalizePlanId(subscription.plan)
    : "free";

  return {
    ...getPlanConfig(plan),
    subscription
  };
}

export async function activatePremiumSubscription(userId, plan, paymentId = null) {
  const db = await readDB();

  db.subscriptions = db.subscriptions || [];

  const expires = new Date();
  expires.setDate(expires.getDate() + getPlanDays(plan));

  const subscription = {
    id: db.subscriptions.length + 1,
    userId: Number(userId),
    plan: normalizePlanId(plan),
    status: "active",
    paymentId,
    expiresAt: expires.toISOString(),
    created_at: new Date().toISOString()
  };

  db.subscriptions.push(subscription);
  await writeDB(db);

  return subscription;
}
