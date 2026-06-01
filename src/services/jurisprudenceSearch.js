const CSJ_API_URL = "https://consultaprovidenciasbk.cortesuprema.gov.co/api";
const CSJ_VIEWER_URL = "https://consultaprovidencias.cortesuprema.gov.co/visualizador";
const CC_RELATORIA_URL = "https://www.corteconstitucional.gov.co/relatoria";

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

function cleanText(value = "") {
  return String(value)
    .replace(/["\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function makeCsjViewerUrl(id, room = "Penal", query = "consulta") {
  const encodedId = Buffer.from(id, "utf8").toString("base64");
  return `${CSJ_VIEWER_URL}/${encodeURIComponent(encodedId)}/${encodeURIComponent(room)}/${encodeURIComponent(cleanText(query) || "consulta")}`;
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
    url: id ? makeCsjViewerUrl(id, "Penal", query) : "https://consultaprovidencias.cortesuprema.gov.co/",
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

async function searchCorteSuprema(query) {
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
    .slice(0, 5)
    .map(result => normalizeCsjResult(result, cleanQuery));
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
  const sources = [...constitutionalSources, ...normalizedCsjSources];

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
