import { isPostgresEnabled, readDB, withDBClient, writeDB } from "../db/db.js";

const TOPIC_RULES = [
  {
    topic: "control de garantias",
    keywords: ["control de garantias", "juez de control", "garantias", "audiencia preliminar", "captura", "legalizacion de captura"]
  },
  {
    topic: "medida de aseguramiento",
    keywords: ["medida de aseguramiento", "detencion preventiva", "peligro para la comunidad", "comparecencia", "inferir razonablemente"]
  },
  {
    topic: "debido proceso",
    keywords: ["debido proceso", "defensa tecnica", "defensa técnica", "contradiccion", "contradicción", "legalidad", "tutela judicial efectiva"]
  },
  {
    topic: "presuncion de inocencia",
    keywords: ["presuncion de inocencia", "in dubio pro reo", "duda razonable", "estandar probatorio"]
  },
  {
    topic: "prueba documental",
    keywords: ["prueba documental", "documento", "incorporacion", "autenticacion", "publicidad", "articulo 431", "lectura integral"]
  },
  {
    topic: "estipulaciones probatorias",
    keywords: ["estipulacion", "estipulaciones", "hecho estipulado", "acuerdo probatorio"]
  },
  {
    topic: "interrogatorio y contrainterrogatorio",
    keywords: ["interrogatorio", "contrainterrogatorio", "testigo", "preguntas", "credibilidad"]
  },
  {
    topic: "audiencia preparatoria",
    keywords: ["audiencia preparatoria", "descubrimiento probatorio", "exclusion", "pertinencia", "conducencia", "utilidad"]
  },
  {
    topic: "libertad por vencimiento de terminos",
    keywords: ["vencimiento de terminos", "libertad", "terminos", "dilacion"]
  },
  {
    topic: "casacion penal",
    keywords: ["casacion", "demanda de casacion", "violacion directa", "falso juicio"]
  },
  {
    topic: "devolucion de bienes incautados",
    keywords: ["devolucion de bienes", "devolucion de arma", "arma incautada", "bien incautado", "articulo 88", "comiso", "decomiso"]
  },
  {
    topic: "armas y elementos materiales",
    keywords: ["arma", "armas", "arma de fuego", "salvoconducto", "incautacion de arma", "destruccion arma", "articulo 563"]
  }
];

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function classifyTopics(source = {}, query = "") {
  const haystack = normalizeText([
    query,
    source.title,
    source.extract,
    source.lastQuery
  ].filter(Boolean).join(" "));

  const topics = TOPIC_RULES
    .filter(rule => rule.keywords.some(keyword => haystack.includes(normalizeText(keyword))))
    .map(rule => rule.topic);

  return [...new Set(topics)];
}

