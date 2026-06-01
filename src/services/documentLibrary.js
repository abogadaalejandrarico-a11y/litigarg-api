import { isPostgresEnabled, readDB, withDBClient, writeDB } from "../db/db.js";

const CHUNK_SIZE = 2600;
const CHUNK_OVERLAP = 350;
const MAX_CONTEXT_CHUNKS = 5;

const TOPIC_RULES = [
  {
    topic: "control de garantias",
    keywords: ["control de garantias", "juez de control", "audiencia preliminar", "captura", "injerencia", "garante de derechos"]
  },
  {
    topic: "argumentacion juridica",
    keywords: ["argumentacion", "tesis", "premisa", "persuasion", "alegato", "teoria del caso"]
  },
  {
    topic: "interrogatorio y contrainterrogatorio",
    keywords: ["interrogatorio", "contrainterrogatorio", "testigo", "pregunta", "impugnacion de credibilidad"]
  },
  {
    topic: "prueba documental",
    keywords: ["prueba documental", "documento", "autenticacion", "incorporacion", "publicidad", "contradiccion"]
  },
  {
    topic: "estipulaciones probatorias",
    keywords: ["estipulacion", "acuerdo probatorio", "hecho estipulado"]
  },
  {
    topic: "medida de aseguramiento",
    keywords: ["medida de aseguramiento", "detencion preventiva", "peligro para la comunidad", "comparecencia"]
  },
  {
    topic: "juicio oral",
    keywords: ["juicio oral", "alegato de apertura", "alegato de conclusion", "practica probatoria"]
  }
];

const STOP_WORDS = new Set([
  "para", "como", "cual", "cuando", "donde", "sobre", "entre", "desde", "porque",
  "este", "esta", "estos", "estas", "tengo", "necesito", "hacer", "analiza", "del",
  "las", "los", "una", "uno", "con", "sin", "que", "por", "ante"
]);

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extractTerms(query = "") {
  return normalizeText(query)
    .split(/\s+/)
    .map(term => term.replace(/[^a-z0-9]/g, ""))
    .filter(term => term.length > 3 && !STOP_WORDS.has(term));
}

function classifyTopics(text = "") {
  const normalized = normalizeText(text);

  return TOPIC_RULES
    .filter(rule => rule.keywords.some(keyword => normalized.includes(normalizeText(keyword))))
    .map(rule => rule.topic);
}

function parseTags(tags) {
  if (Array.isArray(tags)) return tags.map(String).map(tag => tag.trim()).filter(Boolean);
  return String(tags || "")
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean);
}

function chunkText(text = "") {
  const chunks = [];
  let index = 0;
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const content = text.slice(start, end).trim();

    if (content) {
      chunks.push({
        index,
        content,
        topics: classifyTopics(content)
      });
      index += 1;
    }

    if (end >= text.length) break;
    start = Math.max(0, end - CHUNK_OVERLAP);
  }

  return chunks;
}

function scoreChunk(chunk, query = "") {
  const terms = extractTerms(query);
  const haystack = normalizeText([
    chunk.title,
    chunk.author,
    chunk.category,
    (chunk.tags || []).join(" "),
    (chunk.topics || []).join(" "),
    chunk.content
  ].filter(Boolean).join(" "));

  let score = 0;

  for (const term of terms) {
    if (haystack.includes(term)) score += 2;
  }

  for (const topic of chunk.topics || []) {
    if (normalizeText(query).includes(normalizeText(topic))) score += 3;
  }

  return score;
}

