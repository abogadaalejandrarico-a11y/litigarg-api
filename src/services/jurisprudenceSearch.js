const CSJ_API_URL = "https://consultaprovidenciasbk.cortesuprema.gov.co/api";
const CSJ_VIEWER_URL = "https://consultaprovidencias.cortesuprema.gov.co/visualizador";
const CC_RELATORIA_URL = "https://www.corteconstitucional.gov.co/relatoria";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://litigarg-api.onrender.com").replace(/\/$/, "");
const MAX_SOURCES_FOR_ANSWER = 2;

const SEARCH_TRIGGERS = [
  "jurisprudencia",
  "sentencia",
  "providencia",
  "radicado",
  "corte suprema",
  "corte constitucional",
  "sala penal",
  "control de garantias",
  "medida de aseguramiento",
  "debido proceso",
  "prueba",
  "estipulacion",
  "acusacion",
  "audiencia",
  "casacion",
  "apelacion"
];

const STOP_WORDS = new Set([
  "acerca", "ademas", "ante", "como", "con", "cual", "del", "desde",
  "el", "en", "entre", "esa", "ese", "esta", "este", "hacer", "jurisprudencia",
  "las", "los", "me", "necesito", "para", "por", "proceso", "que", "relacion",
  "sentencia", "sirva", "solicitud", "sustentar", "tengo", "una", "uno"
]);

const LEGAL_SYNONYMS = [
  {
    when: ["devolucion", "arma"],
    searches: [
      "devolucion arma",
      "devolucion de armas",
      "entrega arma incautada",
      "comiso arma devolucion",
      "incautacion arma devolucion"
    ]
  },
  {
    when: ["intimidacion", "arma"],
    searches: [
      "intimidacion arma de fuego",
      "intimidacion con arma",
      "amenaza arma de fuego",
      "violencia arma de fuego"
    ]
  }
];

function cleanText(value = "") {
  return String(value)
    .replace(/["\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value = "") {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function makeCsjViewerUrl(id, room = "Penal", query = "consulta") {
  const encodedId = Buffer.from(id, "utf8").toString("base64");
  return `${CSJ_VIEWER_URL}/${encodeURIComponent(encodedId)}/${encodeURIComponent(room)}/${encodeURIComponent(cleanText(query) || "consulta")}`;
}

function makeCsjDownloadUrl(id) {
  const encodedPath = Buffer.from(id, "utf8").toString("base64url");
  return `${PUBLIC_BASE_URL}/api/jurisprudence/download/${encodedPath}`;
}

function extractSearchTerms(query = "") {
  return normalizeText(query)
    .split(/\s+/)
    .map(term => term.replace(/[^a-z0-9]/g, ""))
    .filter(term => term.length > 3 && !STOP_WORDS.has(term));
}

function buildSearchQueries(query = "") {
  const normalized = normalizeText(query);
  const terms = extractSearchTerms(query);
  const searches = [];

  for (const rule of LEGAL_SYNONYMS) {
    if (rule.when.every(term => normalized.includes(term))) {
      searches.push(...rule.searches);
    }
  }

  if (terms.length) {
    searches.push(terms.slice(0, 6).join(" "));

    if (terms.length > 2) {
      searches.push(terms.slice(0, 3).join(" "));
      searches.push(terms.slice(-3).join(" "));
    }
  }

  searches.push(cleanText(query));

  return [...new Set(searches.map(cleanText).filter(Boolean))].slice(0, 7);
}

function normalizeCsjResult(result, query) {
  const id = result.id || result.onlinePath;
  const fileName = id ? id.split("/").pop() : result.title;
  const extract = Array.isArray(result.fiveParaphraseResult)
    ? result.fiveParaphraseResult
      .map(item => String(item).replace(/<[^>]+>/g, ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 900)
    : "";

  return {
    title: [result.ano, result.doctor, result.autoSentencia, fileName]
      .filter(Boolean)
      .join(" - ") || "Providencia Corte Suprema de Justicia",
    url: id ? makeCsjDownloadUrl(id) : "https://consultaprovidencias.cortesuprema.gov.co/",
    officialViewerUrl: id ? makeCsjViewerUrl(id, "Penal", query) : "https://consultaprovidencias.cortesuprema.gov.co/",
    officialSearchUrl: `https://consultaprovidencias.cortesuprema.gov.co/resultados-busqueda/${encodeURIComponent(cleanText(query))}/Penal`,
    officialPath: id || null,
    fileName,
    corporation: "Corte Suprema de Justicia",
    room: "Sala de Casacion Penal",
    year: result.ano || null,
    date: result.fechaCreacion || null,
    sourceType: "jurisprudence",
    verified: Boolean(id),
    official: true,
    extract,
    snippet: extract
  };
}

function scoreSource(source, originalQuery = "") {
  const terms = extractSearchTerms(originalQuery);
  const haystack = normalizeText([
    source.title,
    source.extract,
    source.fileName
  ].filter(Boolean).join(" "));

  let score = 0;

  for (const term of terms) {
    if (haystack.includes(term)) score += 2;
  }

  if (normalizeText(originalQuery).includes("devolucion") && !/(devolucion|entrega|incaut|comiso)/.test(haystack)) {
    score -= 4;
  }

  if (normalizeText(originalQuery).includes("intimidacion") && !/(intimidacion|amenaza|violencia)/.test(haystack)) {
    score -= 3;
  }

  if (source.year && Number(source.year) >= 2020) score += 1;
  if (source.title?.includes("SP")) score += 1;
  if (source.extract) score += 1;

  return score;
}

function getConstitutionalCandidates(reference) {
  const match = String(reference).match(/\b(SU|T|C)[-\s]?(\d{1,4})[-\s]?(\d{2,4})\b/i);

  if (!match) return [];

  const type = match[1].toUpperCase();
  const number = match[2].padStart(3, "0");
  const year = match[3].length === 4 ? match[3].slice(-2) : match[3];
  const fullYear = match[3].length === 4 ? match[3] : `20${match[3]}`;

  return [
    {
      title: `Corte Constitucional ${type}${number}-${fullYear}`,
      url: `${CC_RELATORIA_URL}/${fullYear}/${type}${number}-${year}.htm`
    },
    {
      title: `Corte Constitucional ${type}-${number}-${fullYear}`,
      url: `${CC_RELATORIA_URL}/${fullYear}/${type}-${number}-${year}.htm`
    }
  ];
}

async function verifyUrl(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": "LitigARG/1.0"
      }
    });

    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

export function shouldSearchJurisprudence(text = "") {
  const normalized = cleanText(text).toLowerCase();

  if (!normalized) return false;
  if (/\b(SU|T|C)[-\s]?\d{1,4}[-\s]?\d{2,4}\b/i.test(normalized)) return true;
  if (/\b(SP|AP|CP)\d{1,5}[-\s]?\d{4}\b/i.test(normalized)) return true;

  return SEARCH_TRIGGERS.some(trigger => normalized.includes(trigger));
}

async function searchCorteSupremaOnce(query) {
  const cleanQuery = cleanText(query);

  const graphQuery = `
    {
      getSearchResult(searchQuery:{
        query: "${cleanQuery}"
        typeOfQuery: "Penal"
        start: 0
        isExact: false
        magistrate: ""
        year: ""
        autoSentencia: ""
        order: "NEW_FIRST"
        roomTutelas: ""
        addedQueries: []
      }) {
        searchResults {
          typeOfDocument
          fiveParaphraseResult
          title
          onlinePath
          doctor
          ano
          fechaCreacion
          id
          autoSentencia
          leyesOArticulos
        }
        numOfResults
      }
    }
  `;

  const response = await fetch(CSJ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: graphQuery })
  });

  if (!response.ok) {
    throw new Error(`La Corte Suprema no respondio la busqueda oficial (${response.status}).`);
  }

  const data = await response.json();
  const results = data.data?.getSearchResult?.searchResults || [];

  return results
    .slice(0, 8)
    .map(result => normalizeCsjResult(result, cleanQuery));
}

