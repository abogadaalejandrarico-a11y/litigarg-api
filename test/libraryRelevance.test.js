import test from "node:test";
import assert from "node:assert/strict";
import { getLibrarySearchTerms } from "../src/services/documentLibrary.js";

test("removes generic document-analysis words from library searches", () => {
  const terms = getLibrarySearchTerms(
    "Analiza este documento e indícame qué delito se configura según los hechos jurídicamente relevantes. DENUNCIA HEMILY HERNÁNDEZ.pdf PDF escaneado para lectura visual"
  );

  assert.deepEqual(terms, ["hemily", "hernandez"]);
});

test("preserves specific legal concepts for retrieval", () => {
  const terms = getLibrarySearchTerms("Diferencia entre hurto y abuso de confianza por entrega previa");
  assert.deepEqual(terms, ["diferencia", "hurto", "abuso", "confianza", "entrega", "previa"]);
});
