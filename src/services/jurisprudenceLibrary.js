import { isPostgresEnabled, readDB, withDBClient, writeDB } from "../db/db.js";

function normalizeSource(source = {}, query = "") {
  return {
    url: String(source.url || "").trim(),
    title: String(source.title || "Fuente jurisprudencial").trim(),
    corporation: source.corporation || null,
    room: source.room || null,
    year: source.year || null,
    decisionDate: source.date || source.decisionDate || null,
    lastQuery: String(query || "").slice(0, 500),
    extract: String(source.extract || source.snippet || "").slice(0, 3000),
    metadata: {
      sourceType: source.sourceType || "jurisprudence",
      official: Boolean(source.official),
      verified: Boolean(source.verified)
    }
  };
}

export async function saveJurisprudenceSources(sources = [], query = "") {
  const validSources = (Array.isArray(sources) ? sources : [])
    .map(source => normalizeSource(source, query))
    .filter(source => source.url && source.title);

  if (!validSources.length) return;

  if (isPostgresEnabled()) {
    await withDBClient(async client => {
      for (const source of validSources) {
        await client.query(
          `
            INSERT INTO jurisprudence_library (
              url, title, corporation, room, year, decision_date,
              last_query, extract, metadata, search_count, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, 1, NOW(), NOW())
            ON CONFLICT (url) DO UPDATE SET
              title = EXCLUDED.title,
              corporation = EXCLUDED.corporation,
              room = EXCLUDED.room,
              year = EXCLUDED.year,
              decision_date = EXCLUDED.decision_date,
              last_query = EXCLUDED.last_query,
              extract = CASE
                WHEN EXCLUDED.extract <> '' THEN EXCLUDED.extract
                ELSE jurisprudence_library.extract
              END,
              metadata = EXCLUDED.metadata,
              search_count = jurisprudence_library.search_count + 1,
              updated_at = NOW()
          `,
          [
            source.url,
            source.title,
            source.corporation,
            source.room,
            source.year,
            source.decisionDate,
            source.lastQuery,
            source.extract,
            JSON.stringify(source.metadata)
          ]
        );
      }
    });
    return;
  }

  const db = await readDB();
  db.jurisprudenceLibrary = db.jurisprudenceLibrary || [];

  for (const source of validSources) {
    const existing = db.jurisprudenceLibrary.find(item => item.url === source.url);

    if (existing) {
      Object.assign(existing, {
        ...source,
        extract: source.extract || existing.extract || "",
        searchCount: (existing.searchCount || 1) + 1,
        updated_at: new Date().toISOString()
      });
      continue;
    }

    db.jurisprudenceLibrary.push({
      id: `jur_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      ...source,
      searchCount: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  await writeDB(db);
}

export async function findRelevantJurisprudence(query = "", limit = 5) {
  const cleanQuery = String(query || "").trim();

  if (!cleanQuery) return [];

  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const search = `%${cleanQuery.slice(0, 120)}%`;
      const result = await client.query(
        `
          SELECT url, title, corporation, room, year, decision_date, extract, metadata
          FROM jurisprudence_library
          WHERE title ILIKE $1
             OR extract ILIKE $1
             OR last_query ILIKE $1
          ORDER BY updated_at DESC
          LIMIT $2
        `,
        [search, limit]
      );

      return result.rows.map(row => ({
        url: row.url,
        title: row.title,
        corporation: row.corporation,
        room: row.room,
        year: row.year,
        date: row.decision_date,
        extract: row.extract || "",
        snippet: row.extract || "",
        sourceType: "jurisprudence_library",
        official: Boolean(row.metadata?.official ?? true),
        verified: Boolean(row.metadata?.verified ?? true)
      }));
    });
  }

  const db = await readDB();
  const normalized = cleanQuery.toLowerCase();

  return (db.jurisprudenceLibrary || [])
    .filter(item =>
      String(item.title || "").toLowerCase().includes(normalized) ||
      String(item.extract || "").toLowerCase().includes(normalized) ||
      String(item.lastQuery || "").toLowerCase().includes(normalized)
    )
    .slice(0, limit)
    .map(item => ({
      url: item.url,
      title: item.title,
      corporation: item.corporation,
      room: item.room,
      year: item.year,
      date: item.decisionDate,
      extract: item.extract || "",
      snippet: item.extract || "",
      sourceType: "jurisprudence_library",
      official: Boolean(item.metadata?.official ?? true),
      verified: Boolean(item.metadata?.verified ?? true)
    }));
}
