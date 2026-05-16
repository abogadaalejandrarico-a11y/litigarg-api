import fs from "fs-extra";

const DB_FILE = "./database.json";

export async function readDB() {
  const exists = await fs.pathExists(DB_FILE);
  if (!exists) {
    await fs.writeJson(DB_FILE, { users: [], subscriptions: [], payments: [] }, { spaces: 2 });
  }
  return await fs.readJson(DB_FILE);
}

export async function writeDB(data) {
  await fs.writeJson(DB_FILE, data, { spaces: 2 });
}