export async function saveLibraryDocument({ file, text, userId, title, author, category, tags, description }) {
  const cleanTitle = (title || file.originalname || "Documento de biblioteca").trim();
  const cleanTags = parseTags(tags);
  const chunks = chunkText(text);
  const preview = text.slice(0, 800);

  if (!chunks.length) {
    throw new Error("No pude extraer contenido suficiente para guardar en biblioteca.");
  }

  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const documentResult = await client.query(
        `
          INSERT INTO document_library (
            title, file_name, mime_type, author, category, description,
            tags, text_preview, uploaded_by, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, NOW(), NOW())
          RETURNING id, title, file_name, author, category, tags, created_at
        `,
        [
          cleanTitle,
          file.originalname || cleanTitle,
          file.mimetype || null,
          author || null,
          category || null,
          description || null,
          JSON.stringify(cleanTags),
          preview,
          userId || null
        ]
      );

      const documentId = documentResult.rows[0].id;

      for (const chunk of chunks) {
        await client.query(
          `
            INSERT INTO document_chunks (document_id, chunk_index, content, topics, created_at)
            VALUES ($1, $2, $3, $4::jsonb, NOW())
          `,
          [documentId, chunk.index, chunk.content, JSON.stringify(chunk.topics)]
        );
      }

      return {
        id: documentId,
        title: documentResult.rows[0].title,
        fileName: documentResult.rows[0].file_name,
        author: documentResult.rows[0].author,
        category: documentResult.rows[0].category,
        tags: documentResult.rows[0].tags || [],
        chunks: chunks.length,
        created_at: documentResult.rows[0].created_at
      };
    });
  }

  const db = await readDB();
  db.documentLibrary = db.documentLibrary || [];
  db.documentChunks = db.documentChunks || [];

  const documentId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date().toISOString();
  const document = {
    id: documentId,
    title: cleanTitle,
    fileName: file.originalname || cleanTitle,
    mimeType: file.mimetype || null,
    author: author || null,
    category: category || null,
    description: description || null,
    tags: cleanTags,
    textPreview: preview,
    uploadedBy: userId || null,
    created_at: now,
    updated_at: now
  };

  db.documentLibrary.push(document);
  chunks.forEach(chunk => {
    db.documentChunks.push({
      id: `chunk_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      documentId,
      chunkIndex: chunk.index,
      content: chunk.content,
      topics: chunk.topics,
      created_at: now
    });
  });

  await writeDB(db);

  return {
    ...document,
    chunks: chunks.length
  };
}

export async function findRelevantDocuments(query = "", limit = MAX_CONTEXT_CHUNKS) {
  if (!query || !query.trim()) return [];

  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const terms = extractTerms(query).slice(0, 8);

      if (!terms.length) return [];

      const likeClauses = terms.map((_, index) =>
        `(dl.title ILIKE $${index + 1} OR dc.content ILIKE $${index + 1} OR dl.tags::text ILIKE $${index + 1} OR dc.topics::text ILIKE $${index + 1})`
      ).join(" OR ");

      const result = await client.query(
        `
          SELECT
            dl.id AS document_id,
            dl.title,
            dl.author,
            dl.category,
            dl.tags,
            dc.chunk_index,
            dc.content,
            dc.topics
          FROM document_chunks dc
          JOIN document_library dl ON dl.id = dc.document_id
          WHERE ${likeClauses}
          ORDER BY dl.updated_at DESC, dc.chunk_index ASC
          LIMIT 40
        `,
        terms.map(term => `%${term}%`)
      );

      return result.rows
        .map(row => ({
          documentId: row.document_id,
          title: row.title,
          author: row.author,
          category: row.category,
          tags: row.tags || [],
          chunkIndex: row.chunk_index,
          content: row.content,
          topics: row.topics || []
        }))
        .map(chunk => ({
          ...chunk,
          relevanceScore: scoreChunk(chunk, query)
        }))
        .filter(chunk => chunk.relevanceScore > 0)
        .sort((a, b) => b.relevanceScore - a.relevanceScore)
        .slice(0, limit);
    });
  }

  const db = await readDB();
  const documents = db.documentLibrary || [];

  return (db.documentChunks || [])
    .map(chunk => {
      const document = documents.find(item => item.id === chunk.documentId) || {};
      return {
        documentId: chunk.documentId,
        title: document.title,
        author: document.author,
        category: document.category,
        tags: document.tags || [],
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        topics: chunk.topics || []
      };
    })
    .map(chunk => ({
      ...chunk,
      relevanceScore: scoreChunk(chunk, query)
    }))
    .filter(chunk => chunk.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

export function formatDocumentContext(chunks = []) {
  if (!chunks.length) return "";

  return chunks
    .map((chunk, index) => [
      `${index + 1}. ${chunk.title || "Documento interno"}`,
      chunk.author ? `Autor: ${chunk.author}` : "",
      chunk.category ? `Categoria: ${chunk.category}` : "",
      chunk.topics?.length ? `Temas: ${chunk.topics.join(", ")}` : "",
      `Fragmento interno: ${chunk.content}`
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}

export async function listLibraryDocuments() {
  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const result = await client.query(
        `
          SELECT dl.id, dl.title, dl.file_name, dl.author, dl.category, dl.tags, dl.created_at,
                 COUNT(dc.id)::int AS chunks
          FROM document_library dl
          LEFT JOIN document_chunks dc ON dc.document_id = dl.id
          GROUP BY dl.id
          ORDER BY dl.created_at DESC
        `
      );

      return result.rows.map(row => ({
        id: row.id,
        title: row.title,
        fileName: row.file_name,
        author: row.author,
        category: row.category,
        tags: row.tags || [],
        chunks: row.chunks,
        created_at: row.created_at
      }));
    });
  }

  const db = await readDB();

  return (db.documentLibrary || []).map(document => ({
    ...document,
    chunks: (db.documentChunks || []).filter(chunk => chunk.documentId === document.id).length
  }));
}
