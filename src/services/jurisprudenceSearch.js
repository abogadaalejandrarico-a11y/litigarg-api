import { extractDocumentText } from "./documentText.js";

const CSJ_API_URL = "https://consultaprovidenciasbk.cortesuprema.gov.co/api";
const CSJ_BACKEND_URL = "https://consultaprovidenciasbk.cortesuprema.gov.co";
const CSJ_VIEWER_URL = "https://consultaprovidencias.cortesuprema.gov.co/visualizador";
const CC_RELATORIA_URL = "https://www.corteconstitucional.gov.co/relatoria";
const SUIN_URL = "https://www.suin-juriscol.gov.co";
const SENADO_BASEDOC_URL = "https://www.secretariasenado.gov.co/senado/basedoc";
const SENADO_GACETAS_URL = "https://www.secretariasenado.gov.co/legibus/legibus/gacetas";
const RAMA_JUDICIAL_URL = "https://www.ramajudicial.gov.co";
const AMBITO_JURIDICO_URL = "https://www.ambitojuridico.com";
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || "https://litigarg-api.onrender.com").replace(/\/$/, "");
const MAX_SOURCES_FOR_ANSWER = 8;
const LEY_906_ART_88_URL = "https://www.secretariasenado.gov.co/senado/basedoc/ley_0906_2004a_pr002.html#88";
const COLOMBIAN_LEGAL_REPOSITORIES = [
  "Corte Suprema de Justicia - Sala de Casacion Penal",
  "Corte Constitucional - Relatoria",
  "Secretaria del Senado - Leyes colombianas",
  "SUIN-Juriscol",
  "Rama Judicial",
  "Gaceta del Congreso/Senado",
  "Ambito Juridico como fuente secundaria orientadora"
];

const PENAL_LAW_SOURCES = [
  {
    key: "ley_599_art_249",
    title: "Ley 599 de 2000, articulo 249 - Abuso de confianza",
    url: `${SENADO_BASEDOC_URL}/ley_0599_2000_pr009.html#249`,
    corporation: "Secretaria del Senado",
    room: "Normativa penal sustancial",
    year: 2000,
    keywords: ["abuso de confianza", "apropiacion", "titulo no traslativo de dominio", "entrega previa"],
    extract: "El articulo 249 exige apropiacion, en provecho propio o ajeno, de una cosa mueble ajena previamente confiada o entregada mediante un titulo que no transfiera el dominio."
  },
  {
    key: "ley_599",
    title: "Ley 599 de 2000 - Codigo Penal",
    url: `${SENADO_BASEDOC_URL}/ley_0599_2000.html`,
    corporation: "Secretaria del Senado",
    room: "Normativa penal sustancial",
    year: 2000,
    keywords: ["ley 599", "codigo penal", "delito", "tipicidad", "pena", "amenaza", "homicidio", "hurto", "abuso de confianza", "apropiacion", "titulo no traslativo de dominio", "lesiones", "intimidacion", "arma de fuego"]
  },
  {
    key: "ley_600",
    title: "Ley 600 de 2000 - Codigo de Procedimiento Penal anterior",
    url: `${SENADO_BASEDOC_URL}/ley_0600_2000.html`,
    corporation: "Secretaria del Senado",
    room: "Normativa procesal penal",
    year: 2000,
    keywords: ["ley 600", "codigo de procedimiento penal anterior", "sistema mixto", "instruccion", "fiscalia ley 600"]
  },
  {
    key: "ley_906",
    title: "Ley 906 de 2004 - Codigo de Procedimiento Penal",
    url: `${SENADO_BASEDOC_URL}/ley_0906_2004.html`,
    corporation: "Secretaria del Senado",
    room: "Normativa procesal penal",
    year: 2004,
    keywords: ["ley 906", "codigo de procedimiento penal", "sistema penal oral acusatorio", "audiencia", "imputacion", "acusacion", "juicio oral", "medida de aseguramiento", "prueba", "control de garantias"]
  },
  {
    key: "ley_906_art_88",
    title: "Ley 906 de 2004, articulo 88 - Devolucion de bienes",
    url: LEY_906_ART_88_URL,
    corporation: "Secretaria del Senado",
    room: "Normativa procesal penal",
    year: 2004,
    keywords: ["articulo 88", "devolucion", "bien incautado", "bienes incautados", "arma incautada", "comiso", "decomiso", "ocupacion de bienes"],
    extract: "El articulo 88 regula la devolucion de bienes y recursos incautados u ocupados cuando no sean necesarios para la indagacion o investigacion, o cuando se determine que no procede su comiso. Tambien exige definir la situacion del bien y comunicar la decision a quien tenga derecho a reclamarlo.",
    snippet: "Devolucion de bienes incautados u ocupados cuando no sean necesarios para la investigacion o no proceda comiso."
  },
  {
    key: "ley_1826",
    title: "Ley 1826 de 2017 - Procedimiento penal especial abreviado y acusador privado",
    url: `${SENADO_BASEDOC_URL}/ley_1826_2017.html`,
    corporation: "Secretaria del Senado",
    room: "Normativa procesal penal",
    year: 2017,
    keywords: ["ley 1826", "procedimiento especial abreviado", "acusador privado", "delitos querellables", "articulo 563", "destruccion arma"]
  },
  {
    key: "ley_1908",
    title: "Ley 1908 de 2018 - Fortalecimiento de investigacion contra organizaciones criminales",
    url: `${SENADO_BASEDOC_URL}/ley_1908_2018.html`,
    corporation: "Secretaria del Senado",
    room: "Normativa penal especial",
    year: 2018,
    keywords: ["ley 1908", "organizaciones criminales", "grupo armado organizado", "gao", "delincuencia organizada", "sometimiento"]
  }
];

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
  "ley 599",
  "ley 600",
  "ley 1826",
  "ley 1908",
  "codigo penal",
  "codigo de procedimiento penal",
  "suin",
  "secretaria del senado",
  "rama judicial",
  "ambito juridico",
  "gaceta",
  "gaceta del senado",
  "gaceta del congreso",
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
  "dame", "delito", "linea", "sentencia", "sirva", "solicitud", "sustentar", "tengo", "una", "uno"
]);

