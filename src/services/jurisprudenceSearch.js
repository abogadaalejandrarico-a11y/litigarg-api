const CSJ_API_URL = "https://consultaprovidenciasbk.cortesuprema.gov.co/api";
const CSJ_VIEWER_URL = "https://consultaprovidencias.cortesuprema.gov.co/visualizador";
const CC_RELATORIA_URL = "https://www.corteconstitucional.gov.co/relatoria";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://litigarg-api.onrender.com").replace(/\/$/, "");
const MAX_SOURCES_FOR_ANSWER = 4;
const LEY_906_ART_88_URL = "https://www.secretariasenado.gov.co/senado/basedoc/ley_0906_2004a_pr002.html#88";

const SEARCH_TRIGGERS = [
  "jurisprudencia",
  "jurisprudencia actualizada",
  "sentencia",
  "providencia",
  "fuente oficial",
  "fuentes oficiales",
  "radicado",
  "norma",
  "articulo",
  "ley 906",
  "codigo de procedimiento penal",
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
      "articulo 88 ley 906 devolucion arma incautada",
      "devolucion bien incautado articulo 88 ley 906",
      "devolucion arma",
      "devolucion de armas",
      "situacion juridica arma incautada",
      "entrega arma incautada",
      "comiso arma devolucion",
      "incautacion arma devolucion",
      "destruccion arma articulo 563 ley 906"
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
  },
  {
    when: ["medida", "aseguramiento"],
    searches: [
      "medida de aseguramiento inferencia razonable finalidad constitucional",
      "medida de aseguramiento necesidad proporcionalidad juez de control de garantias",
      "detencion preventiva peligro para la comunidad comparecencia"
    ]
  },
  {
    when: ["prueba", "documental"],
    searches: [
      "prueba documental incorporacion publicidad contradiccion juicio oral",
      "articulo 431 ley 906 prueba documental lectura incorporacion",
      "estipulaciones probatorias documento hecho estipulado"
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

function extractLegalReferences(query = "") {
  return [
    ...(cleanText(query).match(/\b(?:SP|AP|CP)[-\s]?\d{1,6}[-\s]?\d{4}\b/gi) || []),
    ...(cleanText(query).match(/\b(?:SU|T|C)[-\s]?\d{1,4}[-\s]?\d{2,4}\b/gi) || []),
    ...(cleanText(query).match(/\brad(?:icado)?\.?\s*\d{4,8}\b/gi) || [])
  ].map(reference => cleanText(reference));
}

function buildSearchQueries(query = "") {
  const normalized = normalizeText(query);
  const terms = extractSearchTerms(query);
  const references = extractLegalReferences(query);
  const searches = [...references];

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

  if (normalized.includes("devolucion") && /(arma|bien|bienes|incaut|ocupad)/.test(normalized)) {
    searches.push("devolucion bienes incautados no necesarios investigacion comiso");
    searches.push("arma incautada comiso devolucion debido proceso");
  }

  searches.push(cleanText(query));

  return [...new Set(searches.map(cleanText).filter(Boolean))].slice(0, 7);
}

function getQueryIntent(query = "") {
  const normalized = normalizeText(query);

  return {
    wantsReturnOfSeizedProperty: normalized.includes("devolucion") && /(arma|bien|bienes|incaut|ocupad|comiso)/.test(normalized),
    mentionsWeapon: /(arma|armas|fuego|pistola|revolver|salvoconducto)/.test(normalized),
    mentionsThreatOrIntimidation: /(intimidacion|amenaza|amenazas|constreñimiento|violencia)/.test(normalized),
    mentionsDetentionMeasure: /(medida de aseguramiento|detencion preventiva|intramural|peligro para la comunidad)/.test(normalized),
    mentionsDocumentaryEvidence: /(prueba documental|documento|estipulacion|incorporacion|lectura)/.test(normalized)
  };
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
  const intent = getQueryIntent(originalQuery);
  const haystack = normalizeText([
    source.title,
    source.extract,
    source.fileName
  ].filter(Boolean).join(" "));

  let score = 0;

  for (const term of terms) {
    if (haystack.includes(term)) score += 2;
  }

  if (intent.wantsReturnOfSeizedProperty) {
    if (/(devolucion|entrega|incaut|ocupad|bien|bienes)/.test(haystack)) {
      score += 6;
    } else if (/(comiso|decomiso)/.test(haystack)) {
      score -= 2;
    } else {
      score -= 8;
    }

    if (intent.mentionsWeapon && /(arma|armas|fuego|pistola|revolver)/.test(haystack)) {
      score += 3;
    }
  }

  if (intent.mentionsThreatOrIntimidation) {
    if (/(intimidacion|amenaza|amenazas|constreñimiento|violencia)/.test(haystack)) {
      score += 3;
    } else if (!intent.wantsReturnOfSeizedProperty) {
      score -= 4;
    }
  }

  if (intent.mentionsDetentionMeasure && /(medida de aseguramiento|detencion preventiva|peligro para la comunidad|comparecencia|inferencia razonable)/.test(haystack)) {
    score += 5;
  }

  if (intent.mentionsDocumentaryEvidence && /(prueba documental|documento|incorporacion|estipulacion|publicidad|contradiccion|lectura)/.test(haystack)) {
    score += 5;
  }

  if (source.year && Number(source.year) >= 2020) score += 1;
  if (source.title?.includes("SP")) score += 1;
  if (source.extract) score += 1;

  return score;
}

function isSourcePertinent(source, originalQuery = "") {
  const score = source.relevanceScore ?? scoreSource(source, originalQuery);
  const intent = getQueryIntent(originalQuery);
  const haystack = normalizeText([
    source.title,
    source.extract,
    source.fileName
  ].filter(Boolean).join(" "));

  if (intent.wantsReturnOfSeizedProperty) {
    const returnOfPropertyPattern = /(articulo 88|devolucion de bienes|bienes o recursos|bienes incaut|bien incaut|arma incaut|incaut|ocupad|fines de comiso)/;

    if (!returnOfPropertyPattern.test(haystack)) {
      return false;
    }
  }

  if (intent.mentionsDetentionMeasure && !/(medida de aseguramiento|detencion preventiva|peligro para la comunidad|comparecencia|inferencia razonable|libertad)/.test(haystack)) {
    return score >= 10;
  }

  if (intent.mentionsDocumentaryEvidence && !/(prueba documental|documento|incorporacion|estipulacion|publicidad|contradiccion|lectura)/.test(haystack)) {
    return score >= 10;
  }

  return score >= 6;
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
    .filter(source => isSourcePertinent(source, query))
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

function getStatutorySources(query = "") {
  const normalized = normalizeText(query);
  const sources = [];

  if (normalized.includes("devolucion") && /(arma|bien|bienes|incaut|ocupad)/.test(normalized)) {
    sources.push({
      title: "Ley 906 de 2004, articulo 88 - Devolucion de bienes",
      url: LEY_906_ART_88_URL,
      corporation: "Secretaria del Senado",
      room: "Normativa penal",
      year: 2004,
      sourceType: "law",
      verified: true,
      official: true,
      extract: "El articulo 88 regula la devolucion de bienes y recursos incautados u ocupados cuando no sean necesarios para la indagacion o investigacion, o cuando se determine que no procede su comiso. Tambien exige definir la situacion del bien y comunicar la decision a quien tenga derecho a reclamarlo.",
      snippet: "Devolucion de bienes incautados u ocupados cuando no sean necesarios para la investigacion o no proceda comiso."
    });
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
        source.officialViewerUrl ? `Visor oficial: ${source.officialViewerUrl}` : "",
        source.officialSearchUrl ? `Busqueda oficial: ${source.officialSearchUrl}` : "",
        source.topics?.length ? `Temas asociados: ${source.topics.join(", ")}` : "",
        source.extract ? `Extracto util para sustentar la respuesta: ${source.extract}` : "",
        source.snippet && !source.extract ? `Fragmento orientador: ${source.snippet}` : ""
      ].filter(Boolean);

      return parts.join("\n");
    })
    .join("\n\n");
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeReference(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getSourceAliases(source = {}) {
  const text = normalizeReference([
    source.title,
    source.name,
    source.reference,
    source.fileName,
    source.snippet
  ].filter(Boolean).join(" "));

  const aliases = new Set();

  [
    /\b(?:CSJ\s+)?(?:SP|AP|CP)[-\s]?\d{1,6}[-\s]?\d{4}\b/gi,
    /\b(?:Corte Constitucional\s+)?(?:SU|T|C)[-\s]?\d{1,4}[-\s]?\d{2,4}\b/gi,
    /\brad(?:icado)?\.?\s*\d{4,8}\b/gi
  ].forEach(pattern => {
    (text.match(pattern) || []).forEach(match => {
      const clean = match.replace(/\s+/g, " ").trim();
      aliases.add(clean);
      aliases.add(clean.replace(/([A-Z]{1,3})\s+/i, "$1-"));
      aliases.add(clean.replace(/([A-Z]{1,3})-/i, "$1 "));
    });
  });

  if (source.title && source.title.length <= 90) {
    aliases.add(normalizeReference(source.title));
  }

  return [...aliases]
    .filter(alias => alias.length >= 5)
    .sort((a, b) => b.length - a.length);
}

function buildAliasPattern(alias) {
  return escapeRegExp(alias)
    .replace(/\\\-/g, "[-\\s]?")
    .replace(/\\ /g, "\\s+");
}

export function addInlineSourceLinks(answer = "", sources = []) {
  let linkedAnswer = String(answer || "");
  const linkedAliases = new Set();

  (Array.isArray(sources) ? sources : [])
    .filter(source => source?.url)
    .forEach(source => {
      const aliases = getSourceAliases(source);

      for (const alias of aliases) {
        if (linkedAliases.has(alias.toLowerCase())) continue;

        const pattern = new RegExp(`(${buildAliasPattern(alias)})(?![^\\[]*\\]\\()`, "i");

        if (!pattern.test(linkedAnswer)) continue;

        linkedAnswer = linkedAnswer.replace(pattern, match => {
          linkedAliases.add(alias.toLowerCase());

          if (match.includes("[Fuente oficial](")) {
            return match;
          }

          return `${match} [Fuente oficial](${source.url})`;
        });

        break;
      }
    });

  return linkedAnswer;
}

export async function searchJurisprudence(query) {
  if (!query || !query.trim()) {
    throw new Error("Consulta requerida");
  }

  const statutorySources = getStatutorySources(query);
  const [csjSources, constitutionalSources] = await Promise.all([
    searchCorteSuprema(query).catch(error => ({
      error: error.message,
      sources: []
    })),
    searchCorteConstitucional(query).catch(() => [])
  ]);

  const normalizedCsjSources = Array.isArray(csjSources) ? csjSources : [];
  const errors = Array.isArray(csjSources) ? [] : [csjSources.error].filter(Boolean);
  const sources = [...statutorySources, ...constitutionalSources, ...normalizedCsjSources].slice(0, MAX_SOURCES_FOR_ANSWER);

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
