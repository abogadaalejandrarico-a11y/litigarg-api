import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const openaiSource = await readFile(new URL("../src/services/openai.js", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../src/routes/gpt.js", import.meta.url), "utf8");

test("mantiene el modelo economico para consultas generales", () => {
  assert.match(openaiSource, /GENERAL_MODEL = "gpt-4o-mini"/);
  assert.match(openaiSource, /model: GENERAL_MODEL/);
});

test("reserva razonamiento medio para documentos e imagenes", () => {
  assert.match(openaiSource, /DOCUMENT_ANALYSIS_MODEL = "gpt-5\.4-mini"/);
  assert.match(openaiSource, /DOCUMENT_REASONING_EFFORT = "medium"/);
  assert.equal((openaiSource.match(/model: DOCUMENT_ANALYSIS_MODEL/g) || []).length, 4);
  assert.equal((openaiSource.match(/reasoning: \{ effort: DOCUMENT_REASONING_EFFORT \}/g) || []).length, 3);
  assert.match(openaiSource, /extraerContextoJuridicoParaBusqueda[\s\S]*reasoning: \{ effort: "low" \}/);
});

test("enruta texto documental, imagenes y PDF escaneados al modelo avanzado", () => {
  assert.match(routeSource, /generarRespuestaLegalConImagen\(req\.file, message, answerOptions\)/);
  assert.match(routeSource, /generarRespuestaLegalConDocumento\(req\.file, message, answerOptions\)/);
  assert.match(routeSource, /generarRespuestaLegalConTextoDocumento\(message, answerOptions\)/);
});

test("las consultas jurisprudenciales se sintetizan desde fichas verificadas", () => {
  assert.match(openaiSource, /generarAnalisisDesdeFichasVerificadas/);
  assert.match(openaiSource, /Para citar usa solamente los marcadores exactos \[F1\], \[F2\]/);
  assert.match(routeSource, /sourceLedAnswer\.replace\(\/\\\[F\(\\d\+\)\\\]\//);
});

test("el protocolo impide conclusiones penales automaticas", () => {
  assert.match(openaiSource, /hipotesis plausibles/i);
  assert.match(openaiSource, /hurto y abuso de confianza/i);
  assert.match(openaiSource, /falta de prueba sobre entrega previa no demuestra/i);
  assert.match(openaiSource, /no elijas hurto como hipotesis principal/i);
  assert.match(openaiSource, /controversia civil, familiar, posesoria o sucesoral/i);
  assert.match(openaiSource, /No infieras parentescos/i);
  assert.match(openaiSource, /presuncion de inocencia/i);
  assert.match(openaiSource, /No inventes coautores/i);
  assert.match(openaiSource, /conclusion juridica provisional y condicionada/i);
});