const LEGAL_SYNONYMS = [
  {
    when: ["abuso", "confianza"],
    searches: [
      "abuso de confianza apropiacion titulo no traslativo de dominio",
      "abuso de confianza entrega previa bien mueble ajeno",
      "diferencia hurto abuso de confianza disponibilidad material",
      "articulo 249 codigo penal abuso de confianza"
    ]
  },
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

  if (/(linea jurisprudencial|linea de jurisprudencia|precedente|precedentes)/.test(normalized) && /(dosis minima|dosis personal|marihuana|cannabis|estupefaciente|sustancias psicoactivas)/.test(normalized)) {
    searches.push("C-221 de 1994 dosis personal libre desarrollo personalidad");
    searches.push("C-491 de 2012 dosis personal porte consumo estupefacientes");
    searches.push("C-253 de 2019 consumo sustancias psicoactivas espacio publico");
    searches.push("dosis personal marihuana libre desarrollo personalidad Corte Constitucional");
  }

  if (/(sistema penal oral acusatorio|sistema acusatorio|ley 906|audiencias preliminares|audiencia preliminar|acusacion|preparatoria|juicio oral)/.test(normalized)) {
    searches.push("C-591 de 2005 sistema penal oral acusatorio Ley 906");
    searches.push("C-025 de 2009 juez control de garantias control material proporcionalidad");
    searches.push("C-1194 de 2005 defensa sistema penal acusatorio");
    searches.push("C-209 de 2007 victimas sistema penal acusatorio");
    searches.push("SP3168 2017 hechos juridicamente relevantes acusacion imputacion");
  }

  searches.push(
    ...COLOMBIAN_LEGAL_REPOSITORIES.map(repository => `${repository}: ${terms.slice(0, 5).join(" ") || cleanText(query)}`)
  );

  searches.push(cleanText(query));

  return [...new Set(searches.map(cleanText).filter(Boolean))].slice(0, 12);
}