async function searchCorteSuprema(query) {
  const searchQueries = buildSearchQueries(query);
  const responses = await Promise.all(
    searchQueries.map(searchQuery => searchCorteSupremaOnce(searchQuery).catch(() => []))
  );
  const byPath = new Map();

  responses.flat().forEach(source => {
    const key = source.officialPath
      ? source.officialPath.replace(/\.(pdf|docx|doc)$/i, "")
      : source.url;
    const current = byPath.get(key);
    const score = scoreSource(source, query);

    if (!current || score > current.relevanceScore) {
      byPath.set(key, {
        ...source,
        relevanceScore: score
      });
    }
  });

  return [...byPath.values()]
    .filter(source => source.relevanceScore >= 6)
    .sort((a, b) => b.relevanceScore - a.relevanceScore || Number(b.year || 0) - Number(a.year || 0))
    .slice(0, MAX_SOURCES_FOR_ANSWER);
}

async function searchCorteConstitucional(query) {
  const references = [...new Set(cleanText(query).match(/\b(?:SU|T|C)[-\s]?\d{1,4}[-\s]?\d{2,4}\b/gi) || [])];
  const sources = [];

  for (const reference of references.slice(0, 4)) {
    const candidates = getConstitutionalCandidates(reference);

    for (const candidate of candidates) {
      if (await verifyUrl(candidate.url)) {
        sources.push({
          ...candidate,
          corporation: "Corte Constitucional",
          sourceType: "jurisprudence",
          verified: true,
          official: true,
          extract: "",
          snippet: ""
        });
        break;
      }
    }
  }

  return sources;
}

export function formatSourcesForPrompt(sources = []) {
  if (!sources.length) return "";

  return sources
    .map((source, index) => {
      const parts = [
        `${index + 1}. ${source.title}`,
        source.corporation ? `Corporacion: ${source.corporation}` : "",
        source.room ? `Sala: ${source.room}` : "",
        source.year ? `Ano: ${source.year}` : "",
        source.url ? `Enlace oficial: ${source.url}` : "",
        source.topics?.length ? `Temas asociados: ${source.topics.join(", ")}` : "",
        source.extract ? `Extracto util para sustentar la respuesta: ${source.extract}` : "",
        source.snippet && !source.extract ? `Fragmento orientador: ${source.snippet}` : ""
      ].filter(Boolean);

      return parts.join("\n");
    })
    .join("\n\n");
}

export async function searchJurisprudence(query) {
  if (!query || !query.trim()) {
    throw new Error("Consulta requerida");
  }

  const [csjSources, constitutionalSources] = await Promise.all([
    searchCorteSuprema(query).catch(error => ({
      error: error.message,
      sources: []
    })),
    searchCorteConstitucional(query).catch(() => [])
  ]);

  const normalizedCsjSources = Array.isArray(csjSources) ? csjSources : [];
  const errors = Array.isArray(csjSources) ? [] : [csjSources.error].filter(Boolean);
  const sources = [...constitutionalSources, ...normalizedCsjSources].slice(0, MAX_SOURCES_FOR_ANSWER);

  return {
    configured: true,
    provider: "official-repositories",
    answer: sources.length
      ? "Busqueda realizada en repositorios oficiales disponibles."
      : "No encontre una fuente oficial verificable con esta consulta inicial.",
    sources,
    officialSources: sources.filter(source => source.official),
    needsOfficialVerification: sources.some(source => !source.verified),
    errors
  };
}
