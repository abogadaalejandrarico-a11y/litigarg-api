import fs from "fs-extra";
import pg from "pg";

const DB_FILE = "./database.json";
const { Pool } = pg;

let pool;
let schemaReady = false;
let jsonMigrationChecked = false;

function usePostgres() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === "false"
        ? false
        : { rejectUnauthorized: false }
    });
  }

  return pool;
}

async function ensureSchema() {
  if (schemaReady || !usePostgres()) return;

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        password_hash TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        payment_id TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        provider TEXT NOT NULL,
        provider_payment_id TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        plan TEXT NOT NULL,
        status TEXT NOT NULL,
        amount NUMERIC,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(provider, provider_payment_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS free_usage (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        used INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query("COMMIT");
    schemaReady = true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function toIso(value) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function readJsonDB() {
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

async function writeJsonDB(data) {
  await fs.writeJson(DB_FILE, data, { spaces: 2 });
}

async function migrateJsonToPostgresIfEmpty() {
  if (jsonMigrationChecked || process.env.MIGRATE_JSON_DB === "false") return;

  jsonMigrationChecked = true;

  const exists = await fs.pathExists(DB_FILE);
  if (!exists) return;

  const client = await getPool().connect();

  try {
    const result = await client.query("SELECT COUNT(*)::int AS count FROM users");
    if (result.rows[0].count > 0) return;
  } finally {
    client.release();
  }

  const jsonDB = await readJsonDB();

  if ((jsonDB.users || []).length === 0) return;

  await writeDB(jsonDB);
}

export async function readDB() {
  if (!usePostgres()) {
    return readJsonDB();
  }

  await ensureSchema();
  await migrateJsonToPostgresIfEmpty();

  const client = await getPool().connect();

  try {
    const [users, subscriptions, payments, freeUsage] = await Promise.all([
      client.query("SELECT * FROM users ORDER BY id"),
      client.query("SELECT * FROM subscriptions ORDER BY id"),
      client.query("SELECT * FROM payments ORDER BY id"),
      client.query("SELECT * FROM free_usage ORDER BY user_id")
    ]);

    return {
      users: users.rows.map(row => ({
        id: row.id,
        username: row.username,
        email: row.email,
        password: row.password,
        password_hash: row.password_hash,
        created_at: toIso(row.created_at)
      })),
      subscriptions: subscriptions.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        plan: row.plan,
        status: row.status,
        paymentId: row.payment_id,
        expiresAt: toIso(row.expires_at),
        created_at: toIso(row.created_at)
      })),
      payments: payments.rows.map(row => ({
        id: row.id,
        provider: row.provider,
        providerPaymentId: row.provider_payment_id,
        userId: row.user_id,
        plan: row.plan,
        status: row.status,
        amount: row.amount === null ? null : Number(row.amount),
        created_at: toIso(row.created_at)
      })),
      freeUsage: freeUsage.rows.map(row => ({
        userId: row.user_id,
        used: row.used,
        created_at: toIso(row.created_at),
        updated_at: toIso(row.updated_at)
      }))
    };
  } finally {
    client.release();
  }
}

export async function writeDB(data) {
  if (!usePostgres()) {
    await writeJsonDB(data);
    return;
  }

  await ensureSchema();

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    for (const user of data.users || []) {
      await client.query(
        `
          INSERT INTO users (id, username, email, password, password_hash, created_at)
          VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, NOW()))
          ON CONFLICT (id) DO UPDATE SET
            username = EXCLUDED.username,
            email = EXCLUDED.email,
            password = EXCLUDED.password,
            password_hash = EXCLUDED.password_hash,
            created_at = EXCLUDED.created_at
        `,
        [
          user.id,
          user.username || null,
          user.email,
          user.password || null,
          user.password_hash || null,
          user.created_at || null
        ]
      );
    }

    for (const subscription of data.subscriptions || []) {
      await client.query(
        `
          INSERT INTO subscriptions (id, user_id, plan, status, payment_id, expires_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6::timestamptz, COALESCE($7::timestamptz, NOW()))
          ON CONFLICT (id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            plan = EXCLUDED.plan,
            status = EXCLUDED.status,
            payment_id = EXCLUDED.payment_id,
            expires_at = EXCLUDED.expires_at,
            created_at = EXCLUDED.created_at
        `,
        [
          subscription.id,
          subscription.userId,
          subscription.plan,
          subscription.status,
          subscription.paymentId || null,
          subscription.expiresAt,
          subscription.created_at || null
        ]
      );
    }

    for (const payment of data.payments || []) {
      await client.query(
        `
          INSERT INTO payments (id, provider, provider_payment_id, user_id, plan, status, amount, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()))
          ON CONFLICT (provider, provider_payment_id) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            plan = EXCLUDED.plan,
            status = EXCLUDED.status,
            amount = EXCLUDED.amount,
            created_at = EXCLUDED.created_at
        `,
        [
          payment.id,
          payment.provider,
          String(payment.providerPaymentId),
          payment.userId,
          payment.plan,
          payment.status,
          payment.amount ?? null,
          payment.created_at || null
        ]
      );
    }

    for (const usage of data.freeUsage || []) {
      await client.query(
        `
          INSERT INTO free_usage (user_id, used, created_at, updated_at)
          VALUES ($1, $2, COALESCE($3::timestamptz, NOW()), COALESCE($4::timestamptz, NOW()))
          ON CONFLICT (user_id) DO UPDATE SET
            used = EXCLUDED.used,
            updated_at = EXCLUDED.updated_at
        `,
        [
          usage.userId,
          usage.used || 0,
          usage.created_at || null,
          usage.updated_at || null
        ]
      );
    }

    await client.query("SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), true)");
    await client.query("SELECT setval(pg_get_serial_sequence('subscriptions', 'id'), COALESCE((SELECT MAX(id) FROM subscriptions), 1), true)");
    await client.query("SELECT setval(pg_get_serial_sequence('payments', 'id'), COALESCE((SELECT MAX(id) FROM payments), 1), true)");

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
