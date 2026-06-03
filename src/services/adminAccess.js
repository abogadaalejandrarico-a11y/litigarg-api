import { readDB } from "../db/db.js";

export function getAdminEmails() {
  return (process.env.LIBRARY_ADMIN_EMAILS || process.env.ADMIN_EMAILS || "litigarg@gmail.com")
    .split(",")
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email) {
  return getAdminEmails().includes(String(email || "").trim().toLowerCase());
}

export function isAdminUser(user) {
  return isAdminEmail(user?.email);
}

export async function getUserById(userId) {
  const db = await readDB();
  return (db.users || []).find(user => Number(user.id) === Number(userId)) || null;
}

export async function isAdminUserId(userId) {
  const user = await getUserById(userId);
  return isAdminUser(user);
}
