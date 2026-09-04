import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVerifiedSourcesFallback,
  enforceVerifiedJudicialCitations,
  findUnsupportedJudicialCitations,
  findUnsupportedStatutoryReferences,
  getBreachOfTrustCandidates
} from "../src/services/jurisprudenceSearch.js";

const verifiedSources = [{
  sourceType: "jurisprudence",
  title: "CSJ SP1234-2024, radicado 65432",
  citation: "SP1234-2024",
  url: "https://www.cortesuprema.gov.co/decision-65432"
}];

test("permite solamente providencias presentes en las fuentes verificadas", () => {
  const answer = "La CSJ SP1234-2024, radicado 65432, contiene una subregla aplicable.";
  assert.deepEqual(findUnsupportedJudicialCitations(answer, verifiedSources), []);
  assert.equal(enforceVerifiedJudicialCitations(answer, verifiedSources), answer);
});

test("detecta y omite bloques con providencias no verificadas", () => {
  const answer = [
    "Los hechos deben examinarse sin anticipar responsabilidad.",
    "La CSJ AP948-2018, radicado 51882, supuestamente resolvio el mismo problema.",
    "La conclusion permanece condicionada a la prueba."
  ].join("\n\n");

  const unsupported = findUnsupportedJudicialCitations(answer, verifiedSources);
  assert.ok(unsupported.some(value => value.includes("AP948-2018")));
  assert.ok(unsupported.some(value => value.includes("51882")));

  const cleaned = enforceVerifiedJudicialCitations(answer, verifiedSources);
  assert.match(cleaned, /Los hechos deben examinarse/);
  assert.match(cleaned, /La conclusion permanece/);
  assert.doesNotMatch(cleaned, /AP948-2018|51882/);
  assert.match(cleaned, /Nota de verificacion/);
});

test("no confunde leyes con providencias judiciales", () => {
  const answer = "Son relevantes los articulos 239 y 249 de la Ley 599 de 2000.";
  assert.deepEqual(findUnsupportedJudicialCitations(answer, []), []);
});

test("mantiene fuentes oficiales controladas para abuso de confianza", () => {
  const sources = getBreachOfTrustCandidates("linea jurisprudencial del abuso de confianza");
  assert.equal(sources.length, 2);
  assert.ok(sources.every(source => source.official && source.citationVerified));
  assert.ok(sources.some(source => source.title.includes("SP1147-2022")));
  assert.ok(sources.some(source => source.title.includes("59422")));
});

test("rechaza un articulo penal distinto del articulo especifico verificado", () => {
  const lawSources = [{
    sourceType: "law",
    title: "Ley 599 de 2000, articulo 249 - Abuso de confianza",
    extract: "El articulo 249 regula el abuso de confianza."
  }];
  assert.deepEqual(findUnsupportedStatutoryReferences("El delito esta en el articulo 246 del Codigo Penal.", lawSources), ["articulo 246 del Codigo Penal"]);
  assert.deepEqual(findUnsupportedStatutoryReferences("El delito esta en el articulo 249 del Codigo Penal.", lawSources), []);
});

test("construye una respuesta completa directamente desde fichas verificadas", () => {
  const sources = [
    { sourceType: "law", title: "Ley 599 de 2000, articulo 249 - Abuso de confianza", url: "https://oficial/249", extract: "Regla legal verificada." },
    ...getBreachOfTrustCandidates("abuso de confianza")
  ];
  const answer = buildVerifiedSourcesFallback("linea jurisprudencial abuso de confianza", sources);
  assert.match(answer, /Marco normativo verificado/);
  assert.match(answer, /SP1147-2022/);
  assert.match(answer, /59422/);
  assert.match(answer, /Lectura conjunta/);
  assert.doesNotMatch(answer, /articulo 246/i);
});
