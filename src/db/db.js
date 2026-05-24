import fs from "fs-extra";

const DB_FILE = "./database.json";

export async function readDB() {
  const exists = await fs.pathExists(DB_FILE);
  if (!exists) {
    await fs.writeJson(DB_FILE, { users: [], subscriptions: [], payments: [], freeUsage: [] }, { spaces: 2 });
  }
  const db = await fs.readJson(DB_FILE);

  db.users = db.users || [];
  db.subscriptions = db.subscriptions || [];
  db.payments = db.payments || [];
  db.freeUsage = db.freeUsage || [];

  return db;
}

export async function writeDB(data) {
  await fs.writeJson(DB_FILE, data, { spaces: 2 });
}
