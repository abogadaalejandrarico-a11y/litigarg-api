import { readDB, writeDB } from "../db/db.js";
import { getPlanDailyLimit } from "./plans.js";
import { getUserPlan } from "./subscription.js";

export const FREE_MESSAGE_LIMIT = 8;

function getTodayInColombia() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const dateParts = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function getNextResetIso(today) {
  const [year, month, day] = today.split("-").map(Number);
  const nextBogotaMidnight = new Date(Date.UTC(year, month - 1, day + 1, 5, 0, 0));
  return nextBogotaMidnight.toISOString();
}

function normalizeDailyUsage(usage) {
  const today = getTodayInColombia();

  if (!usage) {
    return {
      userId: null,
      used: 0,
      fileUsed: 0,
      audioUsed: 0,
      usageDate: today,
      created_at: new Date().toISOString()
    };
  }

  if (usage.usageDate !== today) {
    usage.used = 0;
    usage.fileUsed = 0;
    usage.audioUsed = 0;
    usage.usageDate = today;
    usage.updated_at = new Date().toISOString();
  }

  usage.fileUsed = usage.fileUsed || usage.file_used || 0;
  usage.audioUsed = usage.audioUsed || usage.audio_used || 0;

  return usage;
}

function buildCounter({ used, limit, usageDate }) {
  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(limit - used, 0),
    resetsAt: getNextResetIso(usageDate)
  };
}

function buildUsageSummary(usage, plan) {
  const messageLimit = getPlanDailyLimit(plan.id, "message", { admin: plan.id === "admin" });
  const fileLimit = getPlanDailyLimit(plan.id, "file", { admin: plan.id === "admin" });
  const audioLimit = getPlanDailyLimit(plan.id, "audio", { admin: plan.id === "admin" });

  return {
    plan: {
      id: plan.id,
      name: plan.name
    },
    messages: buildCounter({
      used: usage.used || 0,
      limit: messageLimit,
      usageDate: usage.usageDate
    }),
    files: buildCounter({
      used: usage.fileUsed || 0,
      limit: fileLimit,
      usageDate: usage.usageDate
    }),
    audios: buildCounter({
      used: usage.audioUsed || 0,
      limit: audioLimit,
      usageDate: usage.usageDate
    })
  };
}

export async function getDailyUsage(userId) {
  const db = await readDB();
  const plan = await getUserPlan(userId);

  db.freeUsage = db.freeUsage || [];

  const usage = normalizeDailyUsage(db.freeUsage.find(item => Number(item.userId) === Number(userId)));

  if (usage?.userId) {
    await writeDB(db);
  }

  return buildUsageSummary(usage, plan);
}

export async function incrementDailyUsage(userId, kind = "message") {
  const db = await readDB();
  const plan = await getUserPlan(userId);

  db.freeUsage = db.freeUsage || [];

  let usage = db.freeUsage.find(item => Number(item.userId) === Number(userId));

  if (!usage) {
    usage = normalizeDailyUsage(null);
    usage.userId = Number(userId);
    db.freeUsage.push(usage);
  } else {
    usage = normalizeDailyUsage(usage);
  }

  if (kind === "file") {
    usage.fileUsed = (usage.fileUsed || 0) + 1;
  } else if (kind === "audio") {
    usage.audioUsed = (usage.audioUsed || 0) + 1;
  } else {
    usage.used = (usage.used || 0) + 1;
  }

  usage.updated_at = new Date().toISOString();

  await writeDB(db);

  return buildUsageSummary(usage, plan);
}

export async function canUseDailyFeature(userId, kind = "message") {
  const usage = await getDailyUsage(userId);
  const counter = kind === "file"
    ? usage.files
    : kind === "audio"
      ? usage.audios
      : usage.messages;

  return {
    allowed: counter.limit === null || counter.remaining > 0,
    usage,
    counter
  };
}

export async function getFreeUsage(userId) {
  const usage = await getDailyUsage(userId);
  return usage.messages;
}

export async function incrementFreeUsage(userId) {
  const usage = await incrementDailyUsage(userId, "message");
  return usage.messages;
}