function normalizeSource(source = {}, query = "") {
  const base = {
    title: String(source.title || "Fuente jurisprudencial").trim(),
    extract: String(source.extract || source.snippet || "").slice(0, 3000),
    lastQuery: String(query || "").slice(0, 500)
  };

  return {
    url: String(source.url || "").trim(),
    title: base.title,
    corporation: source.corporation || null,
    room: source.room || null,
    year: source.year || null,
    decisionDate: source.date || source.decisionDate || null,
    lastQuery: base.lastQuery,
    extract: base.extract,
    topics: classifyTopics({ ...source, ...base }, query),
    metadata: {
      sourceType: source.sourceType || "jurisprudence",
      official: Boolean(source.official),
      verified: Boolean(source.verified),
      officialViewerUrl: source.officialViewerUrl || null,
      officialSearchUrl: source.officialSearchUrl || null,
      officialPath: source.officialPath || null,
      fileName: source.fileName || null,
      readStatus: source.readStatus || null,
      readAt: source.readAt || null,
      relevanceScore: source.relevanceScore ?? null
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
              last_query, extract, topics, metadata, search_count, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, 1, NOW(), NOW())
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
              topics = COALESCE((
                SELECT jsonb_agg(DISTINCT value)
                FROM jsonb_array_elements_text(jurisprudence_library.topics || EXCLUDED.topics) AS value
              ), '[]'::jsonb),
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
            JSON.stringify(source.topics),
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
        topics: [...new Set([...(existing.topics || []), ...source.topics])],
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
          SELECT url, title, corporation, room, year, decision_date, extract, topics, metadata
          FROM jurisprudence_library
          WHERE title ILIKE $1
             OR extract ILIKE $1
             OR last_query ILIKE $1
             OR topics::text ILIKE $1
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
        topics: row.topics || [],
        sourceType: "jurisprudence_library",
        official: Boolean(row.metadata?.official ?? true),
        verified: Boolean(row.metadata?.verified ?? true),
        officialViewerUrl: row.metadata?.officialViewerUrl || null,
        officialSearchUrl: row.metadata?.officialSearchUrl || null,
        officialPath: row.metadata?.officialPath || null,
        fileName: row.metadata?.fileName || null,
        readStatus: row.metadata?.readStatus || null,
        readAt: row.metadata?.readAt || null,
        relevanceScore: row.metadata?.relevanceScore ?? null
      }));
    });
  }

  const db = await readDB();
  const normalized = cleanQuery.toLowerCase();

  return (db.jurisprudenceLibrary || [])
    .filter(item =>
      String(item.title || "").toLowerCase().includes(normalized) ||
      String(item.extract || "").toLowerCase().includes(normalized) ||
      String(item.lastQuery || "").toLowerCase().includes(normalized) ||
      (item.topics || []).some(topic => String(topic).toLowerCase().includes(normalized))
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
      topics: item.topics || [],
      sourceType: "jurisprudence_library",
      official: Boolean(item.metadata?.official ?? true),
      verified: Boolean(item.metadata?.verified ?? true),
      officialViewerUrl: item.metadata?.officialViewerUrl || null,
      officialSearchUrl: item.metadata?.officialSearchUrl || null,
      officialPath: item.metadata?.officialPath || null,
      fileName: item.metadata?.fileName || null,
      readStatus: item.metadata?.readStatus || null,
      readAt: item.metadata?.readAt || null,
      relevanceScore: item.metadata?.relevanceScore ?? null
    }));
}

export async function listJurisprudenceTopics() {
  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const result = await client.query(
        `
          SELECT topic, COUNT(*)::int AS count
          FROM jurisprudence_library,
               jsonb_array_elements_text(topics) AS topic
          GROUP BY topic
          ORDER BY count DESC, topic ASC
        `
      );

      return result.rows.map(row => ({
        topic: row.topic,
        count: row.count
      }));
    });
  }

  const db = await readDB();
  const counts = new Map();

  for (const item of db.jurisprudenceLibrary || []) {
    for (const topic of item.topics || []) {
      counts.set(topic, (counts.get(topic) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

export async function listJurisprudenceByTopic(topic = "", limit = 20) {
  const cleanTopic = normalizeText(topic);

  if (!cleanTopic) return [];

  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const result = await client.query(
        `
          SELECT url, title, corporation, room, year, decision_date, extract, topics, search_count
          FROM jurisprudence_library
          WHERE topics::text ILIKE $1
          ORDER BY year DESC NULLS LAST, updated_at DESC
          LIMIT $2
        `,
        [`%${cleanTopic}%`, limit]
      );

      return result.rows.map(row => ({
        url: row.url,
        title: row.title,
        corporation: row.corporation,
        room: row.room,
        year: row.year,
        date: row.decision_date,
        extract: row.extract || "",
        topics: row.topics || [],
        searchCount: row.search_count || 0
      }));
    });
  }

  const db = await readDB();

  return (db.jurisprudenceLibrary || [])
    .filter(item => (item.topics || []).some(itemTopic => normalizeText(itemTopic).includes(cleanTopic)))
    .slice(0, limit)
    .map(item => ({
      url: item.url,
      title: item.title,
      corporation: item.corporation,
      room: item.room,
      year: item.year,
      date: item.decisionDate,
      extract: item.extract || "",
      topics: item.topics || [],
      searchCount: item.searchCount || 0
    }));
}