function getQueryIntent(query = "") {
  const normalized = normalizeText(query);

  return {
    asksJurisprudentialLine: /(linea jurisprudencial|linea de jurisprudencia|precedente|precedentes|desarrollo jurisprudencial)/.test(normalized),
    mentionsMinimumDose: /(dosis minima|dosis personal|marihuana|cannabis|estupefaciente|estupefacientes|sustancias psicoactivas|psicoactivas|consumo personal|porte para consumo)/.test(normalized),
    mentionsSpoaStructure: /(sistema penal oral acusatorio|sistema acusatorio|ley 906|audiencias preliminares|audiencia preliminar|acusacion|preparatoria|juicio oral|estructura.*proceso penal|proceso penal oral)/.test(normalized),
    wantsReturnOfSeizedProperty: normalized.includes("devolucion") && /(arma|bien|bienes|incaut|ocupad|comiso)/.test(normalized),
    mentionsWeapon: /(arma|armas|fuego|pistola|revolver|salvoconducto)/.test(normalized),
    mentionsThreatOrIntimidation: /(intimidacion|amenaza|amenazas|constreñimiento|violencia)/.test(normalized),
    mentionsDetentionMeasure: /(medida de aseguramiento|detencion preventiva|intramural|peligro para la comunidad)/.test(normalized),
    mentionsDocumentaryEvidence: /(prueba documental|documento|estipulacion|incorporacion|lectura)/.test(normalized),
    mentionsSubstantiveCriminalLaw: /(codigo penal|ley 599|delito|tipicidad|pena|punible|arma de fuego|amenaza|intimidacion|lesiones|homicidio|hurto|abuso de confianza|apropiacion)/.test(normalized),
    mentionsBreachOfTrust: /(abuso de confianza|titulo no traslativo de dominio|entrega previa)/.test(normalized),
    mentionsProceduralLaw: /(ley 906|codigo de procedimiento penal|audiencia|imputacion|acusacion|juicio oral|control de garantias|preparatoria|apelacion|casacion)/.test(normalized),
    mentionsLaw600: /(ley 600|sistema mixto|instruccion penal)/.test(normalized),
    mentionsAbbreviatedProcedure: /(ley 1826|procedimiento especial abreviado|acusador privado|querella|querellable|articulo 563)/.test(normalized),
    mentionsOrganizedCrime: /(ley 1908|organizaciones criminales|grupo armado organizado|gao|delincuencia organizada|sometimiento)/.test(normalized),
    asksForLegislativeChange: /(modifica|modificacion|reforma|gaceta|proyecto de ley|ley penal|senado|congreso)/.test(normalized)
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
    source.snippet,
    source.fileName,
    ...(source.keywords || [])
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

  if (intent.mentionsBreachOfTrust) {
    if (/(abuso de confianza|apropiacion|titulo no traslativo|entrega previa|disponibilidad material)/.test(haystack)) score += 8;
    else score -= 6;
  }

  if (source.year && Number(source.year) >= 2020) score += 1;
  if (source.title?.includes("SP")) score += 1;
  if (source.extractVerified || source.sourceType === "law") score += 2;
  if (source.citationVerified) score += 8;
  if (source.sourceType === "jurisprudence" && source.readStatus !== "read" && !source.citationVerified) score -= 8;
  if (source.sourceType === "law") score += 10;
  if (source.sourceType === "repository_search") score -= 4;
  if (source.sourceType === "secondary_reference") score -= 6;

  return score;
}

function hasStrongIntentMatch(source, originalQuery = "") {
  const intent = getQueryIntent(originalQuery);
  const haystack = normalizeText([
    source.title,
    source.extract,
    source.snippet,
    source.fileName,
    ...(source.keywords || [])
  ].filter(Boolean).join(" "));

  if (source.sourceType === "law") {
    return true;
  }

  if (source.sourceType === "repository_search" || source.sourceType === "secondary_reference") {
    return false;
  }

  if (intent.wantsReturnOfSeizedProperty) {
    const propertyMatch = /(articulo 88|devolucion|entrega|incaut|ocupad|comiso|decomiso|bienes|arma)/.test(haystack);
    const weaponMatch = !intent.mentionsWeapon || /(arma|armas|fuego|pistola|revolver|salvoconducto)/.test(haystack);

    return propertyMatch && weaponMatch;
  }

  if (intent.mentionsDetentionMeasure) {
    return /(medida de aseguramiento|detencion preventiva|intramural|peligro para la comunidad|comparecencia|inferencia razonable|libertad)/.test(haystack);
  }

  if (intent.mentionsDocumentaryEvidence) {
    const hasDocumentTopic = /(prueba documental|documento|documental)/.test(haystack);
    const hasTrialUseTopic = /(incorporacion|estipulacion|publicidad|contradiccion|lectura|articulo 431|juicio oral|introduccion|autenticacion)/.test(haystack);

    return hasDocumentTopic && hasTrialUseTopic;
  }

  if (intent.mentionsBreachOfTrust) {
    return /(abuso de confianza|apropiacion|titulo no traslativo|entrega previa|disponibilidad material)/.test(haystack);
  }

  if (intent.mentionsOrganizedCrime) {
    return /(ley 1908|organizaciones criminales|grupo armado organizado|gao|delincuencia organizada|sometimiento)/.test(haystack);
  }

  if (intent.mentionsMinimumDose) {
    return /(dosis personal|dosis minima|estupefaciente|estupefacientes|sustancias psicoactivas|marihuana|cannabis|consumo|porte)/.test(haystack);
  }

  return true;
}

function isSourcePertinent(source, originalQuery = "") {
  const score = source.relevanceScore ?? scoreSource(source, originalQuery);
  const intent = getQueryIntent(originalQuery);
  const haystack = normalizeText([
    source.title,
    source.extract,
    source.snippet,
    source.fileName,
    ...(source.keywords || [])
  ].filter(Boolean).join(" "));

  if (source.sourceType === "jurisprudence" && source.readStatus && source.readStatus !== "read" && !source.citationVerified) {
    return false;
  }

  if (!hasStrongIntentMatch(source, originalQuery)) {
    return false;
  }

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

  return score >= 8;
}

function getMimeTypeFromFileName(fileName = "") {
  if (/\.pdf$/i.test(fileName)) return "application/pdf";
  if (/\.docx$/i.test(fileName)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (/\.doc$/i.test(fileName)) return "application/msword";
  return "text/plain";
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&aacute;/gi, "a")
    .replace(/&eacute;/gi, "e")
    .replace(/&iacute;/gi, "i")
    .replace(/&oacute;/gi, "o")
    .replace(/&uacute;/gi, "u")
    .replace(/&ntilde;/gi, "n")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreParagraph(paragraph = "", query = "") {
  const terms = extractSearchTerms(query);
  const normalizedParagraph = normalizeText(paragraph);
  let score = 0;

  for (const term of terms) {
    if (normalizedParagraph.includes(term)) score += 2;
  }

  const intent = getQueryIntent(query);

  if (intent.wantsReturnOfSeizedProperty && /(devolucion|entrega|incaut|ocupad|comiso|decomiso|bienes|recursos)/.test(normalizedParagraph)) {
    score += 8;
  }

  if (intent.mentionsDetentionMeasure && /(medida de aseguramiento|detencion preventiva|peligro para la comunidad|comparecencia|inferencia razonable)/.test(normalizedParagraph)) {
    score += 8;
  }

  if (intent.mentionsDocumentaryEvidence && /(prueba documental|incorporacion|estipulacion|publicidad|contradiccion|lectura)/.test(normalizedParagraph)) {
    score += 8;
  }

  if (paragraph.length >= 180 && paragraph.length <= 1200) score += 2;

  return score;
}

function pickRelevantExtract(text = "", query = "") {
  const clean = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return "";

  const paragraphs = clean
    .split(/(?<=[.!?;:])\s+(?=[A-ZÁÉÍÓÚÑ0-9])/)
    .map(part => part.trim())
    .filter(part => part.length >= 80);

  const best = paragraphs
    .map(paragraph => ({
      paragraph,
      score: scoreParagraph(paragraph, query)
    }))
    .sort((a, b) => b.score - a.score)[0];

  return (best?.paragraph || clean)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1100);
}

async function fetchOfficialPathText(source = {}) {
  if (!source.officialPath) return "";

  const fileName = source.fileName || source.officialPath.split("/").pop() || "providencia";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(`${CSJ_BACKEND_URL}/downloadFile`, {
    method: "POST",
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ path: source.officialPath })
  });
  clearTimeout(timeout);

  if (!response.ok) return "";

  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType = getMimeTypeFromFileName(fileName);

  if (/\.doc$/i.test(fileName)) {
    return stripHtml(buffer.toString("latin1"));
  }

  return extractDocumentText({
    buffer,
    mimetype: mimeType,
    originalname: fileName
  }, {
    maxChars: 45000
  });
}

