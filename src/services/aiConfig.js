import { isPostgresEnabled, readDB, withDBClient, writeDB } from "../db/db.js";

const CONFIG_ID = 1;

export async function getAiConfig() {
  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const result = await client.query(
        "SELECT custom_rules, updated_by, updated_at FROM ai_config WHERE id = $1",
        [CONFIG_ID]
      );

      if (!result.rows[0]) {
        return {
          customRules: "",
          updatedBy: null,
          updatedAt: null
        };
      }

      return {
        customRules: result.rows[0].custom_rules || "",
        updatedBy: result.rows[0].updated_by || null,
        updatedAt: result.rows[0].updated_at || null
      };
    });
  }

  const db = await readDB();
  return db.aiConfig || { customRules: "", updatedBy: null, updatedAt: null };
}

export async function saveAiConfig({ customRules, userId }) {
  const cleanRules = String(customRules || "").trim();

  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const result = await client.query(
        `
          INSERT INTO ai_config (id, custom_rules, updated_by, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (id) DO UPDATE SET
            custom_rules = EXCLUDED.custom_rules,
            updated_by = EXCLUDED.updated_by,
            updated_at = EXCLUDED.updated_at
          RETURNING custom_rules, updated_by, updated_at
        `,
        [CONFIG_ID, cleanRules, userId || null]
      );

      return {
        customRules: result.rows[0].custom_rules || "",
        updatedBy: result.rows[0].updated_by || null,
        updatedAt: result.rows[0].updated_at || null
      };
    });
  }

  const db = await readDB();
  db.aiConfig = {
    customRules: cleanRules,
    updatedBy: userId || null,
    updatedAt: new Date().toISOString()
  };
  await writeDB(db);

  return db.aiConfig;
}
