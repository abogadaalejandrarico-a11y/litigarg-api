import test from "node:test";
import assert from "node:assert/strict";
import {
  enforceVerifiedJudicialCitations,
  findUnsupportedJudicialCitations
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