async function fetchWebPageText(url = "") {
  if (!url) return "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      "User-Agent": "LitigARG/1.0"
    }
  });
  clearTimeout(timeout);

  if (!response.ok) return "";

  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());

  if (contentType.includes("pdf") || /\.pdf($|\?)/i.test(url)) {
    return extractDocumentText({
      buffer,
      mimetype: "application/pdf",
      originalname: "fuente.pdf"
    }, {
      maxChars: 45000
    });
  }

  return stripHtml(buffer.toString("utf8"));
}

async function enrichSourceWithExtract(source = {}, query = "") {
  try {
    if (["repository_search", "secondary_reference"].includes(source.sourceType)) {
      return source;
    }

    if (source.sourceType === "law") {
      return {
        ...source,
        readStatus: "read",
        extractVerified: true,
        verifiedText: true
      };
    }

    const rawText = source.officialPath
      ? await fetchOfficialPathText(source)
      : source.url && /^https?:\/\//i.test(source.url)
        ? await fetchWebPageText(source.url)
        : "";
    const extracted = pickRelevantExtract(rawText, query);

    if (!rawText) {
      return {
        ...source,
        extract: "",
        readStatus: source.sourceType === "jurisprudence" ? "unread" : source.readStatus,
        extractVerified: false,
        verifiedText: false
      };
    }

    if (!extracted) {
      return {
        ...source,
        extract: "",
        readStatus: "read",
        readAt: new Date().toISOString(),
        extractVerified: false,
        verifiedText: true
      };
    }

    return {
      ...source,
      extract: extracted,
      snippet: extracted,
      readStatus: "read",
      readAt: new Date().toISOString(),
      extractVerified: true,
      verifiedText: true
    };
  } catch {
    return {
      ...source,
      extract: "",
      readStatus: source.sourceType === "jurisprudence" ? "unread" : source.readStatus,
      extractVerified: false,
      verifiedText: false
    };
  }
}

