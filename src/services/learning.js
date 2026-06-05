import { isPostgresEnabled, readDB, withDBClient, writeDB } from "../db/db.js";
import { isAdminUserId } from "./adminAccess.js";

const STOP_WORDS = new Set([
  "acerca", "ademas", "ante", "como", "con", "cual", "debe", "del", "desde",
  "ella", "ellos", "este", "esta", "esto", "hacer", "juridico", "juridica",
  "las", "los", "para", "pero", "por", "pregunta", "proceso", "que", "una"
]);

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function extractTerms(value = "") {
  return normalizeText(value)
    .split(/\s+/)
    .map(term => term.replace(/[^a-z0-9]/g, ""))
    .filter(term => term.length > 3 && !STOP_WORDS.has(term));
}

function scoreGuidance(guidance = {}, query = "") {
  const terms = extractTerms(query);
  const haystack = normalizeText([
    guidance.title,
    guidance.problemPattern,
    guidance.problem_pattern,
    guidance.guidance,
    (guidance.tags || []).join(" ")
  ].filter(Boolean).join(" "));

  let score = Number(guidance.weight || 1);

  for (const term of terms.slice(0, 12)) {
    if (haystack.includes(term)) score += 2;
  }

  return score;
}

function makeTitle(problemPattern = "") {
  const clean = String(problemPattern || "").replace(/\s+/g, " ").trim();
  return clean
    ? clean.slice(0, 90)
    : "Pauta aprendida de respuesta";
}

function inferTags(text = "") {
  const normalized = normalizeText(text);
  const tags = [];

  [
    ["problema juridico", /(problema juridico|pregunta real|identificar el problema)/],
    ["jurisprudencia", /(jurisprudencia|sentencia|providencia|radicado|precedente)/],
    ["fuentes", /(fuente|enlace|link|cita|verificable)/],
    ["argumentacion oral", /(juez|su senoria|audiencia|argumento oral|intervencion)/],
    ["precision", /(precisa|correcta|exacta|no generica|concreta)/],
    ["documentos", /(documento|pdf|archivo|prueba documental|emp)/
    ]
  ].forEach(([tag, pattern]) => {
    if (pattern.test(normalized)) tags.push(tag);
  });

  return [...new Set(tags)];
}

export async function saveResponseFeedback({
  userId,
  chatId,
  userMessage,
  assistantAnswer,
  rating,
  correction,
  sources
}) {
  const cleanRating = ["like", "dislike", "correction"].includes(rating)
    ? rating
    : "correction";
  const cleanCorrection = String(correction || "").trim();
  const admin = await isAdminUserId(userId);

  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const result = await client.query(
        `
          INSERT INTO response_feedback (
            user_id, chat_id, user_message, assistant_answer,
            rating, correction, is_admin, sources, created_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, NOW())
          RETURNING id, rating, correction, is_admin, created_at
        `,
        [
          userId || null,
          chatId || null,
          String(userMessage || "").slice(0, 6000),
          String(assistantAnswer || "").slice(0, 12000),
          cleanRating,
          cleanCorrection || null,
          admin,
          JSON.stringify(Array.isArray(sources) ? sources : [])
        ]
      );

      const feedback = result.rows[0];

      if (admin && cleanCorrection) {
        const guidanceResult = await client.query(
          `
            INSERT INTO learned_guidance (
              source_feedback_id, created_by, title, problem_pattern,
              guidance, tags, weight, active, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6::jsonb, 3, TRUE, NOW(), NOW())
            RETURNING id
          `,
          [
            feedback.id,
            userId || null,
            makeTitle(userMessage),
            String(userMessage || "").slice(0, 1000),
            cleanCorrection.slice(0, 4000),
            JSON.stringify(inferTags(`${userMessage} ${cleanCorrection}`))
          ]
        );

        feedback.learnedGuidanceId = guidanceResult.rows[0]?.id || null;
      }

      return feedback;
    });
  }

  const db = await readDB();
  db.responseFeedback = db.responseFeedback || [];
  db.learnedGuidance = db.learnedGuidance || [];

  const feedback = {
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: userId || null,
    chatId: chatId || null,
    userMessage: String(userMessage || "").slice(0, 6000),
    assistantAnswer: String(assistantAnswer || "").slice(0, 12000),
    rating: cleanRating,
    correction: cleanCorrection || null,
    isAdmin: admin,
    sources: Array.isArray(sources) ? sources : [],
    createdAt: new Date().toISOString()
  };

  db.responseFeedback.push(feedback);

  if (admin && cleanCorrection) {
    const learned = {
      id: `learn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sourceFeedbackId: feedback.id,
      createdBy: userId || null,
      title: makeTitle(userMessage),
      problemPattern: String(userMessage || "").slice(0, 1000),
      guidance: cleanCorrection.slice(0, 4000),
      tags: inferTags(`${userMessage} ${cleanCorrection}`),
      weight: 3,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.learnedGuidance.push(learned);
    feedback.learnedGuidanceId = learned.id;
  }

  await writeDB(db);
  return feedback;
}

export async function findRelevantGuidance(query = "", limit = 4) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return [];

  if (isPostgresEnabled()) {
    return withDBClient(async client => {
      const terms = extractTerms(cleanQuery).slice(0, 8);
      const clauses = terms.length
        ? terms.map((_, index) => `
            title ILIKE $${index + 1}
            OR problem_pattern ILIKE $${index + 1}
            OR guidance ILIKE $${index + 1}
            OR tags::text ILIKE $${index + 1}
          `).join(" OR ")
        : "problem_pattern ILIKE $1 OR guidance ILIKE $1";
      const params = terms.length
        ? terms.map(term => `%${term}%`)
        : [`%${cleanQuery.slice(0, 80)}%`];

      const result = await client.query(
        `
          SELECT id, title, problem_pattern, guidance, tags, weight, updated_at
          FROM learned_guidance
          WHERE active = TRUE AND (${clauses})
          ORDER BY weight DESC, updated_at DESC
          LIMIT 20
        `,
        params
      );

      return result.rows
        .map(row => ({
          id: row.id,
          title: row.title,
          problemPattern: row.problem_pattern,
          guidance: row.guidance,
          tags: row.tags || [],
          weight: row.weight || 1,
          score: scoreGuidance(row, cleanQuery)
        }))
        .filter(row => row.score >= 4)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    });
  }

  const db = await readDB();

  return (db.learnedGuidance || [])
    .filter(item => item.active !== false)
    .map(item => ({
      ...item,
      score: scoreGuidance(item, cleanQuery)
    }))
    .filter(item => item.score >= 4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function formatGuidanceContext(items = []) {
  if (!items.length) return "";

  return items
    .map((item, index) => [
      `${index + 1}. ${item.title}`,
      `Problema patron: ${item.problemPattern || item.problem_pattern || ""}`,
      `Pauta aprendida: ${item.guidance}`,
      item.tags?.length ? `Etiquetas: ${item.tags.join(", ")}` : ""
    ].filter(Boolean).join("\n"))
    .join("\n\n");
}
