import { readDB, writeDB } from "../db/db.js";

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

function normalizeDailyUsage(usage) {
  const today = getTodayInColombia();

  if (!usage) {
    return {
      userId: null,
      used: 0,
      usageDate: today,
      created_at: new Date().toISOString()
    };
  }

  if (usage.usageDate !== today) {
    usage.used = 0;
    usage.usageDate = today;
    usage.updated_at = new Date().toISOString();
  }

  return usage;
}

export async function getFreeUsage(userId) {
  const db = await readDB();

  db.freeUsage = db.freeUsage || [];

  const usage = normalizeDailyUsage(db.freeUsage.find(item => Number(item.userId) === Number(userId)));
  const used = usage?.used || 0;

  if (usage?.userId) {
    await writeDB(db);
  }

  return {
    used,
    limit: FREE_MESSAGE_LIMIT,
    remaining: Math.max(FREE_MESSAGE_LIMIT - used, 0),
    resetsAt: usage.usageDate
  };
}

export async function incrementFreeUsage(userId) {
  const db = await readDB();

  db.freeUsage = db.freeUsage || [];

  let usage = db.freeUsage.find(item => Number(item.userId) === Number(userId));

  if (!usage) {
    usage = normalizeDailyUsage(null);
    usage.userId = Number(userId);
    db.freeUsage.push(usage);
  } else {
    usage = normalizeDailyUsage(usage);
  }

  usage.used += 1;
  usage.updated_at = new Date().toISOString();

  await writeDB(db);

  return {
    used: usage.used,
    limit: FREE_MESSAGE_LIMIT,
    remaining: Math.max(FREE_MESSAGE_LIMIT - usage.used, 0),
    resetsAt: usage.usageDate
  };
}