async function enrichSourcesWithExtracts(sources = [], query = "") {
  const enriched = await Promise.all(
    sources.map(source => enrichSourceWithExtract(source, query))
  );

  return enriched
    .map(source => ({
      ...source,
      relevanceScore: scoreSource(source, query)
    }))
    .filter(source => isSourcePertinent(source, query) || ["repository_search", "secondary_reference"].includes(source.sourceType))
    .sort((a, b) => b.relevanceScore - a.relevanceScore || Number(b.year || 0) - Number(a.year || 0));
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

function getSpoaStructuralCandidates(query = "") {
  const intent = getQueryIntent(query);

  if (!intent.mentionsSpoaStructure) {
    return [];
  }

  return [
    {
      title: "Corte Constitucional, Sentencia C-591 de 2005",
      url: CC_RELATORIA_URL + "/2005/C-591-05.htm",
      corporation: "Corte Constitucional",
      room: "Sala Plena",
      year: 2005,
      sourceType: "jurisprudence",
      verified: true,
      official: true,
      citationVerified: true,
      extract: "",
      snippet: "Sentencia estructural sobre el modelo con tendencia acusatoria introducido por la Ley 906 de 2004, garantias del procesado, derechos de las victimas y separacion de funciones."
    },
    {
      title: "Corte Constitucional, Sentencia C-025 de 2009",
      url: CC_RELATORIA_URL + "/2009/C-025-09.htm",
      corporation: "Corte Constitucional",
      room: "Sala Plena",
      year: 2009,
      sourceType: "jurisprudence",
      verified: true,
      official: true,
      citationVerified: true,
      extract: "",
      snippet: "Decision sobre juez de control de garantias, control judicial de afectaciones a derechos fundamentales, legalidad y proporcionalidad."
    },
    {
      title: "Corte Constitucional, Sentencia C-1194 de 2005",
      url: CC_RELATORIA_URL + "/2005/C-1194-05.htm",
      corporation: "Corte Constitucional",
      room: "Sala Plena",
      year: 2005,
      sourceType: "jurisprudence",
      verified: true,
      official: true,
      citationVerified: true,
      extract: "",
      snippet: "Decision relevante sobre derecho de defensa dentro del sistema penal acusatorio y posibilidad de acudir ante el juez de control de garantias."
    },
    {
      title: "Corte Constitucional, Sentencia C-209 de 2007",
      url: CC_RELATORIA_URL + "/2007/C-209-07.htm",
      corporation: "Corte Constitucional",
      room: "Sala Plena",
      year: 2007,
      sourceType: "jurisprudence",
      verified: true,
      official: true,
      citationVerified: true,
      extract: "",
      snippet: "Decision estructural sobre la intervencion de las victimas en el sistema penal acusatorio."
    },
    {
      title: "Corte Suprema de Justicia, Sala Penal, SP3168-2017, radicado 44599",
      url: "https://cortesuprema.gov.co/corte/wp-content/uploads/2017/03/SP3168-201744599.pdf",
      corporation: "Corte Suprema de Justicia",
      room: "Sala de Casacion Penal",
      year: 2017,
      sourceType: "jurisprudence",
      verified: true,
      official: true,
      citationVerified: true,
      extract: "",
      snippet: "Decision estructural sobre hechos juridicamente relevantes, imputacion, acusacion y diferencia entre hechos, inferencias y medios de prueba."
    }
  ];
}

function getConstitutionalLineCandidates(query = "") {
  const intent = getQueryIntent(query);

  if (!intent.asksJurisprudentialLine || !intent.mentionsMinimumDose) {
    return [];
  }

  return [
    {
      title: "Corte Constitucional, Sentencia C-221 de 1994",
      url: `${CC_RELATORIA_URL}/1994/C-221-94.htm`,
      corporation: "Corte Constitucional",
      room: "Sala Plena",
      year: 1994,
      sourceType: "jurisprudence",
      verified: true,
      official: true,
      citationVerified: true,
      extract: "",
      snippet: "Sentencia fundacional sobre dosis personal, libre desarrollo de la personalidad y limites del poder punitivo."
    },
    {
      title: "Corte Constitucional, Sentencia C-491 de 2012",
      url: `${CC_RELATORIA_URL}/2012/C-491-12.htm`,
      corporation: "Corte Constitucional",
      room: "Sala Plena",
      year: 2012,
      sourceType: "jurisprudence",
      verified: true,
      official: true,
      citationVerified: true,
      extract: "",
      snippet: "Decision relacionada con porte de sustancias estupefacientes, dosis personal y finalidad de consumo."
    },
    {
      title: "Corte Constitucional, Sentencia C-253 de 2019",
      url: `${CC_RELATORIA_URL}/2019/C-253-19.htm`,
      corporation: "Corte Constitucional",
      room: "Sala Plena",
      year: 2019,
      sourceType: "jurisprudence",
      verified: true,
      official: true,
      citationVerified: true,
      extract: "",
      snippet: "Decision sobre restricciones policivas al consumo de sustancias psicoactivas y tension con derechos fundamentales."
    }
  ];
}

export function getBreachOfTrustCandidates(query = "") {
  if (!getQueryIntent(query).mentionsBreachOfTrust) return [];

  return [
    {
      title: "Corte Suprema de Justicia, Sala Penal, SP1147-2022, radicado 60411",
      url: "https://cortesuprema.gov.co/corte/wp-content/uploads/relatorias/pe/b1may2022/SP1147-2022%2860411%29.pdf",
      corporation: "Corte Suprema de Justicia",
      room: "Sala de Casacion Penal",
      year: 2022,
      sourceType: "jurisprudence",
      verified: true,
      official: true,
      citationVerified: true,
      extract: "",
      snippet: "Decision sobre abuso de confianza, administracion de dineros y alcance del titulo no traslativo de dominio como forma de mera tenencia."
    },
    {
      title: "Corte Suprema de Justicia, Sala Penal, casacion 59422, decision del 27 de agosto de 2021",
      url: "https://cortesuprema.gov.co/corte/wp-content/uploads/not/penal21/avisos/59422casacion27082021.pdf",
      corporation: "Corte Suprema de Justicia",
      room: "Sala de Casacion Penal",
      year: 2021,
      sourceType: "jurisprudence",
      verified: true,
      official: true,
      citationVerified: true,
      extract: "",
      snippet: "Decision sobre los elementos del abuso de confianza y el momento de consumacion cuando se exterioriza por primera vez la apropiacion."
    }
  ];
}

async function searchCorteConstitucional(query) {
  const references = [...new Set(cleanText(query).match(/\b(?:SU|T|C)[-\s]?\d{1,4}[-\s]?\d{2,4}\b/gi) || [])];
  const sources = [];
  const lineCandidates = getConstitutionalLineCandidates(query);
  const spoaCandidates = getSpoaStructuralCandidates(query);
  const breachOfTrustCandidates = getBreachOfTrustCandidates(query);

  sources.push(...lineCandidates, ...spoaCandidates, ...breachOfTrustCandidates);

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
  const intent = getQueryIntent(query);
  const sources = PENAL_LAW_SOURCES
    .filter(source =>
      source.key === "ley_599_art_249"
        ? intent.mentionsBreachOfTrust
        : source.key === "ley_906_art_88"
        ? normalized.includes("devolucion") && /(arma|bien|bienes|incaut|ocupad|comiso)/.test(normalized)
        : source.key === "ley_599"
          ? intent.mentionsSubstantiveCriminalLaw
          : source.key === "ley_906"
            ? intent.mentionsProceduralLaw || intent.wantsReturnOfSeizedProperty || intent.mentionsDetentionMeasure || intent.mentionsDocumentaryEvidence
            : source.key === "ley_600"
              ? intent.mentionsLaw600
              : source.key === "ley_1826"
                ? intent.mentionsAbbreviatedProcedure
                : source.key === "ley_1908"
                  ? intent.mentionsOrganizedCrime
                  : source.keywords.some(keyword => normalized.includes(normalizeText(keyword)))
    )
    .map(source => ({
      ...source,
      sourceType: "law",
      verified: true,
      official: true,
      extract: source.extract || `Fuente normativa oficial colombiana: ${source.title}. Utilizala solo si responde al problema juridico concreto del usuario.`,
      snippet: source.snippet || `Norma penal colombiana disponible en Secretaria del Senado: ${source.title}.`
    }));

  if (!sources.length && shouldSearchJurisprudence(query) && !(intent.asksJurisprudentialLine && intent.mentionsMinimumDose)) {
    const fallback = PENAL_LAW_SOURCES.find(source => source.key === "ley_906");

    if (fallback) {
      sources.push({
        ...fallback,
        sourceType: "law",
        verified: true,
        official: true,
        extract: "Fuente normativa procesal penal colombiana de consulta general. Usala solo si el problema juridico exige soporte procesal.",
        snippet: "Codigo de Procedimiento Penal colombiano."
      });
    }
  }

  return sources.slice(0, 3);
}

function makeControlledSearchUrl(domain, query = "") {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${domain} ${cleanText(query)}`)}`;
}

function getRepositorySearchSources(query = "") {
  const normalized = normalizeText(query);
  const shouldIncludeLegislative = /(gaceta|proyecto de ley|senado|congreso|modifica|reforma|ley penal)/.test(normalized);
  const shouldIncludeSecondary = /(concepto|ambito juridico|noticia|actualidad|analisis|doctrina|linea jurisprudencial)/.test(normalized);
  const sources = [
    {
      title: "Corte Constitucional - Relatoria y buscador oficial",
      url: CC_RELATORIA_URL,
      officialSearchUrl: makeControlledSearchUrl("corteconstitucional.gov.co/relatoria", query),
      corporation: "Corte Constitucional",
      room: "Relatoria",
      sourceType: "repository_search",
      verified: false,
      official: true,
      extract: "Repositorio oficial colombiano para verificar sentencias de constitucionalidad, tutela y unificacion. No debe citarse como providencia especifica si no hay decision concreta identificada."
    },
    {
      title: "SUIN-Juriscol - Normativa y jurisprudencia colombiana",
      url: SUIN_URL,
      officialSearchUrl: makeControlledSearchUrl("suin-juriscol.gov.co", query),
      corporation: "SUIN-Juriscol",
      room: "Repositorio normativo colombiano",
      sourceType: "repository_search",
      verified: false,
      official: true,
      extract: "Repositorio oficial colombiano para contrastar normas, vigencias y documentos juridicos. Debe usarse como ruta de verificacion cuando no exista enlace directo a la norma o providencia."
    },
    {
      title: "Rama Judicial - Busqueda institucional colombiana",
      url: RAMA_JUDICIAL_URL,
      officialSearchUrl: makeControlledSearchUrl("ramajudicial.gov.co", query),
      corporation: "Rama Judicial",
      room: "Busqueda institucional",
      sourceType: "repository_search",
      verified: false,
      official: true,
      extract: "Repositorio institucional colombiano para ubicar informacion judicial, relatorias y documentos publicados por la Rama Judicial. No reemplaza la providencia concreta."
    }
  ];

  if (shouldIncludeLegislative) {
    sources.push({
      title: "Gacetas del Congreso/Senado - Reformas y proyectos de ley penal",
      url: SENADO_GACETAS_URL,
      officialSearchUrl: makeControlledSearchUrl("secretariasenado.gov.co/legibus/legibus/gacetas", query),
      corporation: "Secretaria del Senado",
      room: "Gacetas legislativas",
      sourceType: "repository_search",
      verified: false,
      official: true,
      extract: "Repositorio legislativo colombiano para rastrear proyectos, reformas y leyes modificatorias. Debe verificarse la gaceta o ley concreta antes de citarla."
    });
  }

  if (shouldIncludeSecondary) {
    sources.push({
      title: "Ambito Juridico - Fuente secundaria orientadora",
      url: AMBITO_JURIDICO_URL,
      officialSearchUrl: makeControlledSearchUrl("ambitojuridico.com", query),
      corporation: "Ambito Juridico",
      room: "Actualidad juridica",
      sourceType: "secondary_reference",
      verified: false,
      official: false,
      extract: "Fuente secundaria colombiana util para ubicar conceptos, noticias o pistas de jurisprudencia. No debe presentarse como autoridad judicial ni reemplazar fuentes oficiales."
    });
  }

  return sources.slice(0, 4);
}

export function formatSourcesForPrompt(sources = []) {
  if (!sources.length) return "";

  return sources
    .map((source, index) => {
      const parts = [
        `${index + 1}. ${source.title}`,
        source.sourceType ? `Tipo: ${source.sourceType}` : "",
        source.corporation ? `Corporacion: ${source.corporation}` : "",
        source.room ? `Sala: ${source.room}` : "",
        source.year ? `Ano: ${source.year}` : "",
        source.url ? `Enlace oficial: ${source.url}` : "",
        source.officialViewerUrl ? `Visor oficial: ${source.officialViewerUrl}` : "",
        source.officialSearchUrl ? `Busqueda oficial: ${source.officialSearchUrl}` : "",
        source.readStatus ? `Estado de lectura: ${source.readStatus}` : "",
        source.citationVerified ? "Cita con enlace oficial directo verificado: si" : "",
        source.extractVerified ? "Extracto verificado en el texto leido: si" : source.sourceType === "jurisprudence" ? "Extracto verificado en el texto leido: no" : "",
        source.topics?.length ? `Temas asociados: ${source.topics.join(", ")}` : "",
        source.extract && (source.extractVerified || source.sourceType === "law")
          ? `Extracto util para sustentar la respuesta: ${source.extract}`
          : "",
        source.snippet && !source.extract && source.sourceType !== "jurisprudence" ? `Fragmento orientador: ${source.snippet}` : "",
        ["repository_search", "secondary_reference"].includes(source.sourceType)
          ? "Advertencia: esta fuente es solo ruta de verificacion o pista secundaria; no debe citarse como sentencia ni como soporte jurisprudencial directo."
          : ""
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
    /\b(?:Corte Constitucional\s+)?(?:SU|T|C)[-\s]?\d{1,4}\s+de\s+\d{4}\b/gi,
    /\brad(?:icado)?\.?\s*\d{4,8}\b/gi
  ].forEach(pattern => {
    (text.match(pattern) || []).forEach(match => {
      const clean = match.replace(/\s+/g, " ").trim();
      aliases.add(clean);
      aliases.add(clean.replace(/([A-Z]{1,3})\s+/i, "$1-"));
      aliases.add(clean.replace(/([A-Z]{1,3})-/i, "$1 "));
      const longYearMatch = clean.match(/\b(SU|T|C)[-\s]?(\d{1,4})\s+de\s+(\d{4})\b/i);
      if (longYearMatch) {
        const type = longYearMatch[1].toUpperCase();
        const number = longYearMatch[2].padStart(3, "0");
        const year = longYearMatch[3];
        aliases.add(`${type}-${number}-${year.slice(-2)}`);
        aliases.add(`${type}-${number} de ${year}`);
        aliases.add(`${type}${number}-${year.slice(-2)}`);
      }
    });
  });

  const csjRadicado = text.match(/\b\d{5,8}\b/);
  if ((source.corporation || "").toLowerCase().includes("corte suprema") && csjRadicado) {
    aliases.add(csjRadicado[0]);
    aliases.add(`radicado ${csjRadicado[0]}`);
    aliases.add(`rad. ${csjRadicado[0]}`);
  }

  if (source.title && source.title.length <= 90) {
    aliases.add(normalizeReference(source.title));
  }

  if (source.sourceType === "law" || /Ley\s+\d+/i.test(source.title || "")) {
    const title = normalizeReference(source.title || "");
    const articleMatch = title.match(/articulo\s+(\d+)/i);
    const lawMatch = title.match(/ley\s+(\d+)\s+de\s+(\d{4})/i);

    if (lawMatch) {
      const law = lawMatch[1];
      const year = lawMatch[2];
      aliases.add(`Ley ${law}`);
      aliases.add(`Ley ${law} de ${year}`);
    }

    if (articleMatch && lawMatch) {
      const article = articleMatch[1];
      const law = lawMatch[1];
      const year = lawMatch[2];
      const accentedArticle = `art${String.fromCharCode(237)}culo`;
      [
        `articulo ${article}`,
        `articulo ${article} Ley ${law}`,
        `articulo ${article} de la Ley ${law}`,
        `articulo ${article} Ley ${law} de ${year}`,
        `articulo ${article} de la Ley ${law} de ${year}`,
        `Ley ${law} articulo ${article}`,
        `Ley ${law} de ${year} articulo ${article}`,
        `Ley ${law} de ${year}, articulo ${article}`,
        `${accentedArticle} ${article}`,
        `${accentedArticle} ${article} Ley ${law}`,
        `${accentedArticle} ${article} de la Ley ${law}`,
        `${accentedArticle} ${article} Ley ${law} de ${year}`,
        `${accentedArticle} ${article} de la Ley ${law} de ${year}`,
        `Ley ${law} ${accentedArticle} ${article}`,
        `Ley ${law} de ${year} ${accentedArticle} ${article}`,
        `Ley ${law} de ${year}, ${accentedArticle} ${article}`
      ].forEach(alias => aliases.add(alias));
    }
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
  const allowedSourceUrls = new Set(
    (Array.isArray(sources) ? sources : [])
      .flatMap(source => [source?.url, source?.officialViewerUrl])
      .filter(Boolean)
  );

  linkedAnswer = linkedAnswer.replace(/\s*\[Fuente oficial\]\((https?:\/\/[^)\s]+)\)/gi, (fullMatch, url) => {
    return allowedSourceUrls.has(url) ? fullMatch : "";
  });

  (Array.isArray(sources) ? sources : [])
    .filter(source => source?.url && !["repository_search", "secondary_reference"].includes(source.sourceType))
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

function normalizedCitationText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function findUnsupportedJudicialCitations(answer = "", sources = []) {
  const allowedText = (Array.isArray(sources) ? sources : [])
    .filter(source => source?.sourceType === "jurisprudence")
    .map(source => [source.title, source.citation, source.caseNumber, source.radicado, source.url].filter(Boolean).join(" "))
    .join(" ");
  const allowed = normalizedCitationText(allowedText);
  const text = String(answer || "");
  const candidates = new Set();
  const decisionPattern = /\b(?:CSJ\s+)?(?:SP|AP|SC|STC|SL|SU|C|T)[-\s]?\d{2,7}[-\s]\d{4}\b/gi;
  const docketPattern = /\b(?:rad(?:icado)?\.?\s*(?:n[.º°o]\s*)?)(\d{4,9})\b/gi;

  for (const match of text.matchAll(decisionPattern)) candidates.add(match[0]);
  for (const match of text.matchAll(docketPattern)) candidates.add(match[0]);

  return [...candidates].filter(candidate => {
    const normalized = normalizedCitationText(candidate);
    const withoutCorporation = normalized.replace(/^csj/, "");
    const numeric = candidate.match(/\d{4,9}/)?.[0] || "";
    return !allowed.includes(normalized) &&
      !allowed.includes(withoutCorporation) &&
      !(numeric.length >= 5 && allowed.includes(numeric));
  });
}

export function enforceVerifiedJudicialCitations(answer = "", sources = []) {
  const unsupported = findUnsupportedJudicialCitations(answer, sources);
  if (!unsupported.length) return String(answer || "");

  const unsafe = unsupported.map(normalizedCitationText);
  const safeBlocks = String(answer || "").split(/\n{2,}/).filter(block => {
    const normalized = normalizedCitationText(block);
    return !unsafe.some(citation => normalized.includes(citation));
  });
  const notice = "Nota de verificacion: se omitieron referencias jurisprudenciales que no pudieron validarse en las fuentes oficiales recuperadas para esta consulta.";
  return [...safeBlocks, notice].filter(Boolean).join("\n\n");
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
  const searchPlan = buildSearchQueries(query);
  const repositorySearchSources = getRepositorySearchSources(query);
  const directSources = [...statutorySources, ...constitutionalSources, ...normalizedCsjSources]
    .slice(0, MAX_SOURCES_FOR_ANSWER);
  const selectedSources = [
    ...directSources,
    ...repositorySearchSources.slice(0, Math.max(0, MAX_SOURCES_FOR_ANSWER - directSources.length))
  ];
  const sources = await enrichSourcesWithExtracts(selectedSources, query);
  const intent = getQueryIntent(query);
  const answerSources = sources.filter(source =>
    source.sourceType === "law" ||
    (source.sourceType === "jurisprudence" && source.readStatus === "read" && source.extractVerified && hasStrongIntentMatch(source, query)) ||
    (source.sourceType === "jurisprudence" && source.citationVerified && hasStrongIntentMatch(source, query))
  ).sort((a, b) => intent.asksJurisprudentialLine
    ? Number(a.year || 0) - Number(b.year || 0)
    : Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0)
  );

  return {
    configured: true,
    provider: "official-repositories",
    answer: answerSources.length
      ? "Busqueda realizada en repositorios oficiales disponibles, con lectura y seleccion de extractos utiles cuando fue posible."
      : "No encontre una fuente oficial verificable con esta consulta inicial.",
    searchPlan,
    sources,
    answerSources,
    officialSources: sources.filter(source => source.official),
    needsOfficialVerification: sources.some(source => !source.verified),
    errors
  };
}
