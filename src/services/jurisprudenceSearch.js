const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/v1/sonar";
const DEFAULT_MODEL = process.env.PERPLEXITY_MODEL || "sonar-pro";

const OFFICIAL_DOMAINS = [
  "corteconstitucional.gov.co",
  "cortesuprema.gov.co",
  "ramajudicial.gov.co"
];

function isPerplexityConfigured() {
  return Boolean(process.env.PERPLEXITY_API_KEY);
}

function isOfficialSource(url = "") {
  return OFFICIAL_DOMAINS.some(domain => url.toLowerCase().includes(domain));
}

function normalizeSearchResult(result) {
  return {
    title: result.title || "Fuente sin titulo",
    url: result.url,
    date: result.date || null,
    lastUpdated: result.last_updated || null,
    snippet: result.snippet || "",
    official: isOfficialSource(result.url || "")
  };
}

function buildJurisprudencePrompt(query) {
  return `
Busca jurisprudencia colombiana real y verificable para esta consulta:

${query}

Reglas:
- Prioriza fuentes oficiales de Corte Constitucional, Corte Suprema de Justicia y Rama Judicial.
- No inventes sentencias, radicados, fechas ni magistrados ponentes.
- Si no encuentras providencia oficial verificable, dilo expresamente.
- Devuelve solo referencias que puedan verificarse con enlace.
- Cuando sea posible, identifica corporacion, sala, radicado o numero de sentencia, fecha y magistrado ponente.
  `.trim();
}

export async function searchJurisprudence(query) {
  if (!query || !query.trim()) {
    throw new Error("Consulta requerida");
  }

  if (!isPerplexityConfigured()) {
    return {
      configured: false,
      answer: "Perplexity todavia no esta configurado. Agrega PERPLEXITY_API_KEY en Render para activar la busqueda jurisprudencial.",
      sources: [],
      officialSources: []
    };
  }

  const response = await fetch(PERPLEXITY_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages: [
        {
          role: "system",
          content: "Eres un buscador juridico. Tu tarea es encontrar providencias reales, trazables y preferiblemente oficiales. No completes datos dudosos."
        },
        {
          role: "user",
          content: buildJurisprudencePrompt(query)
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Error consultando Perplexity: ${response.status} ${detail}`);
  }

  const data = await response.json();
  const sources = (data.search_results || [])
    .filter(result => result.url)
    .map(normalizeSearchResult);

  return {
    configured: true,
    answer: data.choices?.[0]?.message?.content || "",
    citations: data.citations || [],
    sources,
    officialSources: sources.filter(source => source.official),
    needsOfficialVerification: sources.some(source => !source.official)
  };
}
