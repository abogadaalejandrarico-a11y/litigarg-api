import { readDB, writeDB } from "../db/db.js";

export const FREE_MESSAGE_LIMIT = 5;

export async function getFreeUsage(userId) {
  const db = await readDB();

  db.freeUsage = db.freeUsage || [];

  const usage = db.freeUsage.find(item => Number(item.userId) === Number(userId));
  const used = usage?.used || 0;

  return {
    used,
    limit: FREE_MESSAGE_LIMIT,
    remaining: Math.max(FREE_MESSAGE_LIMIT - used, 0)
  };
}

export async function incrementFreeUsage(userId) {
  const db = await readDB();

  db.freeUsage = db.freeUsage || [];

  let usage = db.freeUsage.find(item => Number(item.userId) === Number(userId));

  if (!usage) {
    usage = {
      userId: Number(userId),
      used: 0,
      created_at: new Date().toISOString()
    };
    db.freeUsage.push(usage);
  }

  usage.used += 1;
  usage.updated_at = new Date().toISOString();

  await writeDB(db);

  return {
    used: usage.used,
    limit: FREE_MESSAGE_LIMIT,
    remaining: Math.max(FREE_MESSAGE_LIMIT - usage.used, 0)
  };
}
